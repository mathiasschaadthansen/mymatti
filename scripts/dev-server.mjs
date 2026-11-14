// Lokal testserver: viser web/ og kører samme API-kode som Supabase-funktionen, med data i hukommelsen.
// Kør: node scripts/dev-server.mjs  → http://localhost:8788
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { extname, join, normalize } from "node:path";
import { act, ApiError, view } from "../supabase/functions/mymatti-mcp/api.ts";
import { normalizeState } from "../supabase/functions/mymatti-mcp/logic.ts";

const WEB = new URL("../web/", import.meta.url).pathname;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png" };
const DEPS = { geminiKey: process.env.GEMINI_API_KEY ?? "", geminiModel: process.env.GEMINI_MODEL ?? "" };
const households = new Map();
const hash = (code) => createHash("sha256").update(code).digest("hex");

createServer(async (req, res) => {
  const send = (status, body, type = "application/json") => { res.writeHead(status, { "Content-Type": type }); res.end(body); };
  if (req.url === "/api") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    try {
      const body = JSON.parse(raw || "{}");
      if (body.action === "create_household") {
        const code = randomBytes(32).toString("base64url");
        households.set(hash(code), normalizeState(null));
        return send(200, JSON.stringify({ code }));
      }
      const id = hash(String(req.headers["x-mymatti-code"] ?? ""));
      if (!households.has(id)) return send(401, JSON.stringify({ error: "Husstandskoden er ikke gyldig." }));
      const state = normalizeState(structuredClone(households.get(id)));
      const out = await act(state, String(body.action ?? ""), body.payload, DEPS);
      if (out.save) households.set(id, state);
      return send(200, JSON.stringify({ view: view(state, DEPS), ...(out.extra ?? {}) }));
    } catch (err) {
      if (err instanceof ApiError) return send(400, JSON.stringify({ error: err.message }));
      console.error(err);
      return send(500, JSON.stringify({ error: "Der opstod en fejl. Prøv igen." }));
    }
  }
  const path = normalize(new URL(req.url, "http://x").pathname).replace(/^\/+/, "") || "index.html";
  try {
    send(200, await readFile(join(WEB, path)), TYPES[extname(path)] ?? "application/octet-stream");
  } catch {
    send(404, "Not found", "text/plain");
  }
}).listen(Number(process.env.PORT ?? 8788), () => console.log("Mymatti kører på http://localhost:" + (process.env.PORT ?? 8788)));
