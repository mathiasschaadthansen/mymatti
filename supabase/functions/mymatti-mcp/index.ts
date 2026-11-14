// Supabase Edge Function for Mymatti. To indgange til de samme husstandsdata:
//   POST .../mymatti-mcp/api          – web-appen (husstandskoden sendes i headeren x-mymatti-code)
//   POST .../mymatti-mcp/<kode>       – Claude som MCP-server (koden er sidste del af adressen)
// En husstand er én række i mymatti_state, hvis id er SHA-256 af husstandskoden. Koden selv gemmes ikke.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleRpc, type Store } from "./mcp.ts";
import { act, ApiError, type Deps, view } from "./api.ts";
import { normalizeState } from "./logic.ts";

const REST = `${Deno.env.get("SUPABASE_URL")}/rest/v1/mymatti_state`;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const DEPS: Deps = { geminiKey: Deno.env.get("GEMINI_API_KEY") ?? "", geminiModel: Deno.env.get("GEMINI_MODEL") ?? "" };
const MAX_HOUSEHOLDS = 200;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-mymatti-code",
  "Access-Control-Max-Age": "86400",
};

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Find husstandens række ud fra koden. null hvis koden ikke findes. */
async function openHousehold(code: string): Promise<{ data: unknown; store: Store } | null> {
  if (code.length < 32 || code.length > 100) return null;
  const id = await sha256(code);
  const read = async () => {
    const resp = await fetch(`${REST}?id=eq.${id}&select=data`, { headers: HEADERS });
    if (!resp.ok) throw new Error(`load: ${resp.status}`);
    return (await resp.json())[0] ?? null;
  };
  const row = await read();
  if (!row) return null;
  const store: Store = {
    load: async () => (await read())?.data ?? null,
    save: async (state) => {
      const resp = await fetch(`${REST}?id=eq.${id}`, {
        method: "PATCH",
        headers: { ...HEADERS, Prefer: "return=minimal" },
        body: JSON.stringify({ data: state, updated_at: new Date().toISOString() }),
      });
      if (!resp.ok) throw new Error(`save: ${resp.status}`);
    },
  };
  return { data: row.data, store };
}

async function createHousehold(): Promise<string> {
  const count = await fetch(`${REST}?select=id&limit=${MAX_HOUSEHOLDS + 1}`, { headers: HEADERS });
  if (!count.ok) throw new Error(`count: ${count.status}`);
  if ((await count.json()).length > MAX_HOUSEHOLDS) throw new ApiError("Der kan ikke oprettes flere husstande lige nu.");
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const code = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  const resp = await fetch(REST, {
    method: "POST",
    headers: { ...HEADERS, Prefer: "return=minimal" },
    body: JSON.stringify({ id: await sha256(code), data: normalizeState(null) }),
  });
  if (!resp.ok) throw new Error(`create: ${resp.status}`);
  return code;
}

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...extra } });

async function handleApi(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Brug POST." }, 405, CORS);
  let body: { action?: string; payload?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Ugyldig forespørgsel." }, 400, CORS);
  }
  try {
    if (body.action === "create_household") return json({ code: await createHousehold() }, 200, CORS);
    const household = await openHousehold(req.headers.get("x-mymatti-code") ?? "");
    if (!household) return json({ error: "Husstandskoden er ikke gyldig." }, 401, CORS);
    const state = normalizeState(household.data);
    const out = await act(state, String(body.action ?? ""), body.payload, DEPS);
    if (out.save) await household.store.save(state);
    return json({ view: view(state, DEPS), ...(out.extra ?? {}) }, 200, CORS);
  } catch (err) {
    if (err instanceof ApiError) return json({ error: err.message }, 400, CORS);
    console.error("api failed", body.action, err);
    return json({ error: "Der opstod en fejl. Prøv igen." }, 500, CORS);
  }
}

async function handleMcp(req: Request, code: string): Promise<Response> {
  let household;
  try {
    household = await openHousehold(code);
  } catch (err) {
    console.error("auth failed", err);
    return json({ error: "unavailable" }, 503);
  }
  if (!household) return json({ error: "unauthorized" }, 401);
  if (req.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }
  const messages = Array.isArray(body) ? body : [body];
  const replies = [];
  for (const msg of messages) {
    const reply = await handleRpc(msg, household.store);
    if (reply) replies.push(reply);
  }
  if (!replies.length) return new Response(null, { status: 202 });
  return json(Array.isArray(body) ? replies : replies[0]);
}

Deno.serve((req: Request) => {
  const last = new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "";
  return last === "api" ? handleApi(req) : handleMcp(req, last);
});
