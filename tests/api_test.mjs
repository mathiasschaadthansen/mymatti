// Kør: node tests/api_test.mjs – afprøver web-appens API-handlinger mod data i hukommelsen (uden AI).
import assert from "node:assert/strict";
import { act, ApiError, parseTextFallback, view } from "../supabase/functions/mymatti-mcp/api.ts";
import { finalizeRecipe } from "../supabase/functions/mymatti-mcp/ai.ts";
import { parseFeed, relevant } from "../supabase/functions/mymatti-mcp/recalls.ts";
import { familyProfile, normalizeState } from "../supabase/functions/mymatti-mcp/logic.ts";

const deps = { geminiKey: "", geminiModel: "" };
const state = normalizeState(null);
const run = (action, payload) => act(state, action, payload, deps);
const fails = async (action, payload, part) => {
  await assert.rejects(() => run(action, payload), (e) => e instanceof ApiError && e.message.includes(part), `${action} burde fejle med «${part}»`);
};

assert.deepEqual(parseTextFallback("2 l havremælk, 500g hakket oksekød\n3 æg; ris, 1,5 kg kartofler").map((i) => [i.name, i.qty, i.unit, i.category, i.location]), [
  ["havremælk", 2, "l", "Mejeri & æg", "Køleskab"], ["hakket oksekød", 500, "g", "Kød & fisk", "Køleskab"],
  ["æg", 3, "stk", "Mejeri & æg", "Køleskab"], ["ris", 1, "stk", "Kolonial", "Kolonial"], ["kartofler", 1.5, "kg", "Frugt & grønt", "Kolonial"],
]);

await fails("family_save", { member: { name: " " } }, "navn");
await run("family_save", { member: { name: "Emma", allergies: ["maelk", "findes-ikke"], other_allergies: "oksekød" } });
assert.deepEqual(state.family[0].allergies, ["maelk"]);
await run("family_save", { member: { id: state.family[0].id, name: "Emma", allergies: ["maelk", "aeg"], other_allergies: "oksekød" } });
assert.equal(state.family.length, 1);

await fails("settings_save", { bilka_url: "javascript:alert(1)//{q}" }, "https://");
await run("settings_save", { persons: 99, budget_month: 6000, traces_ok: false });
assert.deepEqual([state.settings.persons, state.settings.budget_month, state.settings.traces_ok], [20, 6000, false]);

const parsed = await run("parse_text", { text: "2 l havremælk, 1 pk smør, 400 g kyllingebryst, 500 g hakkebøf" });
assert.equal(parsed.save, undefined);
await run("inventory_add", { items: parsed.extra.items });
let v = view(state, deps);
assert.deepEqual(v.inventory.filter((i) => i.warnings.length).map((i) => i.name).sort(), ["Hakkebøf", "Smør"]);
assert.equal(v.ai_available, false);

const milk = state.inventory.find((i) => i.name === "Havremælk");
await run("inventory_update", { item: { ...milk, min_qty: 3 } });
assert.equal(state.shopping[0].amount, "mindst 1 l");
await run("inventory_adjust", { id: milk.id, delta: -5 });
assert.equal(milk.qty, 0);
assert.ok(state.inventory.includes(milk), "fast vare bliver stående på 0");
await fails("inventory_adjust", { id: "nope", delta: 1 }, "findes ikke");

await run("shopping_add", { name: "Gulerødder", amount: "1 kg", category: "Frugt & grønt" });
await fails("order_complete", {}, "flueben");
for (const e of state.shopping) await run("shopping_toggle", { id: e.id, in_cart: true });
const done = await run("order_complete", { amount: 1250 });
assert.deepEqual(done.extra.received.sort(), ["Gulerødder", "Havremælk"]);
assert.equal(milk.qty, 3);
v = view(state, deps);
assert.deepEqual([v.budget.spent, v.shopping.length], [1250, 0]);

