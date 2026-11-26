// Tilbagekaldte fødevarer fra Fødevarestyrelsens RSS-feed, holdt op mod husstandens varer.
import * as L from "./logic.ts";
import type { Any, Profile, State } from "./logic.ts";

const FEED = "https://www.foedevarestyrelsen.dk/handlers/DynamicRss.ashx?id=8c2cdc12-6a58-43d1-8b4e-97aa96dedd0c";
export const PAGE = "https://www.foedevarestyrelsen.dk/nyheder/tilbagekaldte-produkter";
const STOP = new Set(["tilbagekald", "tilbagekalder", "tilbagekaldes", "produkt", "produktet", "produkter", "danmark",
  "økologisk", "økologiske", "frisk", "friske", "hakket", "store", "små", "uden", "med"]);

const unescape = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const tag = (xml: string, name: string) => unescape(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml)?.[1] ?? "");

export function parseFeed(xml: string): Any[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
    const time = Date.parse(tag(m[1], "pubDate"));
    return { title: tag(m[1], "title"), link: tag(m[1], "link") || PAGE, description: tag(m[1], "description"),
      published: Number.isNaN(time) ? null : new Date(time).toISOString().slice(0, 10) };
  });
}

let cache: { at: number; items: Any[] } | null = null;

export async function fetchRecalls(maxAgeDays = 60): Promise<Any[]> {
  if (!cache || Date.now() - cache.at > 3600_000) {
    const resp = await fetch(FEED);
    if (!resp.ok) throw new Error(`feed ${resp.status}`);
    cache = { at: Date.now(), items: parseFeed(await resp.text()) };
  }
  const cutoff = new Date(Date.now() - maxAgeDays * 86400000).toISOString().slice(0, 10);
  return cache.items.filter((r) => !r.published || r.published >= cutoff);
}

const words = (text: string) => new Set((text.toLowerCase().match(/[a-zæøåéü]{4,}/g) ?? []).filter((w) => !STOP.has(w)));

function matches(name: string, recallWords: Set<string>): boolean {
  const own = [...words(name)];
  if (!own.length) return false;
  return own.every((w) => [...recallWords].some((rw) => rw.includes(w) || (rw.length >= 5 && w.includes(rw))));
}

export function relevant(recalls: Any[], state: State, profile: Profile): Any[] {
  const names = [...state.inventory.map((i: Any) => i.name), ...state.shopping.map((e: Any) => e.name)];
  const out = [];
  for (const recall of recalls) {
    const text = `${recall.title} ${recall.description}`;
    const rw = words(text);
    const items = [...new Set(names.filter((n) => matches(n, rw)))].sort();
    const undeclared = /udeklareret|ikke deklareret|ikke mærket|fremgår ikke|ikke fremgår|allergi/i.test(text)
      ? L.allergensIn(recall.title).filter((a) => a in profile.allergens) : [];
    if (items.length || undeclared.length) out.push({ ...recall, items, allergens: undeclared.map(L.allergenLabel) });
  }
  return out;
}
