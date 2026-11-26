// MCP-server (JSON-RPC over HTTP, uden session) med værktøjer til husstandens lager, allergier og indkøb.
import * as L from "./logic.ts";
import type { Any, State } from "./logic.ts";

export type Store = { load: () => Promise<State>; save: (state: State) => Promise<void> };

const INSTRUCTIONS = `Mymatti er en dansk families madlager, allergier og indkøbsliste.
- Kald altid get_household først. Svar på dansk.
- Allergierne er absolutte krav. Aftensmad skal kunne tåles af alle i familien, medmindre brugeren siger andet.
- "taaler_alligevel" er undtagelser, personen godt kan tåle (fx mandler trods nøddeallergi); check_allergens tager højde for dem.
- Kald check_allergens med alle ingredienser, før du foreslår en ret eller et produkt, og foreslå aldrig noget, der giver en advarsel.
  Tjekket er ordbaseret og kan overse noget: brug også din egen viden om skjulte allergener, og bed brugeren læse varedeklarationen.
- Brug lagerets varer først, især dem der udløber snart. Opdatér lageret med update_inventory, når brugeren har lavet en ret.
- Du må aldrig bestille eller betale. Indkøb lægges på listen eller i kurven; brugeren gennemfører selv hos Bilka ToGo.`;

const str = { type: "string" }, numT = { type: "number" }, bool = { type: "boolean" };
const itemProps = {
  name: { ...str, description: "Kort dansk varenavn uden mængde, fx 'Havremælk'" },
  qty: numT,
  unit: { type: "string", enum: L.UNITS },
  category: { type: "string", enum: L.CATEGORIES },
  location: { type: "string", enum: L.LOCATIONS },
  expires: { ...str, description: "Udløbsdato ÅÅÅÅ-MM-DD, hvis den kendes" },
  days_fresh: { ...numT, description: "Skønnet holdbarhed i dage fra i dag, hvis datoen ikke kendes" },
  min_qty: { ...numT, description: "Sættes kun for faste varer: minimum, før varen automatisk lægges på indkøbslisten" },
};

const TOOLS: Any[] = [
  {
    name: "get_household",
    description: "Hent familiens allergier og præferencer, hele lageret (med dage til udløb), indkøbslisten og månedsbudgettet. Kald den først.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "check_allergens",
    description: "Tjek ingredienser eller produktnavne mod familiens allergier. Returnerer en advarsel pr. tekst, der rammer. Kald den før hvert forslag til ret eller produkt.",
    inputSchema: {
      type: "object",
      properties: {
        texts: { type: "array", items: str, description: "Ingrediens- eller produktnavne, ét pr. element" },
        eaters: { type: "array", items: str, description: "Navne på dem, der spiser med. Udelad for hele familien." },
      },
      required: ["texts"],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "add_to_inventory",
    description: "Læg varer på lager, fx efter indkøb eller når brugeren fortæller, hvad de har. Ens varer samme sted lægges sammen.",
    inputSchema: {
      type: "object",
      properties: { items: { type: "array", items: { type: "object", properties: itemProps, required: ["name"] } } },
      required: ["items"],
    },
  },
  {
    name: "update_inventory",
    description: "Ret lageret: træk forbrug fra (used_qty), sæt ny mængde, dato eller minimum, eller fjern en vare. Find varen med id (helst) eller navn.",
    inputSchema: {
      type: "object",
      properties: {
        changes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: str, name: str,
              used_qty: { ...numT, description: "Forbrug, der trækkes fra" },
              unit: { ...str, description: "Enhed for used_qty/set_qty, hvis den ikke er varens egen" },
              set_qty: numT, expires: str, min_qty: { ...numT, description: "0 fjerner varen som fast vare" },
              remove: bool,
            },
          },
        },
        cooked: { ...str, description: "Navnet på retten, hvis ændringen skyldes, at den er lavet" },
      },
      required: ["changes"],
    },
  },
  {
    name: "add_to_shopping_list",
    description: "Læg varer på indkøbslisten til Bilka ToGo. Faste varer under minimum kommer på af sig selv.",
    inputSchema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: str, amount: { ...str, description: "Fx '1 kg' eller '2 stk'" },
              reason: { ...str, description: "Fx rettens navn" }, category: { type: "string", enum: L.CATEGORIES },
            },
            required: ["name"],
          },
        },
      },
      required: ["items"],
    },
  },
  {
    name: "update_shopping_list",
    description: "Markér varer som lagt i kurven (in_cart) eller fjern dem fra indkøbslisten. Find varen med navn eller id.",
    inputSchema: {
      type: "object",
      properties: {
        changes: { type: "array", items: { type: "object", properties: { id: str, name: str, in_cart: bool, remove: bool } } },
      },
      required: ["changes"],
    },
  },
  {
    name: "complete_order",
    description: "Brugeren har selv gennemført bestillingen: flyt varerne i kurven over på lageret og gem beløbet til månedsbudgettet. Kald den kun, når brugeren bekræfter, at der er bestilt.",
    inputSchema: {
      type: "object",
      properties: {
        amount_kr: { ...numT, description: "Hvad bestillingen kostede" },
        all_items: { ...bool, description: "true = alle varer på listen er købt, ikke kun dem markeret i kurven" },
      },
    },
  },
  {
    name: "save_recipe",
    description: "Gem en opskrift, så den kan ses i web-appen under Gemte. Opskriften allergitjekkes og afvises, hvis den rammer familiens allergier.",
    inputSchema: {
      type: "object",
      properties: {
        title: str, description: str, time_min: numT, servings: numT,
        ingredients: {
          type: "array",
          items: { type: "object", properties: { name: str, amount: str, category: { type: "string", enum: L.CATEGORIES } }, required: ["name", "amount"] },
        },
        steps: { type: "array", items: str },
        tip: str,
      },
      required: ["title", "ingredients", "steps"],
    },
  },
];

