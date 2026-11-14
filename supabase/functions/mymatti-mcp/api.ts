// API til web-appen: hver handling ændrer husstandens data og returnerer det nye, færdigberegnede billede.
import * as L from "./logic.ts";
import type { Any, State } from "./logic.ts";
import { ALLERGENS } from "./allergens.ts";
import { AIError, finalizeRecipe, generateRecipes, parseItemsImage, parseItemsText } from "./ai.ts";
import { fetchRecalls, PAGE, relevant } from "./recalls.ts";

export type Deps = { geminiKey: string; geminiModel: string };
export class ApiError extends Error {}

const text = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
const list = (v: unknown): Any[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []);

/** Simpel tolkning uden AI af fx "2 l mælk, 500g hakket oksekød, 3 æg, ris". */
export function parseTextFallback(input: string): Any[] {
  const out = [];
  for (const part of input.split(/[\n;]+|,(?!\d)/)) {
    const line = part.replace(/^[\s\-•*]+|\s+$/g, "");
    if (!line) continue;
    let qty = 1, unit = "stk", name = line;
    const m = /^(\d+(?:[.,]\d+)?)\s*([a-zæøå]+\.?)?\s*(.*)$/i.exec(line);
    if (m) {
      qty = Number(m[1].replace(",", "."));
      const word = L.normUnit(m[2] ?? "");
      const rest = m[3].trim();
      if (m[2] && (word !== "stk" || /^stk/i.test(m[2])) && rest) { unit = word; name = rest; }
      else name = `${m[2] ?? ""} ${rest}`.trim();
    }
    if (name) out.push({ name, qty, unit, ...guessPlace(name) });
  }
  return out;
}

// Groft gæt på varegruppe og placering, når der ikke er AI til at vurdere det. Brugeren kan rette bagefter.
const PLACE_RULES: [RegExp, string, string][] = [
  [/frost|frossen|frosne|\bis\b|ispinde/i, "Frost", "Fryser"],
  [/mælk|fløde|smør|ost\b|yoghurt|skyr|æg\b|creme fraiche|havredrik|plantedrik/i, "Mejeri & æg", "Køleskab"],
  [/kød|kylling|okse|svin|bacon|skinke|pølse|fisk|laks|torsk|rejer|fars|bøf|pålæg|leverpostej/i, "Kød & fisk", "Køleskab"],
  [/salat|agurk|tomat(?!.*dåse)|peberfrugt|spinat|gulerod|gulerødder|broccoli|blomkål|squash|porre|champignon|bær\b|druer|krydderurter/i, "Frugt & grønt", "Køleskab"],
  [/løg|kartof|æble|banan|citron|appelsin|pære|avocado|ingefær/i, "Frugt & grønt", "Kolonial"],
  [/brød|boller|toast|wraps|tortilla|kage/i, "Brød & bagværk", "Kolonial"],
  [/juice|saft|sodavand|\bøl\b|vin\b|kaffe|\bte\b|vand\b/i, "Drikkevarer", "Kolonial"],
  [/ris\b|pasta|mel\b|gryn|sukker|olie|eddike|dåse|bønner|linser|krydderi|salt|peber|nudler|müsli|knækbrød|kiks|bouillon|ketchup|sennep|honning|nødder|rosiner|chokolade/i, "Kolonial", "Kolonial"],
];

function guessPlace(name: string): { category: string; location: string } {
  for (const [pattern, category, location] of PLACE_RULES) if (pattern.test(name)) return { category, location };
  return { category: "Andet", location: "Kolonial" };
}

