"""AI-kald (Google Gemini): tolk varer fra tekst/billede og lav opskrifter ud fra beholdningen."""
from __future__ import annotations

import base64
import json
import time

import requests

from .core import ALLERGENS, CATEGORIES, LOCATIONS, UNITS, check_recipe, days_left, fmt_qty, new_id
from .storage import secret

API = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
DEFAULT_MODEL = "gemini-flash-latest"


class AIError(RuntimeError):
    pass


def available() -> bool:
    return bool(secret("GEMINI_API_KEY"))


def _call(parts: list[dict], schema: dict, temperature: float = 0.4) -> list:
    key = secret("GEMINI_API_KEY")
    if not key:
        raise AIError("Der mangler en GEMINI_API_KEY – se README.")
    body = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "temperature": temperature,
            "responseMimeType": "application/json",
            "responseSchema": schema,
        },
    }
    url = API.format(model=secret("GEMINI_MODEL") or DEFAULT_MODEL)
    resp = None
    for attempt in range(2):  # ét genforsøg ved forbigående fejl hos tjenesten
        try:
            resp = requests.post(url, headers={"x-goog-api-key": key}, json=body, timeout=120)
        except requests.RequestException as exc:
            if attempt:
                raise AIError(f"Kunne ikke få forbindelse til AI-tjenesten: {exc}") from exc
            continue
        if resp.status_code not in (429, 500, 502, 503, 504):
            break
        time.sleep(2)
    if resp is not None and resp.status_code == 402:
        raise AIError("Der er ikke flere penge på Gemini-kontoen. Fyld op i Google AI Studio "
                      "(https://ai.studio/projects), og prøv igen.")
    if resp is None or resp.status_code != 200:
        raise AIError(f"AI-tjenesten svarede med fejl {resp.status_code}. Prøv igen om lidt. "
                      f"({resp.text[:200]})")
    try:
        text = "".join(p.get("text", "") for p in resp.json()["candidates"][0]["content"]["parts"])
        data = json.loads(text)
    except (KeyError, IndexError, ValueError) as exc:
        raise AIError("AI-svaret kunne ikke læses. Prøv igen.") from exc
    if not isinstance(data, list):
        raise AIError("AI-svaret havde et uventet format. Prøv igen.")
    return [d for d in data if isinstance(d, dict)]


# ---------------------------------------------------------------- varer ind
_ITEMS_SCHEMA = {
    "type": "ARRAY",
    "items": {
        "type": "OBJECT",
        "properties": {
            "name": {"type": "STRING"},
            "qty": {"type": "NUMBER"},
            "unit": {"type": "STRING", "enum": UNITS},
            "category": {"type": "STRING", "enum": CATEGORIES},
            "location": {"type": "STRING", "enum": LOCATIONS},
            "days_fresh": {"type": "INTEGER", "nullable": True},
        },
        "required": ["name", "qty", "unit", "category", "location"],
    },
}

_ITEMS_RULES = """
Returnér hver vare med:
- name: kort dansk varenavn uden mængde (fx "Hakket oksekød", "Letmælk").
- qty og unit: mængden. Gæt en almindelig dansk pakkestørrelse, hvis den ikke fremgår.
- category og location: hvor varen hører til, og hvor den normalt opbevares.
- days_fresh: realistisk antal dage varen typisk holder sig fra i dag ved korrekt opbevaring
  (null for varer med meget lang holdbarhed som ris, mel, dåser og krydderier).
Medtag kun madvarer og drikkevarer. Slå ens varer sammen.
"""


def parse_items_text(text: str) -> list[dict]:
    prompt = ("Du hjælper en dansk familie med at holde styr på deres madvarer. "
              "Fortolk denne liste over varer, de har derhjemme:\n\n" + text + "\n" + _ITEMS_RULES)
    return _call([{"text": prompt}], _ITEMS_SCHEMA, temperature=0.1)


def parse_items_image(image: bytes, mime: str, kind: str) -> list[dict]:
    what = ("en kassebon eller ordrebekræftelse fra et dagligvareindkøb. Udtræk de købte madvarer"
            if kind == "bon" else
            "et køleskab, en fryser eller et køkkenskab. Find de madvarer, du tydeligt kan se")
    prompt = f"Billedet viser {what}.\n" + _ITEMS_RULES
    parts = [{"inlineData": {"mimeType": mime, "data": base64.b64encode(image).decode()}},
             {"text": prompt}]
    return _call(parts, _ITEMS_SCHEMA, temperature=0.1)


