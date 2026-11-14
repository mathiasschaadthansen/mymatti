// Samme regler som mymatti/core.py, så Claude og web-appen behandler lager, indkøb og allergier ens.
import { ALLERGENS, FREE_TEXT_ALIASES } from "./allergens.ts";

// deno-lint-ignore no-explicit-any
export type Any = any;
export type State = Any;

export const CATEGORIES = ["Frugt & grønt", "Mejeri & æg", "Kød & fisk", "Brød & bagværk", "Kolonial", "Frost", "Drikkevarer", "Andet"];
export const LOCATIONS = ["Køleskab", "Fryser", "Kolonial"];
export const UNITS = ["stk", "g", "kg", "ml", "dl", "l", "pk", "dåse", "glas", "pose", "bundt", "flaske"];
const MASS: Record<string, number> = { g: 1, kg: 1000 };
const VOL: Record<string, number> = { ml: 1, cl: 10, dl: 100, l: 1000 };
const UNIT_ALIASES: Record<string, string> = {
  gram: "g", kilo: "kg", liter: "l", ltr: "l", styk: "stk", "stk.": "stk", pakke: "pk", pakker: "pk",
  "pk.": "pk", "dåser": "dåse", poser: "pose", flasker: "flaske", bundter: "bundt",
};
const CATEGORY_LOCATION: Record<string, string> = {
  Frost: "Fryser", "Mejeri & æg": "Køleskab", "Kød & fisk": "Køleskab", "Frugt & grønt": "Køleskab",
};

export function today(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Copenhagen" }).format(new Date());
}

export function newId(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 8);
}

export function normalizeState(state: Any): State {
  const base: Any = {
    family: [], settings: {}, inventory: [], suggestions: [], saved_recipes: [], shopping: [], orders: [], log: [],
  };
  const s = state && typeof state === "object" && !Array.isArray(state) ? state : {};
  for (const [key, def] of Object.entries(base)) {
    const ok = Array.isArray(def) ? Array.isArray(s[key]) : s[key] && typeof s[key] === "object" && !Array.isArray(s[key]);
    if (!ok) s[key] = def;
  }
  const defaults: Any = {
    persons: 4, bilka_url: "https://www.bilkatogo.dk/s/?query={q}", budget_month: 0,
    shop_prefs: "Vælg økologisk, når det findes", traces_ok: true,
  };
  for (const [key, def] of Object.entries(defaults)) if (!(key in s.settings)) s.settings[key] = def;
  return s;
}

// ------------------------------------------------------------------ enheder
export function normUnit(unit: unknown): string {
  let u = String(unit ?? "stk").trim().toLowerCase();
  u = UNIT_ALIASES[u] ?? u;
  return UNITS.includes(u) ? u : "stk";
}

export function convert(qty: number, src: string, dst: string): number | null {
  const a = normUnit(src), b = normUnit(dst);
  if (a === b) return qty;
  for (const table of [MASS, VOL]) if (a in table && b in table) return qty * table[a] / table[b];
  return null;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function fmtQty(qty: number, unit = ""): string {
  const text = qty.toFixed(2).replace(/\.?0+$/, "").replace(".", ",");
  return `${text} ${unit}`.trim();
}

/** Tolk en mængde som "500 g", "2 l" eller "3" til tal og enhed. */
export function parseAmount(amount: string): { qty: number; unit: string } {
  const m = /^\s*(?:mindst\s+)?(\d+(?:[.,]\d+)?)\s*([a-zæøå]+\.?)?/i.exec(amount ?? "");
  if (!m) return { qty: 1, unit: "stk" };
  let word = (m[2] ?? "").toLowerCase();
  word = UNIT_ALIASES[word] ?? word;
  return { qty: Number(m[1].replace(",", ".")), unit: UNITS.includes(word) ? word : "stk" };
}

const cap = (s: string) => s.slice(0, 1).toUpperCase() + s.slice(1);
const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return v === null || v === undefined || v === "" || Number.isNaN(n) ? null : n;
};
const validDate = (v: unknown): string | null =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null;

// --------------------------------------------------------------- beholdning
export function daysLeft(item: Any): number | null {
  const exp = validDate(item.expires);
  if (!exp) return null;
  return Math.round((Date.parse(exp) - Date.parse(today())) / 86400000);
}