const list = (v: unknown): Any[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []);

function household(state: State): Any {
  const profile = L.familyProfile(state);
  const budget = Number(state.settings.budget_month) || 0;
  return {
    i_dag: L.today(),
    familie: state.family.map((m: Any) => ({
      navn: m.name,
      allergier: (m.allergies ?? []).map(L.allergenLabel),
      andre_allergier: m.other_allergies || null,
      kan_ikke_lide: m.dislikes || null,
      taaler_alligevel: m.tolerates || null,
    })),
    regler: {
      spor_af: state.settings.traces_ok ? "Varer mærket 'kan indeholde spor af' er i orden." : "Undgå også varer mærket 'kan indeholde spor af'.",
      varevalg: state.settings.shop_prefs || null,
      personer: state.settings.persons,
    },
    lager: [...state.inventory]
      .sort((a: Any, b: Any) => (L.daysLeft(a) ?? 9999) - (L.daysLeft(b) ?? 9999))
      .map((i: Any) => ({
        id: i.id, vare: i.name, maengde: L.fmtQty(i.qty, i.unit), placering: i.location, kategori: i.category,
        udloeber: i.expires, dage_tilbage: L.daysLeft(i), minimum: i.min_qty ? L.fmtQty(i.min_qty, i.unit) : null,
        allergi_advarsel: L.checkText(i.name, profile),
      })),
    indkoebsliste: state.shopping.map((e: Any) => ({
      id: e.id, vare: e.name, maengde: e.amount || null, grund: e.reason || null, i_kurv: e.in_cart,
      allergi_advarsel: L.checkText(e.name, profile),
    })),
    budget: budget ? { maaned_kr: budget, brugt_kr: L.monthSpent(state) } : null,
    gemte_opskrifter: state.saved_recipes.map((r: Any) => r.title),
  };
}

type Result = { out: Any; save?: boolean; error?: boolean };