export function view(state: State, deps: Deps): Any {
  const profile = L.familyProfile(state);
  const stock = new Set(state.inventory.map((i: Any) => i.id));
  const recipe = (r: Any) => ({
    ...r,
    ingredients: (r.ingredients ?? []).map((i: Any) => ({ ...i, in_stock: stock.has(i.inventory_id) })),
  });
  const budget = Number(state.settings.budget_month) || 0;
  const template = String(state.settings.bilka_url || "").includes("{q}") ? state.settings.bilka_url : "https://www.bilkatogo.dk/s/?query={q}";
  return {
    today: L.today(),
    ai_available: !!deps.geminiKey,
    allergen_options: Object.entries(ALLERGENS).map(([key, spec]) => ({ key, label: spec.label })),
    units: L.UNITS, categories: L.CATEGORIES, locations: L.LOCATIONS,
    family: state.family,
    profile: {
      allergens: Object.entries(profile.allergens).map(([k, who]) => ({ label: L.allergenLabel(k), who })),
      other: Object.entries(profile.other).map(([term, who]) => ({ label: term, who })),
    },
    settings: state.settings,
    inventory: [...state.inventory]
      .sort((a: Any, b: Any) => (L.daysLeft(a) ?? 9999) - (L.daysLeft(b) ?? 9999) || a.name.localeCompare(b.name, "da"))
      .map((i: Any) => ({ ...i, days_left: L.daysLeft(i), warnings: L.checkText(i.name, profile), low: !!(i.min_qty && i.qty < i.min_qty) })),
    shopping: state.shopping.map((e: Any) => ({
      ...e, warnings: L.checkText(e.name, profile), bilka_url: template.replace("{q}", encodeURIComponent(e.name)),
    })),
    budget: { month: budget, spent: L.monthSpent(state) },
    suggestions: state.suggestions.map(recipe),
    saved_recipes: state.saved_recipes.map((r: Any) => recipe({ ...r, allergy_hits: L.checkRecipe(r, profile) })),
    log: state.log.slice(0, 10),
  };
}

type Out = { save?: boolean; extra?: Any };

