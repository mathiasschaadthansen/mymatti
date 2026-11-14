// Supabase Edge Function: Mymatti som MCP-server for Claude.
// Adresse: https://<projekt>.supabase.co/functions/v1/mymatti-mcp/<adgangsnøgle>
// Adgangsnøglen er den sidste del af adressen. Kun dens SHA-256 ligger i databasen (rækken "mcp_access").
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleRpc, type Store } from "./mcp.ts";

const REST = `${Deno.env.get("SUPABASE_URL")}/rest/v1/mymatti_state`;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function readRow(id: string): Promise<unknown> {
  const resp = await fetch(`${REST}?id=eq.${id}&select=data`, { headers: HEADERS });
  if (!resp.ok) throw new Error(`load ${id}: ${resp.status}`);
  const rows = await resp.json();
  return rows[0]?.data ?? null;
}

const store: Store = {
  load: () => readRow("husstand"),
  save: async (state) => {
    const resp = await fetch(REST, {
      method: "POST",
      headers: { ...HEADERS, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ id: "husstand", data: state, updated_at: new Date().toISOString() }),
    });
    if (!resp.ok) throw new Error(`save: ${resp.status}`);
  },
};

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function authorized(req: Request): Promise<boolean> {
  const token = new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "";
  if (token.length < 32) return false;
  const access = (await readRow("mcp_access")) as { token_sha256?: string } | null;
  return !!access?.token_sha256 && sameString(await sha256(token), access.token_sha256);
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  try {
    if (!(await authorized(req))) return json({ error: "unauthorized" }, 401);
  } catch (err) {
    console.error("auth failed", err);
    return json({ error: "unavailable" }, 503);
  }
  if (req.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }
  if (Array.isArray(body)) {
    const replies = [];
    for (const msg of body) {
      const reply = await handleRpc(msg, store);
      if (reply) replies.push(reply);
    }
    return replies.length ? json(replies) : new Response(null, { status: 202 });
  }
  const reply = await handleRpc(body, store);
  return reply ? json(reply) : new Response(null, { status: 202 });
});
