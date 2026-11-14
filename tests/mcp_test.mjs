// Kør: python scripts/gen_allergens.py && node tests/mcp_test.mjs
// Tjekker at serverens allergitjek giver præcis samme svar som Python-reglerne, og at værktøjerne virker sammen.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { allergensIn } from "../supabase/functions/mymatti-mcp/logic.ts";
import { handleRpc } from "../supabase/functions/mymatti-mcp/mcp.ts";

const corpus = `Sødmælk|Kokosmælk|Havredrik|Revet ost|Toast|Smør|Jordnøddesmør|Æg|Aubergine/ægplante|Pålæg|Hvedemel|Majsmel
Boghvedemel|Glutenfri pasta|Spaghetti|Karamel|Muskatnød|Hasselnødder|Mandler|Laks|Rejer|Tahin|Sojasauce|Kartofler|Ris|Løg
Laktosefri mælk|Vegansk ost|Piskefløde|Æggeplante|Hakket oksekød|Rugbrød|Plantesmør|Havremælk|Knækbrød|Frisk pasta|Mayo
Rødvin|Hvidvin|Vineddike|Blæksprutte|Fiskefrikadeller|Kødboller|Boller|Is|Ispinde|Flødeis|Kærnemælk|Østers|Æblemost|Rosiner
Pesto|Dijonsennep|Selleri|Bladselleri|Hummus|Tofu|Øl|Ølgær|Byggryn|Perlebyg|Tun|Tunfisk|Mel|Kokosmel|Smørepålæg|Ost|Kost
Skyr|Crème fraîche|Creme fraiche 18%|Peanutbutter|Nøddeblanding|Kokosnød|RØDSPÆTTEFILET|Æggenudler|Risnudler|Wraps|Pizzadej`
  .split(/[|\n]/);

const expected = JSON.parse(execFileSync("python3", ["-c",
  "import json,sys; sys.path.insert(0,'.'); from mymatti import core; print(json.dumps({t: sorted(core.allergens_in(t)) for t in json.loads(sys.argv[1])}))",
  JSON.stringify(corpus)], { encoding: "utf-8" }));
for (const text of corpus) assert.deepEqual(allergensIn(text).sort(), expected[text], `allergener afviger for «${text}»`);

// ---- værktøjerne mod et lager i hukommelsen
let db = {
  family: [
    { id: "a", name: "Emma", allergies: ["maelk", "aeg"], other_allergies: "oksekød, græskar", dislikes: "" },
    { id: "b", name: "Far", allergies: ["noedder", "fisk"], other_allergies: "", dislikes: "oliven" },
  ],
};
let saves = 0;
const store = { load: async () => structuredClone(db), save: async (s) => { db = structuredClone(s); saves++; } };
let rpcId = 0;
const rpc = (method, params) => handleRpc({ jsonrpc: "2.0", id: ++rpcId, method, params }, store);
const call = async (name, args) => {
  const r = (await rpc("tools/call", { name, arguments: args })).result;
  let out = r.content[0].text;
  try { out = JSON.parse(out); } catch { /* ren tekst */ }
  return { out, isError: r.isError };
};

const init = await rpc("initialize", { protocolVersion: "2025-03-26" });
assert.equal(init.result.protocolVersion, "2025-03-26");
assert.equal(await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, store), null);
const tools = (await rpc("tools/list")).result.tools;
assert.equal(tools.length, 8);
assert.equal((await rpc("nope")).error.code, -32601);
assert.equal((await rpc("tools/call", { name: "nope" })).error.code, -32602);

let r = await call("add_to_inventory", { items: [
  { name: "havremælk", qty: 1, unit: "l", location: "Køleskab", min_qty: 2 },
  { name: "Kyllingebryst", qty: 400, unit: "g", location: "Køleskab", category: "Kød & fisk", days_fresh: 2 },
  { name: "Ris", qty: 1, unit: "kg" }, { name: "Smør", qty: 1, unit: "pk", location: "Køleskab" },
] });
assert.equal(r.out.lagt_paa_lager.length, 4);