await fails("recipes_generate", {}, "AI er ikke sat op");
const chicken = state.inventory.find((i) => i.name === "Kyllingebryst");
const profile = familyProfile(state);
state.suggestions = [
  finalizeRecipe({ title: "Kylling med ris", ingredients: [{ name: "Kyllingebryst", amount: "400 g", inventory_id: chicken.id, use_qty: 9999, category: "Kød & fisk" }, { name: "Ris", amount: "3 dl", inventory_id: "opdigtet", use_qty: 1, category: "Kolonial" }], steps: ["Steg"], allergens: [] }, state.inventory, profile),
  finalizeRecipe({ title: "Omelet", ingredients: [{ name: "Æg", amount: "4 stk", category: "Mejeri & æg" }], steps: [], allergens: ["aeg"] }, state.inventory, profile),
  finalizeRecipe({ title: "Skjult", ingredients: [{ name: "Tærtedej", amount: "1 stk", category: "Kolonial" }], steps: [], allergens: ["maelk"] }, state.inventory, profile),
];
const [ok, omelet, hidden] = state.suggestions;
assert.equal(ok.ingredients[0].use_qty, 400);
assert.equal(ok.ingredients[1].inventory_id, null);
assert.equal(ok.allergy_hits.length, 0);
assert.ok(omelet.allergy_hits.length && hidden.allergy_hits[0].includes("angivet af AI"));
await fails("recipe_save", { id: omelet.id }, "allergier");
await run("recipe_save", { id: ok.id });
assert.equal((await run("recipe_shop", {})).extra.added, 1);
assert.equal(state.shopping[0].name, "Ris");
await run("recipe_cooked", { id: ok.id, used: [{ inventory_id: chicken.id, qty: 400 }, { inventory_id: "nope", qty: 5 }] });
assert.ok(!state.inventory.includes(chicken));
assert.equal(state.log[0].title, "Kylling med ris");
assert.equal(view(state, deps).suggestions[0].ingredients[0].in_stock, false);

await run("family_delete", { id: state.family[0].id });
assert.deepEqual([state.family.length, state.suggestions.length], [0, 0]);
await fails("nope", {}, "Ukendt");

const feed = parseFeed(`<rss><channel><item><title>Tilbagekald - udeklareret æg i ispinde</title><link>https://x/1</link><description>Der er påvist æg &amp; mere, til trods for at dette ikke fremgår.</description><pubDate>Fri, 06 Nov 2026 12:24:38 GMT</pubDate></item>
<item><title>Tilbagekald: Spind fra møl i knækkede byggryn</title><link>https://x/2</link><description>Kilic knækkede byggryn.</description><pubDate>bad</pubDate></item></channel></rss>`);
assert.deepEqual([feed.length, feed[0].published, feed[1].published, feed[0].description.includes("æg & mere")], [2, "2026-11-06", null, true]);
const s2 = normalizeState({ family: [{ id: "a", name: "Far", allergies: ["aeg"] }], inventory: [{ id: "i", name: "Byggryn", qty: 1, unit: "pk" }] });
assert.deepEqual(relevant(feed, s2, familyProfile(s2)).map((r) => [r.link, r.items, r.allergens]), [["https://x/1", [], ["Æg"]], ["https://x/2", ["Byggryn"], []]]);
// Undtagelser: nøddeallergi, men tåler mandler
const s3 = normalizeState({ family: [
  { id: "a", name: "A", allergies: ["noedder", "maelk"], tolerates: "mandler" },
  { id: "b", name: "B", allergies: ["noedder"] },
] });
const pA = familyProfile(s3, ["A"]), pAll = familyProfile(s3);
const { checkText } = await import("../supabase/functions/mymatti-mcp/logic.ts");
assert.deepEqual(checkText("Marcipan", pA), []);
assert.deepEqual(checkText("Mandler", pA), []);
assert.deepEqual(checkText("Mandelmælk", pA), []);
assert.equal(checkText("Hasselnødder", pA).length, 1);
assert.equal(checkText("Mandel- og hasselnøddeblanding", pA).length, 1);
assert.equal(checkText("Mælkechokolade med mandler", pA)[0].startsWith("Mælk"), true);
assert.deepEqual(checkText("Marcipan", pAll), ["Nødder (mandler, hasselnødder, valnødder m.fl.) (B)"]);
const { buildRecipePrompt } = await import("../supabase/functions/mymatti-mcp/ai.ts");
assert.ok(buildRecipePrompt([], pAll, { count: 1, meal: "Aftensmad", persons: 2, max_time: 20, max_missing: 0 }).includes("A tåler alligevel mandler"));

console.log("ok – API-handlinger, reservetolkning, opskriftstjek og tilbagekald virker");
