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

// DEMO=1 opretter en husstand med eksempeldata og koden "demo" gentaget, så designet kan ses uden at taste.
if (process.env.DEMO) {
  const { finalizeRecipe } = await import("../supabase/functions/mymatti-mcp/ai.ts");
  const { familyProfile, today } = await import("../supabase/functions/mymatti-mcp/logic.ts");
  const s = normalizeState(null);
  const day = (n) => new Date(Date.parse(today()) + n * 86400000).toISOString().slice(0, 10);
  const run = (a, p) => act(s, a, p, DEPS);
  await run("family_save", { member: { name: "Mor", allergies: ["noedder"], dislikes: "oliven" } });
  await run("family_save", { member: { name: "Far", allergies: [] } });
  await run("family_save", { member: { name: "Emma", allergies: ["maelk", "aeg"], other_allergies: "oksekød, græskar" } });
  await run("family_save", { member: { name: "Noah", allergies: ["fisk"] } });
  await run("settings_save", { budget_month: 6000 });
  await run("inventory_add", { items: [
    { name: "Kyllingebryst", qty: 400, unit: "g", category: "Kød & fisk", location: "Køleskab", expires: day(1) },
    { name: "Spinat", qty: 1, unit: "pose", category: "Frugt & grønt", location: "Køleskab", expires: day(2) },
    { name: "Havremælk", qty: 1, unit: "l", category: "Mejeri & æg", location: "Køleskab", expires: day(9), min_qty: 3 },
    { name: "Plantesmør", qty: 1, unit: "pk", category: "Mejeri & æg", location: "Køleskab", expires: day(30), min_qty: 1 },
    { name: "Gulerødder", qty: 1, unit: "kg", category: "Frugt & grønt", location: "Køleskab", expires: day(12) },
    { name: "Smør", qty: 1, unit: "pk", category: "Mejeri & æg", location: "Køleskab", expires: day(40) },
    { name: "Ris", qty: 1, unit: "kg", category: "Kolonial", location: "Kolonial" },
    { name: "Flåede tomater", qty: 3, unit: "dåse", category: "Kolonial", location: "Kolonial" },
    { name: "Havregryn", qty: 0.5, unit: "kg", category: "Kolonial", location: "Kolonial", min_qty: 1 },
    { name: "Knækbrød", qty: 2, unit: "pk", category: "Kolonial", location: "Kolonial", min_qty: 1 },
    { name: "Løg", qty: 4, unit: "stk", category: "Frugt & grønt", location: "Kolonial" },
    { name: "Ærter", qty: 1, unit: "pose", category: "Frost", location: "Fryser" },
  ] });
  await run("shopping_add", { name: "Bananer", amount: "6 stk", category: "Frugt & grønt" });
  s.orders = [{ date: today(), amount: 2350 }];
  const id = (name) => s.inventory.find((i) => i.name === name).id;
  const profile = familyProfile(s);
  s.suggestions = [
    finalizeRecipe({ title: "Kylling i tomat med ris og spinat", description: "Hurtig gryderet, der bruger kyllingen og spinaten, før de bliver for gamle.", time_min: 20, servings: 4,
      ingredients: [{ name: "Kyllingebryst", amount: "400 g", inventory_id: id("Kyllingebryst"), use_qty: 400, category: "Kød & fisk" }, { name: "Flåede tomater", amount: "2 dåser", inventory_id: id("Flåede tomater"), use_qty: 2, category: "Kolonial" },
        { name: "Ris", amount: "3 dl", inventory_id: id("Ris"), use_qty: 0.3, category: "Kolonial" }, { name: "Spinat", amount: "1 pose", inventory_id: id("Spinat"), use_qty: 1, category: "Frugt & grønt" }, { name: "Løg", amount: "1 stk", inventory_id: id("Løg"), use_qty: 1, category: "Frugt & grønt" },
        { name: "Hvidløg", amount: "2 fed", inventory_id: null, use_qty: null, category: "Frugt & grønt" }],
      steps: ["Sæt risene over.", "Svits løg og hvidløg, og brun kyllingen i tern.", "Tilsæt tomater, og lad det simre 10 minutter.", "Vend spinaten i til sidst, og smag til."], allergens: [], tip: "Rester holder 2 dage på køl og kan fryses." }, s.inventory, profile),
    finalizeRecipe({ title: "Gulerodssuppe med ristet knækbrød", description: "Mild suppe på gulerødder og løg.", time_min: 20, servings: 4,
      ingredients: [{ name: "Gulerødder", amount: "800 g", inventory_id: id("Gulerødder"), use_qty: 0.8, category: "Frugt & grønt" }, { name: "Løg", amount: "2 stk", inventory_id: id("Løg"), use_qty: 2, category: "Frugt & grønt" }, { name: "Havremælk", amount: "2 dl", inventory_id: id("Havremælk"), use_qty: 0.2, category: "Mejeri & æg" }, { name: "Knækbrød", amount: "4 skiver", inventory_id: id("Knækbrød"), use_qty: 0.25, category: "Kolonial" }],
      steps: ["Kog gulerødder og løg møre i vand.", "Blend med havremælk, og smag til.", "Servér med knækbrød."], allergens: ["gluten"], tip: "Suppen kan fryses i portioner." }, s.inventory, profile),
    finalizeRecipe({ title: "Flødekartofler", description: "", time_min: 45, servings: 4, ingredients: [{ name: "Piskefløde", amount: "5 dl", inventory_id: null, use_qty: null, category: "Mejeri & æg" }], steps: [], allergens: ["maelk"] }, s.inventory, profile),
  ];
  await run("recipe_save", { id: s.suggestions[0].id });
  await run("get", {});
  households.set(hash("demo".repeat(10)), s);
  console.log("Eksempel-husstand: koden er 'demo' gentaget 10 gange");
}

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