export function makeItem(raw: Any): Any {
  let expires = validDate(raw.expires);
  const fresh = num(raw.days_fresh);
  if (!expires && fresh && fresh > 0) {
    expires = new Date(Date.parse(today()) + Math.round(fresh) * 86400000).toISOString().slice(0, 10);
  }
  const qty = num(raw.qty);
  const min = num(raw.min_qty);
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : newId(),
    name: cap(String(raw.name ?? "").trim()),
    qty: qty === null ? 1 : Math.max(qty, 0),
    unit: normUnit(raw.unit),
    category: CATEGORIES.includes(raw.category) ? raw.category : "Andet",
    location: LOCATIONS.includes(raw.location) ? raw.location : "Kolonial",
    expires,
    min_qty: min && min > 0 ? min : null,
  };
}

export function addItem(state: State, raw: Any): Any {
  const item = makeItem(raw);
  if (!item.name) return null;
  for (const existing of state.inventory) {
    if (existing.name.toLowerCase() === item.name.toLowerCase() && existing.location === item.location) {
      const converted = convert(item.qty, item.unit, existing.unit);
      if (converted !== null) {
        existing.qty = round3(existing.qty + converted);
        const dates = [existing.expires, item.expires].filter(Boolean).sort();
        existing.expires = dates[0] ?? null; // behold den tidligste dato
        if (item.min_qty) existing.min_qty = item.min_qty;
        return existing;
      }
    }
  }
  state.inventory.push(item);
  return item;
}

export function deduct(state: State, itemId: string, qty: number): void {
  const item = state.inventory.find((i: Any) => i.id === itemId);
  if (!item) return;
  item.qty = round3(Math.max(item.qty - qty, 0));
  // Faste varer bliver stående på 0, så de kan genbestilles.
  if (item.qty <= 0 && !item.min_qty) state.inventory = state.inventory.filter((i: Any) => i !== item);
}

export function findItem(state: State, ref: Any): Any {
  if (ref.id) return state.inventory.find((i: Any) => i.id === ref.id) ?? null;
  const name = String(ref.name ?? "").trim().toLowerCase();
  if (!name) return null;
  return state.inventory.find((i: Any) => i.name.toLowerCase() === name) ??
    state.inventory.find((i: Any) => i.name.toLowerCase().includes(name)) ?? null;
}

export const lowStock = (state: State) => state.inventory.filter((i: Any) => i.min_qty && i.qty < i.min_qty);

// ------------------------------------------------------------------- indkøb
export function addShopping(state: State, nameRaw: string, amount = "", reason = "", category = "Andet", source = "manual"): void {
  const name = cap(String(nameRaw ?? "").trim());
  if (!name) return;
  const entry = state.shopping.find((e: Any) => e.name.toLowerCase() === name.toLowerCase());
  if (entry) {
    if (reason && !(entry.reason ?? "").includes(reason)) entry.reason = [entry.reason, reason].filter(Boolean).join(", ");
    if (amount && !entry.amount) entry.amount = amount;
    return;
  }
  state.shopping.push({
    id: newId(), name, amount, reason, category: CATEGORIES.includes(category) ? category : "Andet", source, in_cart: false,
  });
}

export function syncStaples(state: State): void {
  const low = new Map<string, Any>(lowStock(state).map((i: Any) => [i.name.toLowerCase(), i]));
  state.shopping = state.shopping.filter((e: Any) => e.source !== "auto" || e.in_cart || low.has(e.name.toLowerCase()));
  for (const item of low.values()) {
    const amount = "mindst " + fmtQty(item.min_qty - item.qty, item.unit);
    const existing = state.shopping.find((e: Any) => e.name.toLowerCase() === item.name.toLowerCase());
    if (!existing) addShopping(state, item.name, amount, "Under minimumsbeholdning", item.category, "auto");
    else if (existing.source === "auto" && !existing.in_cart) existing.amount = amount;
  }
}

