// Forgot AI — InsForge server function: process_memory(memory_id)
//
// Deploy as an InsForge server function (Deno / TS runtime). Trigger it from
// a database webhook or from the extension immediately after insert.
//
// Secrets (set in the InsForge dashboard):
//   OLLAMA_ENDPOINT   e.g. https://ollama.example.com/api/chat
//   OLLAMA_API_KEY    bearer token for that endpoint
//   OLLAMA_MODEL      e.g. llama3.1:8b  (any Ollama-compatible model)

const SYSTEM = `You extract structured metadata from short web captures (highlights, tweets, AI responses, article excerpts). Reply ONLY with a compact JSON object. Keys: title (<=80 chars), summary (1-2 sentences, <=280 chars), topics (array of 1-5 short lowercase tags), keywords (array of 3-8 lowercase noun phrases), entities (array of proper nouns). Do not wrap in markdown. Do not add commentary.`;

interface Payload { memory_id: string }

Deno.serve(async (req: Request) => {
  const { memory_id } = (await req.json()) as Payload;

  const sb = (globalThis as any).insforge; // provided by runtime
  const supabase = sb.serviceClient();

  const { data: mem, error } = await supabase
    .from("memories").select("*").eq("id", memory_id).single();
  if (error || !mem) return new Response("not found", { status: 404 });

  await supabase.from("memories").update({ processing_status: "processing" }).eq("id", memory_id);

  const endpoint = Deno.env.get("OLLAMA_ENDPOINT")!;
  const apiKey = Deno.env.get("OLLAMA_API_KEY")!;
  const model = Deno.env.get("OLLAMA_MODEL") || "llama3.1:8b";

  const body = {
    model,
    stream: false,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content:
          `Source URL: ${mem.source_url}\nSource title: ${mem.source_title || "(none)"}\n\nContent:\n${(mem.original_content || "").slice(0, 6000)}`,
      },
    ],
  };

  let lastErr = "";
  for (const attempt of [1, 2]) {
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`LLM ${r.status}`);
      const j = await r.json();
      const raw = (j?.message?.content ?? j?.choices?.[0]?.message?.content ?? "").trim();
      const jsonText = raw.replace(/^```(?:json)?\s*|\s*```$/g, "");
      const m = jsonText.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(m ? m[0] : jsonText);

      await supabase.from("memories").update({
        ai_title: String(parsed.title || "").slice(0, 120),
        ai_summary: String(parsed.summary || "").slice(0, 400),
        ai_topics: Array.isArray(parsed.topics) ? parsed.topics.slice(0, 5) : [],
        ai_keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 8) : [],
        ai_entities: Array.isArray(parsed.entities) ? parsed.entities.slice(0, 10) : [],
        processing_status: "done",
      }).eq("id", memory_id);

      return new Response("ok", { status: 200 });
    } catch (e) {
      lastErr = String(e);
      if (attempt === 1) continue;
    }
  }

  await supabase.from("memories").update({
    processing_status: "failed",
    processing_error: lastErr.slice(0, 400),
  }).eq("id", memory_id);

  return new Response(`failed: ${lastErr}`, { status: 500 });
});