export function callTool(state: State, name: string, args: Any): Result {
  args = args && typeof args === "object" ? args : {};
  switch (name) {
    case "get_household": {
      const before = JSON.stringify(state.shopping);
      L.syncStaples(state);
      return { out: household(state), save: JSON.stringify(state.shopping) !== before };
    }
    case "check_allergens": {
      const eaters = Array.isArray(args.eaters) ? args.eaters.map(String) : null;
      const profile = L.familyProfile(state, eaters);
      if (eaters && eaters.length && profile.names.length !== eaters.length) {
        return { error: true, out: `Kender ikke alle navne. Familien er: ${state.family.map((m: Any) => m.name).join(", ") || "(ingen oprettet)"}` };
      }
      const texts: string[] = Array.isArray(args.texts) ? args.texts.map(String) : [];
      const warnings = texts.map((t) => ({ tekst: t, advarsler: L.checkText(t, profile) })).filter((r) => r.advarsler.length);
      return {
        out: {
          tjekket_for: profile.names, antal_tjekket: texts.length, advarsler: warnings,
          ok: warnings.length === 0,
          note: state.family.length
            ? "Ordbaseret tjek – kan overse skjulte allergener. Brugeren skal læse varedeklarationen."
            : "Der er ikke oprettet familiemedlemmer, så intet er tjekket. Bed brugeren oprette allergier i web-appen.",
        },
      };
    }
    case "add_to_inventory": {
      const added = list(args.items).map((raw) => L.addItem(state, raw)).filter(Boolean);
      L.syncStaples(state);
      return { save: added.length > 0, out: { lagt_paa_lager: added.map((i: Any) => `${i.name}: ${L.fmtQty(i.qty, i.unit)}`) } };
    }
    case "update_inventory": {
      const done: string[] = [], missing: string[] = [];
      for (const ch of list(args.changes)) {
        const item = L.findItem(state, ch);
        if (!item) { missing.push(String(ch.name ?? ch.id ?? "?")); continue; }
        if (ch.remove) {
          state.inventory = state.inventory.filter((i: Any) => i !== item);
          done.push(`${item.name}: fjernet`);
          continue;
        }
        const toOwn = (q: unknown) => {
          const n = Number(q);
          if (!Number.isFinite(n) || n < 0) return null;
          return ch.unit ? L.convert(n, ch.unit, item.unit) : n;
        };
        if (ch.expires !== undefined) item.expires = /^\d{4}-\d{2}-\d{2}$/.test(String(ch.expires)) ? ch.expires : null;
        if (ch.min_qty !== undefined) item.min_qty = Number(ch.min_qty) > 0 ? Number(ch.min_qty) : null;
        if (ch.set_qty !== undefined) {
          const q = toOwn(ch.set_qty);
          if (q === null) { missing.push(`${item.name} (enheden ${ch.unit} kan ikke omregnes til ${item.unit})`); continue; }
          item.qty = Math.round(q * 1000) / 1000;
        }
        if (ch.used_qty !== undefined) {
          const q = toOwn(ch.used_qty);
          if (q === null) { missing.push(`${item.name} (enheden ${ch.unit} kan ikke omregnes til ${item.unit})`); continue; }
          L.deduct(state, item.id, q);
        }
        const still = state.inventory.includes(item);
        done.push(`${item.name}: ${still ? L.fmtQty(item.qty, item.unit) + " tilbage" : "brugt op"}`);
      }
      if (args.cooked && done.length) state.log = [{ date: L.today(), title: String(args.cooked) }, ...state.log].slice(0, 50);
      L.syncStaples(state);
      return { save: done.length > 0, out: { opdateret: done, ikke_fundet: missing } };
    }
    case "add_to_shopping_list": {
      const profile = L.familyProfile(state);
      const added: string[] = [], warnings: Any[] = [];
      for (const it of list(args.items)) {
        if (!String(it.name ?? "").trim()) continue;
        L.addShopping(state, it.name, String(it.amount ?? ""), String(it.reason ?? ""), it.category, "claude");
        added.push(String(it.name));
        const hits = L.checkText(String(it.name), profile);
        if (hits.length) warnings.push({ vare: it.name, advarsler: hits });
      }
      return { save: added.length > 0, out: { lagt_paa_listen: added, allergi_advarsler: warnings } };
    }
    case "update_shopping_list": {
      const done: string[] = [], missing: string[] = [];
      for (const ch of list(args.changes)) {
        const name = String(ch.name ?? "").trim().toLowerCase();
        const entry = state.shopping.find((e: Any) => (ch.id && e.id === ch.id) || (name && e.name.toLowerCase() === name)) ??
          state.shopping.find((e: Any) => name && e.name.toLowerCase().includes(name));
        if (!entry) { missing.push(String(ch.name ?? ch.id ?? "?")); continue; }
        if (ch.remove) {
          state.shopping = state.shopping.filter((e: Any) => e !== entry);
          if (entry.source === "auto") {
            // Ellers ville den faste vare straks komme tilbage på listen.
            for (const i of state.inventory) if (i.name.toLowerCase() === entry.name.toLowerCase()) i.min_qty = null;
          }
          done.push(`${entry.name}: fjernet`);
        } else if (typeof ch.in_cart === "boolean") {
          entry.in_cart = ch.in_cart;
          done.push(`${entry.name}: ${ch.in_cart ? "i kurv" : "ikke i kurv"}`);
        }
      }
      return { save: done.length > 0, out: { opdateret: done, ikke_fundet: missing } };
    }
    case "complete_order": {
      if (args.all_items) for (const e of state.shopping) e.in_cart = true;
      const names = L.receivePurchased(state);
      if (!names.length) return { error: true, out: "Ingen varer er markeret som lagt i kurven. Markér dem med update_shopping_list, eller brug all_items." };
      const amount = Number(args.amount_kr);
      L.recordOrder(state, Number.isFinite(amount) ? amount : null);
      L.syncStaples(state);
      return { save: true, out: { lagt_paa_lager: names, brugt_denne_maaned_kr: L.monthSpent(state) } };
    }
    case "save_recipe": {
      const recipe = {
        id: L.newId(),
        title: String(args.title ?? "").trim(),
        description: String(args.description ?? ""),
        time_min: Number(args.time_min) || null,
        servings: Number(args.servings) || state.settings.persons,
        ingredients: list(args.ingredients).map((i) => ({
          name: String(i.name ?? ""), amount: String(i.amount ?? ""),
          category: L.CATEGORIES.includes(i.category) ? i.category : "Andet", inventory_id: null, use_qty: null,
        })),
        steps: Array.isArray(args.steps) ? args.steps.map(String) : [],
        allergens: [] as string[],
        tip: String(args.tip ?? ""),
      };
      if (!recipe.title || !recipe.ingredients.length) return { error: true, out: "Opskriften mangler titel eller ingredienser." };
      const hits = L.checkRecipe(recipe, L.familyProfile(state));
      if (hits.length) return { error: true, out: { afvist: "Opskriften rammer familiens allergier og er ikke gemt.", advarsler: hits } };
      recipe.allergens = [...new Set(recipe.ingredients.flatMap((i) => L.allergensIn(i.name)))];
      state.saved_recipes = [...state.saved_recipes.filter((r: Any) => r.title !== recipe.title), recipe];
      return { save: true, out: { gemt: recipe.title } };
    }
    default:
      return { error: true, out: `Ukendt værktøj: ${name}` };
  }
}