export function receivePurchased(state: State): string[] {
  const bought = state.shopping.filter((e: Any) => e.in_cart);
  for (const entry of bought) {
    const { qty, unit } = parseAmount(entry.amount ?? "");
    const existing = state.inventory.find((i: Any) => i.name.toLowerCase() === entry.name.toLowerCase());
    addItem(state, {
      name: entry.name, qty, unit, category: entry.category,
      location: existing ? existing.location : CATEGORY_LOCATION[entry.category],
    });
  }
  state.shopping = state.shopping.filter((e: Any) => !e.in_cart);
  return bought.map((e: Any) => e.name);
}

export function recordOrder(state: State, amount: number | null): void {
  if (amount && amount > 0) {
    state.orders.unshift({ date: today(), amount: Math.round(amount * 100) / 100 });
    state.orders.length = Math.min(state.orders.length, 200);
  }
}

export function monthSpent(state: State): number {
  const prefix = today().slice(0, 7);
  return state.orders.filter((o: Any) => String(o.date).startsWith(prefix)).reduce((sum: number, o: Any) => sum + o.amount, 0);
}

// ---------------------------------------------------------------- allergier
const COMPILED = Object.entries(ALLERGENS).map(([key, spec]) => ({
  key,
  label: spec.label,
  pattern: new RegExp(spec.pattern, "iu"),
  ignore: spec.ignore ? new RegExp(spec.ignore, "giu") : null,
  free: spec.free ? new RegExp(spec.free, "iu") : null,
}));

export const allergenLabel = (key: string) => ALLERGENS[key]?.label ?? key;

export function allergensIn(text: string): string[] {
  const low = String(text ?? "").toLowerCase();
  const found: string[] = [];
  for (const spec of COMPILED) {
    if (spec.free && spec.free.test(low)) continue;
    const cleaned = spec.ignore ? low.replace(spec.ignore, " ") : low;
    if (spec.pattern.test(cleaned)) found.push(spec.key);
  }
  return found;
}

function searchTerms(term: string): string[] {
  for (const [key, aliases] of Object.entries(FREE_TEXT_ALIASES)) if (term.startsWith(key)) return aliases;
  return [term.length > 4 && /[er]$/.test(term) ? term.slice(0, -1) : term];
}

export type Profile = { allergens: Record<string, string[]>; other: Record<string, string[]>; dislikes: string[]; names: string[] };

export function familyProfile(state: State, eaters?: string[] | null): Profile {
  const wanted = eaters && eaters.length ? eaters.map((e) => e.toLowerCase()) : null;
  const members = state.family.filter((m: Any) => !wanted || wanted.includes(String(m.name).toLowerCase()) || wanted.includes(m.id));
  const profile: Profile = { allergens: {}, other: {}, dislikes: [], names: members.map((m: Any) => m.name) };
  for (const m of members) {
    for (const key of m.allergies ?? []) if (key in ALLERGENS) (profile.allergens[key] ??= []).push(m.name);
    for (const part of String(m.other_allergies ?? "").split(/[,;\n]+/)) {
      const term = part.trim().toLowerCase();
      if (term.length >= 3) (profile.other[term] ??= []).push(m.name);
    }
    if (String(m.dislikes ?? "").trim()) profile.dislikes.push(`${m.name}: ${String(m.dislikes).trim()}`);
  }
  return profile;
}

export function checkText(text: string, profile: Profile): string[] {
  const hits: string[] = [];
  for (const key of allergensIn(text).sort()) {
    if (key in profile.allergens) hits.push(`${allergenLabel(key)} (${profile.allergens[key].join(", ")})`);
  }
  const low = String(text ?? "").toLowerCase();
  for (const [term, who] of Object.entries(profile.other)) {
    if (searchTerms(term).some((word) => low.includes(word))) hits.push(`${cap(term)} (${who.join(", ")})`);
  }
  return hits;
}

export function checkRecipe(recipe: Any, profile: Profile): string[] {
  const hits: string[] = [];
  const texts = [recipe.title ?? "", ...(recipe.ingredients ?? []).map((i: Any) => i.name ?? "")];
  for (const text of texts) {
    for (const hit of checkText(text, profile)) {
      const line = `${hit} – fundet i «${text}»`;
      if (!hits.includes(line)) hits.push(line);
    }
  }
  return hits;
}
