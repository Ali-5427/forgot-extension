"""Forgot AI backend — mimics InsForge API surface for the Chrome extension.

Provides:
- POST /api/auth/signup, /api/auth/login, /api/auth/logout, GET /api/auth/me
- POST /api/memories (with silent dedupe + background AI enrichment)
- GET  /api/memories, /api/memories/{id}

AI enrichment is triggered as a FastAPI BackgroundTask that:
1. Sets processing_status=processing
2. Calls Claude Haiku 4.5 via emergentintegrations with a structured-JSON prompt
3. On success -> processing_status=done, fills ai_title/summary/topics/keywords/entities
4. On failure -> 1 auto-retry, then processing_status=failed (original memory intact)
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, List, Optional
from urllib.parse import urlparse

import bcrypt
import jwt
from dotenv import load_dotenv
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    FastAPI,
    HTTPException,
    status,
)
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ.get("JWT_SECRET", "forgot-ai-dev-secret-change-me")
JWT_ALG = "HS256"
JWT_TTL_DAYS = 30
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("forgot-ai")

app = FastAPI(title="Forgot AI Backend")
api = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: EmailStr
    created_at: str


class AuthResponse(BaseModel):
    token: str
    user: UserOut


class MemoryIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    capture_type: str = Field(pattern="^(highlight|content)$")
    original_content: str = Field(min_length=1, max_length=100_000)
    source_url: str
    source_title: Optional[str] = ""
    source_domain: Optional[str] = ""


class MemoryOut(BaseModel):
    id: str
    user_id: str
    capture_type: str
    original_content: str
    source_url: str
    source_title: str
    source_domain: str
    content_hash: str
    ai_title: Optional[str] = None
    ai_summary: Optional[str] = None
    ai_topics: List[str] = []
    ai_keywords: List[str] = []
    ai_entities: List[str] = []
    processing_status: str
    created_at: str
    updated_at: str
    deduped: bool = False


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def _verify_pw(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def _make_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_TTL_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def _decode_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        return payload.get("sub")
    except Exception:
        return None


def _content_hash(text: str) -> str:
    normalized = re.sub(r"\s+", " ", text or "").strip().lower()
    return hashlib.sha256(normalized.encode()).hexdigest()


def _domain_of(url: str) -> str:
    try:
        return urlparse(url).netloc or ""
    except Exception:
        return ""


async def current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
) -> dict:
    if not creds or creds.scheme.lower() != "bearer":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    uid = _decode_token(creds.credentials)
    if not uid:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    user = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    return user


def _memory_to_out(doc: dict, deduped: bool = False) -> MemoryOut:
    doc = {k: v for k, v in doc.items() if k != "_id"}
    doc.setdefault("ai_topics", [])
    doc.setdefault("ai_keywords", [])
    doc.setdefault("ai_entities", [])
    return MemoryOut(**doc, deduped=deduped)


# ---------------------------------------------------------------------------
# AI enrichment (background task)
# ---------------------------------------------------------------------------
ENRICHMENT_SYSTEM = (
    "You extract structured metadata from short web captures (highlights, tweets, "
    "AI responses, article excerpts). Reply ONLY with a compact JSON object. "
    "Keys: title (<=80 chars, plain text, no quotes), summary (1-2 sentences, <=280 chars), "
    "topics (array of 1-5 short lowercase tags), keywords (array of 3-8 lowercase noun phrases), "
    "entities (array of proper nouns / people / orgs / products, may be empty). "
    "Do not wrap in markdown. Do not add commentary."
)


def _parse_llm_json(raw: str) -> dict:
    raw = (raw or "").strip()
    # strip possible ```json fences
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    # find first {...} block
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    if m:
        raw = m.group(0)
    return json.loads(raw)


async def _call_llm(content: str, source_url: str, source_title: str) -> dict:
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    if not EMERGENT_LLM_KEY:
        raise RuntimeError("EMERGENT_LLM_KEY missing")

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"enrich-{uuid.uuid4()}",
        system_message=ENRICHMENT_SYSTEM,
    ).with_model("anthropic", "claude-haiku-4-5-20251001")

    prompt = (
        f"Source URL: {source_url}\n"
        f"Source title: {source_title or '(none)'}\n\n"
        f"Content:\n{content[:6000]}"
    )
    msg = UserMessage(text=prompt)
    reply = await chat.send_message(msg)
    text = reply if isinstance(reply, str) else str(reply)
    data = _parse_llm_json(text)

    def _slist(v: Any, limit: int) -> List[str]:
        if not isinstance(v, list):
            return []
        out = []
        for item in v:
            if isinstance(item, str) and item.strip():
                out.append(item.strip()[:64])
            if len(out) >= limit:
                break
        return out

    return {
        "ai_title": str(data.get("title", ""))[:120].strip(),
        "ai_summary": str(data.get("summary", ""))[:400].strip(),
        "ai_topics": _slist(data.get("topics"), 5),
        "ai_keywords": _slist(data.get("keywords"), 8),
        "ai_entities": _slist(data.get("entities"), 10),
    }


async def enrich_memory(memory_id: str) -> None:
    """Background enrichment: mark processing -> call LLM -> mark done/failed with 1 retry."""
    mem = await db.memories.find_one({"id": memory_id})
    if not mem:
        return
    await db.memories.update_one(
        {"id": memory_id},
        {"$set": {"processing_status": "processing", "updated_at": _now_iso()}},
    )
    last_err: Optional[str] = None
    for attempt in (1, 2):
        try:
            enriched = await _call_llm(
                mem["original_content"], mem["source_url"], mem.get("source_title", "")
            )
            await db.memories.update_one(
                {"id": memory_id},
                {
                    "$set": {
                        **enriched,
                        "processing_status": "done",
                        "updated_at": _now_iso(),
                    }
                },
            )
            logger.info("enriched memory %s on attempt %s", memory_id, attempt)
            return
        except Exception as e:  # noqa: BLE001
            last_err = str(e)
            logger.warning("enrichment attempt %s failed for %s: %s", attempt, memory_id, e)

    await db.memories.update_one(
        {"id": memory_id},
        {
            "$set": {
                "processing_status": "failed",
                "processing_error": (last_err or "unknown")[:400],
                "updated_at": _now_iso(),
            }
        },
    )


# ---------------------------------------------------------------------------
# Routes — auth
# ---------------------------------------------------------------------------
@api.get("/")
async def root():
    return {"service": "forgot-ai", "status": "ok"}


@api.post("/auth/signup", response_model=AuthResponse)
async def signup(body: SignupIn):
    email = body.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    user = {
        "id": str(uuid.uuid4()),
        "email": email,
        "password_hash": _hash_pw(body.password),
        "created_at": _now_iso(),
    }
    await db.users.insert_one(user)
    token = _make_token(user["id"])
    return AuthResponse(
        token=token,
        user=UserOut(id=user["id"], email=user["email"], created_at=user["created_at"]),
    )


@api.post("/auth/login", response_model=AuthResponse)
async def login(body: LoginIn):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not _verify_pw(body.password, user["password_hash"]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    token = _make_token(user["id"])
    return AuthResponse(
        token=token,
        user=UserOut(id=user["id"], email=user["email"], created_at=user["created_at"]),
    )


@api.post("/auth/logout")
async def logout(user: dict = Depends(current_user)):
    # Stateless JWT — client just discards. Endpoint exists for symmetry.
    return {"ok": True}


@api.get("/auth/me", response_model=UserOut)
async def me(user: dict = Depends(current_user)):
    return UserOut(id=user["id"], email=user["email"], created_at=user["created_at"])


# ---------------------------------------------------------------------------
# Routes — memories
# ---------------------------------------------------------------------------
@api.post("/memories", response_model=MemoryOut)
async def create_memory(
    body: MemoryIn,
    background: BackgroundTasks,
    user: dict = Depends(current_user),
):
    chash = _content_hash(body.original_content)
    # Silent dedupe on (user_id, source_url, content_hash)
    existing = await db.memories.find_one(
        {"user_id": user["id"], "source_url": body.source_url, "content_hash": chash}
    )
    if existing:
        return _memory_to_out(existing, deduped=True)

    now = _now_iso()
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "capture_type": body.capture_type,
        "original_content": body.original_content,
        "source_url": body.source_url,
        "source_title": body.source_title or "",
        "source_domain": body.source_domain or _domain_of(body.source_url),
        "content_hash": chash,
        "ai_title": None,
        "ai_summary": None,
        "ai_topics": [],
        "ai_keywords": [],
        "ai_entities": [],
        "processing_status": "pending",
        "created_at": now,
        "updated_at": now,
    }
    await db.memories.insert_one(doc)
    if EMERGENT_LLM_KEY:
        background.add_task(enrich_memory, doc["id"])
    else:
        logger.warning("EMERGENT_LLM_KEY not set — skipping enrichment for %s", doc["id"])
    return _memory_to_out(doc, deduped=False)


@api.get("/memories", response_model=List[MemoryOut])
async def list_memories(user: dict = Depends(current_user)):
    cur = db.memories.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).limit(200)
    docs = await cur.to_list(200)
    return [_memory_to_out(d) for d in docs]


@api.get("/memories/{memory_id}", response_model=MemoryOut)
async def get_memory(memory_id: str, user: dict = Depends(current_user)):
    doc = await db.memories.find_one({"id": memory_id, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    return _memory_to_out(doc)


# ---------------------------------------------------------------------------
# Wire up
# ---------------------------------------------------------------------------
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _startup():
    await db.users.create_index("email", unique=True)
    await db.memories.create_index(
        [("user_id", 1), ("source_url", 1), ("content_hash", 1)], unique=True
    )
    await db.memories.create_index([("user_id", 1), ("created_at", -1)])
    logger.info("Forgot AI backend ready — LLM=%s", "on" if EMERGENT_LLM_KEY else "off")


@app.on_event("shutdown")
async def _shutdown():
    client.close()
