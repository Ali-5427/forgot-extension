"""Latency-sensitive backend smoke tests for Forgot AI."""
import time
import uuid
import requests

BASE = "https://quick-save-ai-1.preview.emergentagent.com/api"

results = {"passed": [], "failed": []}

def check(name, cond, evidence=""):
    if cond:
        results["passed"].append(name)
        print(f"PASS: {name}")
    else:
        results["failed"].append({"area": name, "issue": "assertion failed", "evidence": evidence, "priority": "HIGH"})
        print(f"FAIL: {name} :: {evidence}")

def main():
    # ---- Auth ----
    email1 = f"t1_{uuid.uuid4().hex[:8]}@test.io"
    email2 = f"t2_{uuid.uuid4().hex[:8]}@test.io"
    pw = "Passw0rd!"

    # Signup u1
    r = requests.post(f"{BASE}/auth/signup", json={"email": email1, "password": pw}, timeout=15)
    check("signup 200", r.status_code == 200, f"code={r.status_code} body={r.text[:200]}")
    j1 = r.json() if r.ok else {}
    token1 = j1.get("token", "")
    uid1 = j1.get("user", {}).get("id")
    check("signup returns token+user.id+email+created_at",
          bool(token1) and bool(uid1) and j1.get("user", {}).get("email") == email1 and j1.get("user", {}).get("created_at"),
          str(j1)[:200])

    # Duplicate signup -> 409
    r = requests.post(f"{BASE}/auth/signup", json={"email": email1, "password": pw}, timeout=15)
    check("duplicate signup 409", r.status_code == 409, f"code={r.status_code}")

    # Login wrong password
    r = requests.post(f"{BASE}/auth/login", json={"email": email1, "password": "wrongPW1!"}, timeout=15)
    check("login wrong pw 401", r.status_code == 401, f"code={r.status_code}")

    # Login unknown email
    r = requests.post(f"{BASE}/auth/login", json={"email": "nope_" + email1, "password": pw}, timeout=15)
    check("login unknown email 401", r.status_code == 401, f"code={r.status_code}")

    # Login correct
    r = requests.post(f"{BASE}/auth/login", json={"email": email1, "password": pw}, timeout=15)
    check("login ok 200", r.status_code == 200 and r.json().get("token"), f"code={r.status_code}")

    # /auth/me valid
    h1 = {"Authorization": f"Bearer {token1}"}
    r = requests.get(f"{BASE}/auth/me", headers=h1, timeout=15)
    check("me valid 200", r.status_code == 200 and r.json().get("id") == uid1, f"code={r.status_code} body={r.text[:200]}")

    # /auth/me invalid
    r = requests.get(f"{BASE}/auth/me", headers={"Authorization": "Bearer garbage"}, timeout=15)
    check("me invalid 401", r.status_code == 401, f"code={r.status_code}")

    # /auth/me missing
    r = requests.get(f"{BASE}/auth/me", timeout=15)
    check("me missing 401", r.status_code == 401, f"code={r.status_code}")

    # logout valid
    r = requests.post(f"{BASE}/auth/logout", headers=h1, timeout=15)
    check("logout valid 200 ok:true", r.status_code == 200 and r.json().get("ok") is True, f"code={r.status_code}")

    # logout no token
    r = requests.post(f"{BASE}/auth/logout", timeout=15)
    check("logout missing 401", r.status_code == 401, f"code={r.status_code}")

    # ---- Memories ----
    url_a = "https://example.com/article-a"
    content = "  Hello   WORLD, this  is  a   test capture about Python and FastAPI.  "

    # capture_type invalid -> 422
    r = requests.post(f"{BASE}/memories", headers=h1, json={
        "capture_type": "invalid_type", "original_content": "x", "source_url": url_a
    }, timeout=15)
    check("capture_type validation 422", r.status_code == 422, f"code={r.status_code}")

    # Create memory 1
    r = requests.post(f"{BASE}/memories", headers=h1, json={
        "capture_type": "highlight",
        "original_content": content,
        "source_url": url_a,
        "source_title": "Test Article",
    }, timeout=15)
    check("create memory 200", r.status_code == 200, f"code={r.status_code} body={r.text[:200]}")
    m1 = r.json() if r.ok else {}
    mem1_id = m1.get("id")
    check("initial status pending", m1.get("processing_status") in ("pending", "processing"), f"status={m1.get('processing_status')}")
    check("deduped=false on first", m1.get("deduped") is False, str(m1.get("deduped")))

    # Silent dedupe: repeat exact same
    r = requests.post(f"{BASE}/memories", headers=h1, json={
        "capture_type": "highlight",
        "original_content": content,
        "source_url": url_a,
        "source_title": "Test Article",
    }, timeout=15)
    m2 = r.json() if r.ok else {}
    check("dedupe same id", m2.get("id") == mem1_id, f"got={m2.get('id')} want={mem1_id}")
    check("dedupe=true on second", m2.get("deduped") is True, str(m2.get("deduped")))

    # Whitespace/case insensitive dedupe
    r = requests.post(f"{BASE}/memories", headers=h1, json={
        "capture_type": "highlight",
        "original_content": "hello world, THIS is a test capture about python and fastapi.",
        "source_url": url_a,
    }, timeout=15)
    m3 = r.json() if r.ok else {}
    check("ws-insensitive dedupe same id", m3.get("id") == mem1_id, f"got={m3.get('id')}")
    check("ws-insensitive deduped=true", m3.get("deduped") is True, str(m3))

    # Different URL -> NOT dedupe
    r = requests.post(f"{BASE}/memories", headers=h1, json={
        "capture_type": "highlight",
        "original_content": content,
        "source_url": "https://example.com/article-b",
    }, timeout=15)
    m4 = r.json() if r.ok else {}
    check("different url creates new id", m4.get("id") and m4.get("id") != mem1_id, f"got={m4.get('id')}")
    check("different url deduped=false", m4.get("deduped") is False, str(m4.get("deduped")))

    # List count = 2
    r = requests.get(f"{BASE}/memories", headers=h1, timeout=15)
    lst = r.json() if r.ok else []
    check("list has exactly 2", len(lst) == 2, f"len={len(lst)}")
    check("newest first ordering", len(lst) >= 2 and lst[0]["created_at"] >= lst[1]["created_at"], "ordering")

    # ---- Cross-user isolation ----
    r = requests.post(f"{BASE}/auth/signup", json={"email": email2, "password": pw}, timeout=15)
    token2 = r.json().get("token")
    h2 = {"Authorization": f"Bearer {token2}"}
    r = requests.get(f"{BASE}/memories", headers=h2, timeout=15)
    check("user2 sees empty list", r.status_code == 200 and r.json() == [], f"body={r.text[:100]}")

    r = requests.get(f"{BASE}/memories/{mem1_id}", headers=h2, timeout=15)
    check("user2 GET user1 memory 404", r.status_code == 404, f"code={r.status_code}")

    # ---- Enrichment polling ----
    print("Polling for enrichment...")
    final_status = None
    ai_title = ""
    for i in range(15):  # up to ~45s
        time.sleep(3)
        r = requests.get(f"{BASE}/memories/{mem1_id}", headers=h1, timeout=15)
        if r.ok:
            d = r.json()
            final_status = d.get("processing_status")
            ai_title = d.get("ai_title") or ""
            print(f"  attempt {i+1}: status={final_status} title={ai_title[:40]}")
            if final_status == "done":
                doc = d
                break
    check("enrichment done", final_status == "done", f"final={final_status}")
    if final_status == "done":
        check("ai_title non-empty", bool(doc.get("ai_title")), str(doc.get("ai_title")))
        check("ai_summary non-empty", bool(doc.get("ai_summary")), str(doc.get("ai_summary")))
        check("ai_topics non-empty", isinstance(doc.get("ai_topics"), list) and len(doc.get("ai_topics")) > 0, str(doc.get("ai_topics")))
        check("ai_keywords non-empty", isinstance(doc.get("ai_keywords"), list) and len(doc.get("ai_keywords")) > 0, str(doc.get("ai_keywords")))

    print("\n=== SUMMARY ===")
    print(f"Passed: {len(results['passed'])}")
    print(f"Failed: {len(results['failed'])}")
    for f in results["failed"]:
        print(f"  - {f}")

main()