/** Udfør én handling. Kaster ApiError med en besked, brugeren kan forstå. */
export async function act(state: State, action: string, p: Any, deps: Deps): Promise<Out> {
  p = p && typeof p === "object" ? p : {};
  const findInv = (id: unknown) => {
    const item = state.inventory.find((i: Any) => i.id === id);
    if (!item) throw new ApiError("Varen findes ikke længere. Opdatér siden.");
    return item;
  };
  const findRecipe = (id: unknown) => {
    const r = [...state.suggestions, ...state.saved_recipes].find((x: Any) => x.id === id);
    if (!r) throw new ApiError("Opskriften findes ikke længere.");
    return r;
  };
  const ai = async <T>(fn: () => Promise<T>): Promise<T> => {
    try { return await fn(); } catch (err) {
      if (err instanceof AIError) throw new ApiError(err.message);
      throw err;
    }
  };

  switch (action) {
    case "get": {
      const before = JSON.stringify(state.shopping);
      L.syncStaples(state);
      return { save: JSON.stringify(state.shopping) !== before };
    }

    // ------------------------------------------------------------- familie
    case "family_save": {
      const m = p.member ?? {};
      const name = text(m.name, 40);
      if (!name) throw new ApiError("Skriv et navn.");
      const data = {
        name,
        allergies: (Array.isArray(m.allergies) ? m.allergies : []).filter((a: Any) => a in ALLERGENS),
        other_allergies: text(m.other_allergies), dislikes: text(m.dislikes),
      };
      const existing = state.family.find((x: Any) => x.id === m.id);
      if (existing) Object.assign(existing, data);
      else {
        if (state.family.length >= 12) throw new ApiError("Der kan højst være 12 personer i en husstand.");
        state.family.push({ id: L.newId(), ...data });
      }
      state.suggestions = []; // gamle forslag er tjekket mod de gamle allergier
      return { save: true };
    }
    case "family_delete":
      state.family = state.family.filter((m: Any) => m.id !== p.id);
      state.suggestions = [];
      return { save: true };
    case "settings_save": {
      const s = state.settings;
      if (p.persons !== undefined) s.persons = Math.min(Math.max(Math.round(Number(p.persons)) || 1, 1), 20);
      if (p.budget_month !== undefined) s.budget_month = Math.max(Math.round(Number(p.budget_month)) || 0, 0);
      if (p.shop_prefs !== undefined) s.shop_prefs = text(p.shop_prefs);
      if (p.traces_ok !== undefined) s.traces_ok = !!p.traces_ok;
      if (p.bilka_url !== undefined) {
        const url = text(p.bilka_url, 300);
        if (!/^https:\/\/.+\{q\}/.test(url)) throw new ApiError("Søge-linket skal starte med https:// og indeholde {q}.");
        s.bilka_url = url;
      }
      return { save: true };
    }

    // --------------------------------------------------------------- lager
    case "parse_text": {
      const input = text(p.text, 4000);
      if (!input) throw new ApiError("Skriv, hvad I har.");
      let items: Any[] | null = null, note = "";
      if (deps.geminiKey) {
        try { items = await parseItemsText(deps.geminiKey, deps.geminiModel, input); }
        catch (err) { if (!(err instanceof AIError)) throw err; note = `${err.message} Bruger simpel tolkning i stedet.`; }
      }
      items ??= parseTextFallback(input);
      return { extra: { items: items.map(L.makeItem).filter((i) => i.name), note } };
    }
    case "parse_image": {
      const data = String(p.image_base64 ?? "");
      if (!data || data.length > 8_000_000) throw new ApiError("Billedet mangler eller er for stort (højst ca. 5 MB).");
      const mime = /^image\/(jpeg|png|webp)$/.test(p.mime) ? p.mime : "image/jpeg";
      const items = await ai(() => parseItemsImage(deps.geminiKey, deps.geminiModel, data, mime, p.kind === "bon" ? "bon" : "koleskab"));
      return { extra: { items: items.map(L.makeItem).filter((i) => i.name), note: "" } };
    }
    case "inventory_add": {
      const items = list(p.items).slice(0, 200);
      if (state.inventory.length + items.length > 600) throw new ApiError("Lageret er fyldt op (600 varer).");
      for (const raw of items) L.addItem(state, { ...raw, id: undefined, name: text(raw.name, 80) });
      L.syncStaples(state);
      return { save: items.length > 0 };
    }
    case "inventory_adjust": {
      const item = findInv(p.id);
      const delta = Number(p.delta) || 0;
      if (delta < 0) L.deduct(state, item.id, -delta);
      else item.qty = Math.round((item.qty + delta) * 1000) / 1000;
      L.syncStaples(state);
      return { save: true };
    }
    case "inventory_update": {
      const item = findInv(p.item?.id);
      const name = text(p.item.name, 80);
      if (!name) throw new ApiError("Varen skal have et navn.");
      const updated = L.makeItem({ ...p.item, name });
      updated.qty = Math.max(Number(p.item.qty) || 0, 0); // makeItem behandler tom mængde som 1
      Object.assign(item, updated);
      L.syncStaples(state);
      return { save: true };
    }
    case "inventory_delete":
      state.inventory = state.inventory.filter((i: Any) => i.id !== p.id);
      L.syncStaples(state);
      return { save: true };

    // -------------------------------------------------------------- indkøb
    case "shopping_add": {
      if (!text(p.name)) throw new ApiError("Skriv en vare.");
      if (state.shopping.length >= 300) throw new ApiError("Indkøbslisten er fyldt op.");
      L.addShopping(state, text(p.name, 80), text(p.amount, 40), "", p.category, "manual");
      return { save: true };
    }
    case "shopping_toggle": {
      const entry = state.shopping.find((e: Any) => e.id === p.id);
      if (entry) entry.in_cart = !!p.in_cart;
      return { save: !!entry };
    }
    case "shopping_remove": {
      const entry = state.shopping.find((e: Any) => e.id === p.id);
      if (!entry) return {};
      state.shopping = state.shopping.filter((e: Any) => e !== entry);
      if (entry.source === "auto") {
        // Ellers ville den faste vare straks komme tilbage på listen.
        for (const i of state.inventory) if (i.name.toLowerCase() === entry.name.toLowerCase()) i.min_qty = null;
      }
      return { save: true };
    }
    case "order_complete": {
      const names = L.receivePurchased(state);
      if (!names.length) throw new ApiError("Sæt flueben ved de varer, der er købt.");
      L.recordOrder(state, Number(p.amount) || null);
      L.syncStaples(state);
      return { save: true, extra: { received: names } };
    }

    // ---------------------------------------------------------- opskrifter
    case "recipes_generate": {
      if (!state.inventory.some((i: Any) => i.qty > 0)) throw new ApiError("Lageret er tomt – tilføj varer først.");
      const eaters = Array.isArray(p.eaters) && p.eaters.length ? p.eaters.map(String) : null;
      const profile = L.familyProfile(state, eaters);
      const clamp = (v: unknown, lo: number, hi: number, def: number) => Math.min(Math.max(Math.round(Number(v)) || def, lo), hi);
      const opts = {
        count: clamp(p.count, 1, 7, 3), persons: clamp(p.persons, 1, 20, state.settings.persons),
        max_time: clamp(p.max_time, 10, 180, 20), max_missing: Math.min(Math.max(Math.round(Number(p.max_missing)) || 0, 0), 6),
        meal: text(p.meal, 30) || "Aftensmad", wishes: text(p.wishes),
        traces: state.settings.traces_ok ? "Varer med 'kan indeholde spor af' er i orden."
          : "Undgå også varer, der typisk er mærket 'kan indeholde spor af' allergenerne.",
      };
      // Varer med de spisendes allergener sendes slet ikke til AI'en.
      const usable = state.inventory.filter((i: Any) => !L.checkText(i.name, profile).length);
      state.suggestions = await ai(() => generateRecipes(deps.geminiKey, deps.geminiModel, usable, profile, opts));
      return { save: true };
    }
    case "recipe_save": {
      const r = findRecipe(p.id);
      if (r.allergy_hits?.length) throw new ApiError("Opskriften rammer familiens allergier og kan ikke gemmes.");
      if (!state.saved_recipes.some((x: Any) => x.title === r.title)) state.saved_recipes.push({ ...r, id: L.newId() });
      return { save: true };
    }
    case "recipe_delete":
      state.saved_recipes = state.saved_recipes.filter((r: Any) => r.id !== p.id);
      return { save: true };
    case "recipe_shop": {
      const stock = new Set(state.inventory.map((i: Any) => i.id));
      const recipes = p.id ? [findRecipe(p.id)] : state.suggestions.filter((r: Any) => !r.allergy_hits?.length);
      let count = 0;
      for (const r of recipes) {
        for (const ing of r.ingredients ?? []) {
          if (stock.has(ing.inventory_id)) continue;
          L.addShopping(state, ing.name, ing.amount ?? "", r.title, ing.category, "recipe");
          count++;
        }
      }
      return { save: count > 0, extra: { added: count } };
    }
    case "recipe_cooked": {
      const r = findRecipe(p.id);
      for (const u of list(p.used)) {
        const qty = Number(u.qty);
        if (qty > 0 && state.inventory.some((i: Any) => i.id === u.inventory_id)) L.deduct(state, u.inventory_id, qty);
      }
      state.log = [{ date: L.today(), title: r.title }, ...state.log].slice(0, 50);
      L.syncStaples(state);
      return { save: true };
    }

    // -------------------------------------------------------- tilbagekald
    case "recalls": {
      try {
        const feed = await fetchRecalls();
        return { extra: { relevant: relevant(feed, state, L.familyProfile(state)), latest: feed.slice(0, 15), total: feed.length, page: PAGE } };
      } catch (_err) {
        return { extra: { relevant: [], latest: [], total: 0, page: PAGE, error: true } };
      }
    }
    default:
      throw new ApiError("Ukendt handling.");
  }
}

export { finalizeRecipe };