# ----------------------------------------------------------------- opskrifter
_RECIPES_SCHEMA = {
    "type": "ARRAY",
    "items": {
        "type": "OBJECT",
        "properties": {
            "title": {"type": "STRING"},
            "description": {"type": "STRING"},
            "time_min": {"type": "INTEGER"},
            "servings": {"type": "INTEGER"},
            "ingredients": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "name": {"type": "STRING"},
                        "amount": {"type": "STRING"},
                        "inventory_id": {"type": "STRING", "nullable": True},
                        "use_qty": {"type": "NUMBER", "nullable": True},
                        "category": {"type": "STRING", "enum": CATEGORIES},
                    },
                    "required": ["name", "amount", "category"],
                },
            },
            "steps": {"type": "ARRAY", "items": {"type": "STRING"}},
            "allergens": {"type": "ARRAY", "items": {"type": "STRING", "enum": list(ALLERGENS)}},
            "tip": {"type": "STRING"},
        },
        "required": ["title", "description", "time_min", "servings", "ingredients", "steps", "allergens"],
    },
}


def build_recipe_prompt(inventory: list[dict], profile: dict, opts: dict) -> str:
    lines = []
    for item in sorted(inventory, key=lambda i: (days_left(i) is None, days_left(i) or 0)):
        if item["qty"] <= 0:
            continue
        left = days_left(item)
        fresh = "" if left is None else (" | UDLØBET" if left < 0 else f" | holder ca. {left} dage endnu")
        lines.append(f"- id={item['id']} | {item['name']} | {fmt_qty(item['qty'], item['unit'])}"
                     f" | {item['location']}{fresh}")

    forbidden = [f"- {ALLERGENS[k]['label']} (gælder: {', '.join(who)})"
                 for k, who in profile["allergens"].items()]
    forbidden += [f"- {term} (gælder: {', '.join(who)})" for term, who in profile["other"].items()]
    allergy_block = "\n".join(forbidden) if forbidden else "- Ingen registrerede allergier."
    dislikes = "\n".join(f"- {d}" for d in profile["dislikes"]) or "- Ingen."

    return f"""Du er en dansk hverdagskok, der hjælper en familie med at bruge det, de allerede har,
så mindst muligt går til spilde.

LAGERBEHOLDNING (id | vare | mængde | placering | holdbarhed):
{chr(10).join(lines) or "- (tom)"}

ALLERGIER – ABSOLUTTE KRAV:
{allergy_block}
Ingen opskrift må indeholde disse allergener – heller ikke skjult i sammensatte varer
(fx sojasauce indeholder hvede, pesto indeholder nødder og ost, bouillon kan indeholde selleri).
Brug IKKE lagervarer, der indeholder allergenerne. Er du i tvivl om en vare, så udelad den.
{opts.get('traces') or ''}

KAN IKKE LIDE (undgå hvis muligt):
{dislikes}

OPGAVE:
Lav {opts['count']} forskellige forslag til {opts['meal'].lower()} til {opts['persons']} personer.
- Højst {opts['max_time']} minutters samlet tilberedning.
- Brug først og fremmest varer fra lageret, og prioritér dem der udløber snarest. Brug ikke udløbne varer.
- Hver opskrift må højst kræve {opts['max_missing']} varer, som ikke er på lager.
  Salt, peber og vand må antages at være der; alt andet skal stå på lagerlisten eller tælle som manglende.
- Tilpas mængderne til antal personer, så der ikke laves for meget.
- Forslagene skal kunne laves i samme uge: tilsammen må de ikke bruge mere af en lagervare, end der er,
  og de skal være tydeligt forskellige fra hinanden.
- Særlige ønsker fra familien: {opts.get('wishes') or 'ingen'}.

FORMAT:
- ingredients: for en ingrediens fra lageret sættes inventory_id til varens id og use_qty til
  forbruget i lagervarens egen enhed (må ikke overstige beholdningen). For en vare der skal købes,
  sættes inventory_id og use_qty til null. amount er mængden skrevet til mennesker (fx "2 dl", "1 stk").
- steps: korte, tydelige trin på dansk.
- allergens: alle EU-allergener, som retten indeholder (også dem familien godt kan tåle).
- tip: ét kort råd om opbevaring af rester eller om at undgå madspild.
"""


def generate_recipes(inventory: list[dict], profile: dict, opts: dict) -> list[dict]:
    raw = _call([{"text": build_recipe_prompt(inventory, profile, opts)}], _RECIPES_SCHEMA, temperature=0.7)
    return [finalize_recipe(r, inventory, profile) for r in raw]


def finalize_recipe(recipe: dict, inventory: list[dict], profile: dict) -> dict:
    """Validér AI-svaret mod det faktiske lager og kør det uafhængige allergitjek."""
    stock = {i["id"]: i for i in inventory}
    recipe["ingredients"] = [i for i in recipe.get("ingredients") or [] if isinstance(i, dict)]
    for ing in recipe["ingredients"]:
        item = stock.get(ing.get("inventory_id") or "")
        if item is None:
            ing["inventory_id"], ing["use_qty"] = None, None
        else:
            try:
                wanted = float(ing.get("use_qty") or 0)
            except (TypeError, ValueError):
                wanted = 0.0
            ing["use_qty"] = round(min(max(wanted, 0.0), item["qty"]), 3)
            ing["unit"] = item["unit"]
    recipe["id"] = new_id()
    recipe["eaters"] = profile["names"]
    recipe["allergy_hits"] = check_recipe(recipe, profile)
    return recipe
