// AI-kald til Google Gemini: tolk varer fra tekst/billede og lav opskrifter ud fra lageret.
import * as L from "./logic.ts";
import type { Any, Profile } from "./logic.ts";
import { ALLERGENS } from "./allergens.ts";

export class AIError extends Error {}

const MODEL_DEFAULT = "gemini-flash-lite-latest";

async function call(key: string, model: string, parts: Any[], schema: Any, temperature: number): Promise<Any[]> {
  if (!key) throw new AIError("AI er ikke sat op endnu. Lager og indkøb virker stadig.");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model || MODEL_DEFAULT}:generateContent`;
  const body = JSON.stringify({
    contents: [{ role: "user", parts }],
    generationConfig: { temperature, responseMimeType: "application/json", responseSchema: schema },
  });
  let resp: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      resp = await fetch(url, { method: "POST", headers: { "x-goog-api-key": key, "Content-Type": "application/json" }, body });
    } catch (_err) {
      if (attempt) throw new AIError("Kunne ikke få forbindelse til AI-tjenesten. Prøv igen.");
      continue;
    }
    if (![429, 500, 502, 503, 504].includes(resp.status)) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (resp?.status === 402) throw new AIError("Der er ikke flere penge på Gemini-kontoen.");
  if (resp?.status === 429) throw new AIError("AI-tjenestens gratis kvote er brugt for nu. Prøv igen senere.");
  if (!resp || resp.status !== 200) throw new AIError(`AI-tjenesten svarede med fejl ${resp?.status ?? "?"}. Prøv igen om lidt.`);
  try {
    const data = await resp.json();
    const text = data.candidates[0].content.parts.map((p: Any) => p.text ?? "").join("");
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error("not a list");
    return parsed.filter((x) => x && typeof x === "object");
  } catch (_err) {
    throw new AIError("AI-svaret kunne ikke læses. Prøv igen.");
  }
}

const ITEMS_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      name: { type: "STRING" }, qty: { type: "NUMBER" }, unit: { type: "STRING", enum: L.UNITS },
      category: { type: "STRING", enum: L.CATEGORIES }, location: { type: "STRING", enum: L.LOCATIONS },
      days_fresh: { type: "INTEGER", nullable: true },
    },
    required: ["name", "qty", "unit", "category", "location"],
  },
};

const ITEMS_RULES = `
Returnér hver vare med:
- name: kort dansk varenavn uden mængde (fx "Hakket oksekød", "Letmælk").
- qty og unit: mængden. Gæt en almindelig dansk pakkestørrelse, hvis den ikke fremgår.
- category og location: hvor varen hører til, og hvor den normalt opbevares.
- days_fresh: realistisk antal dage varen typisk holder sig fra i dag ved korrekt opbevaring
  (null for varer med meget lang holdbarhed som ris, mel, dåser og krydderier).
Medtag kun madvarer og drikkevarer. Slå ens varer sammen.`;

export function parseItemsText(key: string, model: string, text: string): Promise<Any[]> {
  const prompt = "Du hjælper en dansk familie med at holde styr på deres madvarer. " +
    "Fortolk denne liste over varer, de har derhjemme:\n\n" + text + "\n" + ITEMS_RULES;
  return call(key, model, [{ text: prompt }], ITEMS_SCHEMA, 0.1);
}

export function parseItemsImage(key: string, model: string, base64: string, mime: string, kind: string): Promise<Any[]> {
  const what = kind === "bon"
    ? "en kassebon eller ordrebekræftelse fra et dagligvareindkøb. Udtræk de købte madvarer"
    : "et køleskab, en fryser eller et køkkenskab. Find de madvarer, du tydeligt kan se";
  return call(key, model, [{ inlineData: { mimeType: mime, data: base64 } }, { text: `Billedet viser ${what}.\n${ITEMS_RULES}` }], ITEMS_SCHEMA, 0.1);
}

const RECIPES_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      title: { type: "STRING" }, description: { type: "STRING" }, time_min: { type: "INTEGER" }, servings: { type: "INTEGER" },
      ingredients: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            name: { type: "STRING" }, amount: { type: "STRING" }, inventory_id: { type: "STRING", nullable: true },
            use_qty: { type: "NUMBER", nullable: true }, category: { type: "STRING", enum: L.CATEGORIES },
          },
          required: ["name", "amount", "category"],
        },
      },
      steps: { type: "ARRAY", items: { type: "STRING" } },
      allergens: { type: "ARRAY", items: { type: "STRING", enum: Object.keys(ALLERGENS) } },
      tip: { type: "STRING" },
    },
    required: ["title", "description", "time_min", "servings", "ingredients", "steps", "allergens"],
  },
};

export function buildRecipePrompt(inventory: Any[], profile: Profile, opts: Any): string {
  const lines = [...inventory]
    .filter((i) => i.qty > 0)
    .sort((a, b) => (L.daysLeft(a) ?? 9999) - (L.daysLeft(b) ?? 9999))
    .map((i) => {
      const left = L.daysLeft(i);
      const fresh = left === null ? "" : left < 0 ? " | UDLØBET" : ` | holder ca. ${left} dage endnu`;
      return `- id=${i.id} | ${i.name} | ${L.fmtQty(i.qty, i.unit)} | ${i.location}${fresh}`;
    });
  const forbidden = [
    ...Object.entries(profile.allergens).map(([k, who]) => `- ${L.allergenLabel(k)} (gælder: ${who.join(", ")})`),
    ...Object.entries(profile.other).map(([term, who]) => `- ${term} (gælder: ${who.join(", ")})`),
    ...Object.entries(profile.tolerates).map(([who, terms]) => `- UNDTAGELSE: ${who} tåler alligevel ${terms.join(", ")}`),
  ];
  return `Du er en dansk hverdagskok, der hjælper en familie med at bruge det, de allerede har,