r = await call("get_household", {});
assert.deepEqual(r.out.familie[0].allergier, ["Mælk (inkl. laktose)", "Æg"]);
assert.equal(r.out.lager[0].vare, "Kyllingebryst");
assert.equal(r.out.lager[0].dage_tilbage, 2);
assert.ok(r.out.lager.find((i) => i.vare === "Smør").allergi_advarsel.length);
assert.equal(r.out.indkoebsliste[0].vare, "Havremælk");
assert.equal(r.out.indkoebsliste[0].maengde, "mindst 1 l");

r = await call("check_allergens", { texts: ["Kyllingebryst", "Ris", "Hakkebøf", "Hokkaido", "Laks", "Plantesmør", "Fløde"] });
assert.equal(r.out.ok, false);
assert.deepEqual(r.out.advarsler.map((w) => w.tekst), ["Hakkebøf", "Hokkaido", "Laks", "Fløde"]);
r = await call("check_allergens", { texts: ["Laks", "Fløde"], eaters: ["emma"] });
assert.deepEqual(r.out.advarsler.map((w) => w.tekst), ["Fløde"]);
assert.equal((await call("check_allergens", { texts: ["x"], eaters: ["Ukendt"] })).isError, true);

r = await call("update_inventory", { cooked: "Kylling med ris", changes: [
  { name: "kyllingebryst", used_qty: 400 }, { name: "Ris", used_qty: 300, unit: "g" },
  { name: "Havremælk", used_qty: 1 }, { name: "Findes ikke", used_qty: 1 }, { name: "Ris", used_qty: 1, unit: "l" },
] });
assert.deepEqual(r.out.opdateret, ["Kyllingebryst: brugt op", "Ris: 0,7 kg tilbage", "Havremælk: 0 l tilbage"]);
assert.equal(r.out.ikke_fundet.length, 2);
assert.equal(db.log[0].title, "Kylling med ris");
assert.equal(db.shopping.find((e) => e.name === "Havremælk").amount, "mindst 2 l");

r = await call("add_to_shopping_list", { items: [{ name: "Gulerødder", amount: "1 kg", category: "Frugt & grønt" }, { name: "Smør", amount: "1 pk" }] });
assert.equal(r.out.allergi_advarsler[0].vare, "Smør");
r = await call("update_shopping_list", { changes: [{ name: "smør", remove: true }, { name: "Gulerødder", in_cart: true }, { name: "havremælk", in_cart: true }] });
assert.equal(r.out.opdateret.length, 3);
assert.equal((await call("complete_order", { amount_kr: 0 })).isError, false);
assert.equal((await call("complete_order", {})).isError, true);
assert.deepEqual(db.shopping, []);
assert.equal(db.inventory.find((i) => i.name === "Havremælk").qty, 2);
assert.equal(db.inventory.find((i) => i.name === "Gulerødder").location, "Køleskab");
assert.deepEqual(db.orders, []);

await call("add_to_shopping_list", { items: [{ name: "Mel", amount: "2 kg" }] });
r = await call("complete_order", { amount_kr: 249.5, all_items: true });
assert.equal(r.out.brugt_denne_maaned_kr, 249.5);

const recipe = { title: "Kylling i karry", ingredients: [{ name: "Kyllingebryst", amount: "400 g" }, { name: "Kokosmælk", amount: "1 dåse" }], steps: ["Steg", "Simre"] };
assert.equal((await call("save_recipe", recipe)).out.gemt, "Kylling i karry");
r = await call("save_recipe", { ...recipe, title: "Flødekylling", ingredients: [{ name: "Piskefløde", amount: "2 dl" }] });
assert.equal(r.isError, true);
assert.equal(db.saved_recipes.length, 1);

const before = saves;
await call("check_allergens", { texts: ["Ris"] });
assert.equal(saves, before, "læsning må ikke skrive i databasen");
console.log(`ok – ${corpus.length} allergitekster stemmer med Python, og alle værktøjer virker`);