const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];

/** Behandl én JSON-RPC-besked. Returnerer null for notifikationer. */
export async function handleRpc(msg: Any, store: Store): Promise<Any | null> {
  const id = msg?.id;
  const reply = (result: Any) => ({ jsonrpc: "2.0", id, result });
  const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return fail(-32600, "Invalid Request");
  if (id === undefined) return null; // notifikation

  switch (msg.method) {
    case "initialize": {
      const wanted = msg.params?.protocolVersion;
      return reply({
        protocolVersion: PROTOCOLS.includes(wanted) ? wanted : PROTOCOLS[0],
        capabilities: { tools: {} },
        serverInfo: { name: "mymatti", version: "1.0.0" },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS });
    case "tools/call": {
      const name = msg.params?.name;
      if (!TOOLS.some((t) => t.name === name)) return fail(-32602, `Unknown tool: ${name}`);
      try {
        const state = L.normalizeState(await store.load());
        const res = callTool(state, name, msg.params?.arguments);
        if (res.save && !res.error) await store.save(state);
        const text = typeof res.out === "string" ? res.out : JSON.stringify(res.out, null, 1);
        return reply({ content: [{ type: "text", text }], isError: !!res.error });
      } catch (err) {
        console.error("tool failed", name, err);
        return reply({ content: [{ type: "text", text: "Der opstod en fejl i Mymatti. Prøv igen." }], isError: true });
      }
    }
    default:
      return fail(-32601, `Method not found: ${msg.method}`);
  }
}