så mindst muligt går til spilde.

LAGERBEHOLDNING (id | vare | mængde | placering | holdbarhed):
${lines.join("\n") || "- (tom)"}

ALLERGIER – ABSOLUTTE KRAV:
${forbidden.join("\n") || "- Ingen registrerede allergier."}
Ingen opskrift må indeholde disse allergener – heller ikke skjult i sammensatte varer
(fx sojasauce indeholder hvede, pesto indeholder nødder og ost, bouillon kan indeholde selleri).
Brug IKKE lagervarer, der indeholder allergenerne. Er du i tvivl om en vare, så udelad den.
${opts.traces}

KAN IKKE LIDE (undgå hvis muligt):
${profile.dislikes.map((d) => `- ${d}`).join("\n") || "- Ingen."}

OPGAVE:
Lav ${opts.count} forskellige forslag til ${String(opts.meal).toLowerCase()} til ${opts.persons} personer.
- Højst ${opts.max_time} minutters samlet tilberedning.
- Brug først og fremmest varer fra lageret, og prioritér dem der udløber snarest. Brug ikke udløbne varer.
- Hver opskrift må højst kræve ${opts.max_missing} varer, som ikke er på lager.
  Salt, peber og vand må antages at være der; alt andet skal stå på lagerlisten eller tælle som manglende.
- Tilpas mængderne til antal personer, så der ikke laves for meget.
- Forslagene skal kunne laves i samme uge: tilsammen må de ikke bruge mere af en lagervare, end der er,
  og de skal være tydeligt forskellige fra hinanden.
- Særlige ønsker fra familien: ${opts.wishes || "ingen"}.

FORMAT:
- ingredients: for en ingrediens fra lageret sættes inventory_id til varens id og use_qty til
  forbruget i lagervarens egen enhed (må ikke overstige beholdningen). For en vare der skal købes,
  sættes inventory_id og use_qty til null. amount er mængden skrevet til mennesker (fx "2 dl", "1 stk").
- steps: korte, tydelige trin på dansk.
- allergens: alle EU-allergener, som retten indeholder (også dem familien godt kan tåle).
- tip: ét kort råd om opbevaring af rester eller om at undgå madspild.`;
}

/** Validér AI-svaret mod det faktiske lager og kør det uafhængige allergitjek. */
export function finalizeRecipe(recipe: Any, inventory: Any[], profile: Profile): Any {
  const stock = new Map(inventory.map((i) => [i.id, i]));
  recipe.ingredients = (Array.isArray(recipe.ingredients) ? recipe.ingredients : []).filter((i: Any) => i && typeof i === "object");
  for (const ing of recipe.ingredients) {
    const item = stock.get(ing.inventory_id ?? "");
    if (!item) {
      ing.inventory_id = null;
      ing.use_qty = null;
    } else {
      const wanted = Number(ing.use_qty) || 0;
      ing.use_qty = Math.round(Math.min(Math.max(wanted, 0), item.qty) * 1000) / 1000;
      ing.unit = item.unit;
    }
  }
  recipe.id = L.newId();
  recipe.eaters = profile.names;
  recipe.steps = Array.isArray(recipe.steps) ? recipe.steps.map(String) : [];
  recipe.allergens = (Array.isArray(recipe.allergens) ? recipe.allergens : []).filter((a: Any) => a in ALLERGENS);
  const hits = L.checkRecipe(recipe, profile);
  for (const key of recipe.allergens) {
    if (!(key in profile.allergens) || hits.some((h) => h.includes(L.allergenLabel(key)))) continue;
    // Personer med en undtagelse (fx tåler mandler) er dækket af ordtjekket ovenfor; AI'ens angivelse
    // kan ikke skelne mandler fra andre nødder.
    const who = profile.allergens[key].filter((name) => !profile.tolerates[name]?.length);
    if (who.length) hits.push(`${L.allergenLabel(key)} (${who.join(", ")}) – angivet af AI`);
  }
  recipe.allergy_hits = hits;
  return recipe;
}

export async function generateRecipes(key: string, model: string, inventory: Any[], profile: Profile, opts: Any): Promise<Any[]> {
  const raw = await call(key, model, [{ text: buildRecipePrompt(inventory, profile, opts) }], RECIPES_SCHEMA, 0.7);
  return raw.map((r) => finalizeRecipe(r, inventory, profile));
}
