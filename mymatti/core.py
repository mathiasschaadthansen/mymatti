"""Kilden til allergireglerne (og den oprindelige lager- og indkøbslogik).

Serveren i supabase/functions/mymatti-mcp/ bruger samme regler: kør scripts/gen_allergens.py efter ændringer
i ALLERGENS eller _FREE_TEXT_ALIASES, og tests/mcp_test.mjs tjekker, at de to giver samme svar.
"""
from __future__ import annotations

import re
import uuid
from datetime import date, datetime, timedelta
from urllib.parse import quote

# ---------------------------------------------------------------- konstanter
CATEGORIES = [
    "Frugt & grønt", "Mejeri & æg", "Kød & fisk", "Brød & bagværk",
    "Kolonial", "Frost", "Drikkevarer", "Andet",
]
LOCATIONS = ["Køleskab", "Fryser", "Kolonial"]
UNITS = ["stk", "g", "kg", "ml", "dl", "l", "pk", "dåse", "glas", "pose", "bundt", "flaske"]

DEFAULT_BILKA_URL = "https://www.bilkatogo.dk/s/?query={q}"

_MASS = {"g": 1, "kg": 1000}
_VOL = {"ml": 1, "cl": 10, "dl": 100, "l": 1000}
_UNIT_ALIASES = {
    "gram": "g", "kilo": "kg", "liter": "l", "ltr": "l", "styk": "stk", "stk.": "stk",
    "pakke": "pk", "pakker": "pk", "pk.": "pk", "dåser": "dåse", "poser": "pose",
    "flasker": "flaske", "bundter": "bundt",
}


def new_id() -> str:
    return uuid.uuid4().hex[:8]


def empty_state() -> dict:
    return {
        "family": [],
        "settings": {"persons": 4, "bilka_url": DEFAULT_BILKA_URL, "budget_month": 0,
                     "shop_prefs": "Vælg økologisk, når det findes", "traces_ok": True},
        "inventory": [],
        "suggestions": [],
        "saved_recipes": [],
        "shopping": [],
        "orders": [],
        "log": [],
    }


def normalize_state(state: dict | None) -> dict:
    """Sørg for at alle nøgler findes, også i data gemt af en ældre version."""
    base = empty_state()
    if not isinstance(state, dict):
        return base
    for key, default in base.items():
        if key not in state or not isinstance(state[key], type(default)):
            state[key] = default
    for key, default in base["settings"].items():
        state["settings"].setdefault(key, default)
    return state


# ------------------------------------------------------------------- enheder
def norm_unit(unit: str | None) -> str:
    u = (unit or "stk").strip().lower()
    u = _UNIT_ALIASES.get(u, u)
    return u if u in UNITS else "stk"


def convert(qty: float, src: str, dst: str) -> float | None:
    """Omregn mellem enheder af samme slags. None hvis de ikke kan omregnes."""
    src, dst = norm_unit(src), norm_unit(dst)
    if src == dst:
        return qty
    for table in (_MASS, _VOL):
        if src in table and dst in table:
            return qty * table[src] / table[dst]
    return None


def fmt_qty(qty: float | None, unit: str = "") -> str:
    if qty is None:
        return unit
    text = f"{qty:.2f}".rstrip("0").rstrip(".").replace(".", ",")
    return f"{text} {unit}".strip()


_LINE_RE = re.compile(r"^(\d+(?:[.,]\d+)?)\s*([a-zæøå]+\.?)?\s*(.*)$", re.IGNORECASE)


def parse_line(line: str) -> dict | None:
    """Simpel tolkning af fx '2 l mælk', '500g hakket oksekød', '3 æg' eller 'ris'."""
    line = line.strip(" \t-•*")
    if not line:
        return None
    qty, unit, name = 1.0, "stk", line
    m = _LINE_RE.match(line)
    if m:
        qty = float(m.group(1).replace(",", "."))
        word = (m.group(2) or "").lower()
        word = _UNIT_ALIASES.get(word, word)
        rest = m.group(3).strip()
        if word in UNITS and rest:
            unit, name = word, rest
        else:  # "3 æg" – ordet efter tallet er en del af navnet
            name = f"{m.group(2) or ''} {rest}".strip()
    if not name:
        return None
    return {"name": name[0].upper() + name[1:], "qty": qty, "unit": unit}


def parse_text(text: str) -> list[dict]:
    parts = re.split(r"[\n;]+|,(?!\d)", text)
    return [item for item in (parse_line(p) for p in parts) if item]


# ---------------------------------------------------------------- beholdning
def days_left(item: dict, today: date | None = None) -> int | None:
    if not item.get("expires"):
        return None
    try:
        exp = datetime.strptime(item["expires"], "%Y-%m-%d").date()
    except ValueError:
        return None
    return (exp - (today or date.today())).days


def make_item(raw: dict, today: date | None = None) -> dict:
    """Byg en lagervare ud fra løst strukturerede data (AI, simpel tolkning eller bruger)."""
    today = today or date.today()
    expires = raw.get("expires")
    if not expires and raw.get("days_fresh"):
        try:
            expires = (today + timedelta(days=int(raw["days_fresh"]))).isoformat()
        except (TypeError, ValueError):
            expires = None
    category = raw.get("category") if raw.get("category") in CATEGORIES else "Andet"
    location = raw.get("location") if raw.get("location") in LOCATIONS else "Kolonial"
    try:
        qty = max(float(raw.get("qty") or 1), 0.0)
    except (TypeError, ValueError):
        qty = 1.0
    try:
        min_qty = float(raw.get("min_qty") or 0) or None
    except (TypeError, ValueError):
        min_qty = None
    name = str(raw.get("name") or "").strip()
    return {
        "id": raw.get("id") or new_id(),
        "name": name[:1].upper() + name[1:],
        "qty": qty,
        "unit": norm_unit(raw.get("unit")),
        "category": category,
        "location": location,
        "expires": expires or None,
        "min_qty": min_qty,
    }


def add_item(state: dict, raw: dict) -> dict:
    """Læg en vare på lager. Lægges sammen med en eksisterende vare med samme navn og sted."""
    item = make_item(raw)
    if not item["name"]:
        return item
    for existing in state["inventory"]:
        if existing["name"].lower() == item["name"].lower() and existing["location"] == item["location"]:
            converted = convert(item["qty"], item["unit"], existing["unit"])
            if converted is not None:
                existing["qty"] = round(existing["qty"] + converted, 3)
                # Behold den tidligste dato, så det ældste bliver brugt først.
                dates = [d for d in (existing.get("expires"), item["expires"]) if d]
                existing["expires"] = min(dates) if dates else None
                return existing
    state["inventory"].append(item)
    return item


def deduct(state: dict, item_id: str, qty: float) -> None:
    """Træk forbrug fra lageret. Faste varer bliver stående på 0, så de kan genbestilles."""
    for item in state["inventory"]:
        if item["id"] == item_id:
            item["qty"] = round(max(item["qty"] - qty, 0.0), 3)
            if item["qty"] <= 0 and not item.get("min_qty"):
                state["inventory"].remove(item)
            return


def expiring(state: dict, within_days: int = 3) -> list[dict]:
    items = [i for i in state["inventory"]
             if i["qty"] > 0 and (d := days_left(i)) is not None and d <= within_days]
    return sorted(items, key=lambda i: days_left(i))


def low_stock(state: dict) -> list[dict]:
    return [i for i in state["inventory"] if i.get("min_qty") and i["qty"] < i["min_qty"]]


# -------------------------------------------------------------------- indkøb
def add_shopping(state: dict, name: str, amount: str = "", reason: str = "",
                 category: str = "Andet", source: str = "manual") -> None:
    name = name.strip()
    if not name:
        return
    name = name[0].upper() + name[1:]
    for entry in state["shopping"]:
        if entry["name"].lower() == name.lower():
            if reason and reason not in (entry.get("reason") or ""):
                entry["reason"] = ", ".join(filter(None, [entry.get("reason"), reason]))
            if amount and not entry.get("amount"):
                entry["amount"] = amount
            return
    state["shopping"].append({
        "id": new_id(), "name": name, "amount": amount, "reason": reason,
        "category": category if category in CATEGORIES else "Andet",
        "source": source, "in_cart": False,
    })


def sync_staples(state: dict) -> bool:
    """Hold indkøbslisten i sync med faste varer under minimum. Returnerer True ved ændring."""
    low = {i["name"].lower(): i for i in low_stock(state)}
    before = [dict(e) for e in state["shopping"]]
    # Fjern automatiske linjer, der ikke længere mangler (og ikke allerede er lagt i kurv).
    state["shopping"] = [
        e for e in state["shopping"]
        if e["source"] != "auto" or e["in_cart"] or e["name"].lower() in low
    ]
    for item in low.values():
        amount = "mindst " + fmt_qty(item["min_qty"] - item["qty"], item["unit"])
        existing = next((e for e in state["shopping"] if e["name"].lower() == item["name"].lower()), None)
        if existing is None:
            add_shopping(state, item["name"], amount, "Under minimumsbeholdning",
                         item["category"], source="auto")
        elif existing["source"] == "auto" and not existing["in_cart"]:
            existing["amount"] = amount
    return state["shopping"] != before


def bilka_url(state: dict, name: str) -> str:
    template = state["settings"].get("bilka_url") or DEFAULT_BILKA_URL
    if "{q}" not in template:
        template = DEFAULT_BILKA_URL
    return template.replace("{q}", quote(name))


_CATEGORY_LOCATION = {"Frost": "Fryser", "Mejeri & æg": "Køleskab", "Kød & fisk": "Køleskab",
                      "Frugt & grønt": "Køleskab"}


def receive_purchased(state: dict) -> int:
    """Flyt varer markeret 'i kurv' over på lageret, når bestillingen er gennemført."""
    bought = [e for e in state["shopping"] if e["in_cart"]]
    for entry in bought:
        amount = re.sub(r"^\s*mindst\s+", "", entry.get("amount") or "")
        parsed = parse_line(f"{amount} x".strip()) or {}
        existing = next((i for i in state["inventory"] if i["name"].lower() == entry["name"].lower()), None)
        add_item(state, {
            "name": entry["name"], "qty": parsed.get("qty", 1), "unit": parsed.get("unit", "stk"),
            "category": entry.get("category"),
            "location": existing["location"] if existing else _CATEGORY_LOCATION.get(entry.get("category")),
        })
    state["shopping"] = [e for e in state["shopping"] if not e["in_cart"]]
    return len(bought)


def record_order(state: dict, amount: float, today: date | None = None) -> None:
    """Gem beløbet for en gennemført bestilling, så månedens forbrug kan følges."""
    if amount and amount > 0:
        state["orders"].insert(0, {"date": (today or date.today()).isoformat(), "amount": round(amount, 2)})
        del state["orders"][200:]


def month_spent(state: dict, today: date | None = None) -> float:
    prefix = (today or date.today()).isoformat()[:7]
    return sum(o["amount"] for o in state["orders"] if o["date"].startswith(prefix))


def shopping_as_text(state: dict) -> str:
    lines = []
    for entry in state["shopping"]:
        amount = f" – {entry['amount']}" if entry.get("amount") else ""
        lines.append(f"- {entry['name']}{amount}")
    return "\n".join(lines)


def handle_prompt(state: dict, profile: dict) -> str:
    """Besked til Claude med HandleMCP, som fylder Bilka ToGo-kurven ud fra indkøbslisten."""
    avoid = [ALLERGENS[k]["label"] for k in profile["allergens"]] + list(profile["other"])
    traces = ("Varer mærket 'kan indeholde spor af' er i orden. " if state["settings"].get("traces_ok")
              else "Undgå også varer mærket 'kan indeholde spor af'. ")
    allergy = (f"\nVigtigt: Familien har allergi over for: {', '.join(avoid)}. "
               "Vælg kun produkter uden disse allergener som ingrediens, og fortæl mig, hvis du er i tvivl "
               "om en vare. " + traces if avoid else "")
    prefs = (state["settings"].get("shop_prefs") or "").strip()
    if prefs:
        allergy += f"\nØnsker til varevalg: {prefs}."
    return ("Fyld min kurv hos BilkaToGo med denne indkøbsliste. Vælg det billigste produkt, der passer, "
            "og vis mig dine valg og usikre varer, før du lægger noget i kurven. "
            "Du må ikke bestille eller betale – det gør jeg selv." + allergy
            + "\n\n" + shopping_as_text(state))


# ------------------------------------------------------------------ allergier
# De 14 deklarationspligtige allergener i EU. Tjekket er bevidst forsigtigt:
# hellere en falsk advarsel end en overset allergen.
ALLERGENS: dict[str, dict] = {
    "gluten": {
        "label": "Gluten (hvede, rug, byg, havre)",
        "pattern": r"hvede|\brug\b|rug(?:brød|mel|kerner)|\bbyg\b|byg(?:mel|gryn)|perlebyg|havre|spelt|kamut"
                   r"|\bmel\b|\w+mel\b|pasta|spaghetti|penne|fusilli|lasagne|tagliatelle|makaroni|nudler"
                   r"|brød|\bboller?\b|\w+boller?\b|rasp|panko|bulgur|couscous|semulje|mannagryn|durum|kiks"
                   r"|tortilla|\bwraps?\b|\w*dej\b|\bøl\b|sojasauce|soya|seitan|crouton|müsli|mysli",
        "ignore": r"boghvede\w*|(?:majs|ris|mandel|kartoffel|kokos|kikærte|johannesbrødkerne)mel\b|karamel\w*"
                  r"|kødboller?|fiskeboller?|risnudler|glasnudler",
        "free": r"glutenfri",
    },
    "krebsdyr": {
        "label": "Krebsdyr (rejer, krabbe, hummer)",
        "pattern": r"reje|krabbe|hummer|krebs|languster|scampi|surimi",
    },
    "aeg": {
        "label": "Æg",
        "pattern": r"\bæg\b|\bægge(?!plante)\w*|\b\w*(?:spejl|hønse|vagtel|skrabe|frilands|pasta)æg\b|røræg"
                   r"|mayonnaise|\bmayo\b|aioli|bearnaise|hollandaise|marengs|remoulade|omelet|frisk pasta",
        "free": r"vegansk|plantebaseret|ægfri",
    },
    "fisk": {
        "label": "Fisk",
        "pattern": r"fisk|laks|torsk|\btun\b|sild|makrel|ansjos|rødspætte|\bsej\b|kuller|ørred"
                   r"|kaviar|rogn|worcestershire|sardin|pangasius|kulmule|\bål\b",
        "ignore": r"blæksprutte\w*",
    },
    "jordnoedder": {
        "label": "Jordnødder (peanuts)",
        "pattern": r"jordnød|peanut|satay",
    },
    "soja": {
        "label": "Soja",
        "pattern": r"soja|soya|tofu|edamame|miso|tempeh",
    },
    "maelk": {
        "label": "Mælk (inkl. laktose)",
        "pattern": r"\w*mælk\w*|\w*fløde\w*|\b\w*smør\b|\bsmør(?!e)\w*|\b\w*ost\b|\boste\w*|yoghurt|skyr"
                   r"|cr[eè]me ?fra[iî]che|parmesan|mozzarella|feta|mascarpone|ricotta|kvark|\bvalle|ymer"
                   r"|cheddar|\bghee\b|kasein|laktose|halloumi|burrata|gorgonzola|\bbrie\b|emmentaler"
                   r"|\bis\b|bechamel|a38|\bkærne",
        "ignore": r"(?:kokos|havre|soja|ris|mandel|plante|ærte)(?:mælk|fløde|drik)\w*"
                  r"|(?:jordnødde|mandel|nødde|kakao|peanut|plante)smør|peanutbutter"
                  r"|\b(?:toast|frost|kost|post|kompost|most|æblemost)\b",
        "free": r"vegansk|plantebaseret|mælkefri",
    },
    "noedder": {
        "label": "Nødder (mandler, hasselnødder, valnødder m.fl.)",
        "pattern": r"\bnød|\w+nød|mandel|mandler|cashew|pekan|pecan|pistacie|macadamia|marcipan|nougat|pesto"
                   r"|nutella|praline",
        "ignore": r"jordnød\w*|kokosnød\w*|muskatnød\w*|nødvendig\w*",
    },
    "selleri": {"label": "Selleri", "pattern": r"selleri"},
    "sennep": {"label": "Sennep", "pattern": r"sennep|dijon"},
    "sesam": {"label": "Sesam", "pattern": r"sesam|tahin|hummus"},
    "sulfitter": {
        "label": "Svovldioxid og sulfitter",
        "pattern": r"sulfit|\b(?:hvid|rød|rosé|mad)?vin\b|rosin|tørrede? abrikos",
    },
    "lupin": {"label": "Lupin", "pattern": r"lupin"},
    "bloeddyr": {
        "label": "Bløddyr (muslinger, blæksprutte)",
        "pattern": r"musling|blæksprutte|østers|snegle|calamari",
    },
}
for _spec in ALLERGENS.values():
    for _key in ("pattern", "ignore", "free"):
        if _spec.get(_key):
            _spec[_key] = re.compile(_spec[_key], re.IGNORECASE)


def allergens_in(text: str) -> set[str]:
    """Find de EU-allergener, som en ingrediens- eller varetekst sandsynligvis indeholder."""
    found = set()
    low = (text or "").lower()
    for key, spec in ALLERGENS.items():
        if spec.get("free") and spec["free"].search(low):
            continue
        cleaned = spec["ignore"].sub(" ", low) if spec.get("ignore") else low
        if spec["pattern"].search(cleaned):
            found.add(key)
    return found


def free_text_terms(text: str) -> list[str]:
    """Del fritekst som 'kiwi, koriander' op i søgeord."""
    return [t.strip().lower() for t in re.split(r"[,;\n]+", text or "") if len(t.strip()) >= 3]


# Fritekst-allergier, der gemmer sig bag andre ord end det, man selv ville skrive.
_FREE_TEXT_ALIASES = {
    "okse": ["okse", "bøf", "kalv", "roastbeef", "entrecote", "culotte", "pastrami", "bresaola"],
    "græskar": ["græskar", "hokkaido", "butternut"],
    "svin": ["svin", "gris", "bacon", "skinke", "flæsk", "medister", "pølse", "spegepølse", "leverpostej"],
    "kylling": ["kylling", "høns", "hane"],
}


def _stem(term: str) -> str:
    return term[:-1] if len(term) > 4 and term.endswith(("e", "r")) else term


def search_terms(term: str) -> list[str]:
    """De ord, en fritekst-allergi skal søges efter i en varetekst."""
    for key, aliases in _FREE_TEXT_ALIASES.items():
        if term.startswith(key):
            return aliases
    return [_stem(term)]


def family_profile(state: dict, member_ids: list[str] | None = None) -> dict:
    """Saml allergier for de familiemedlemmer, der spiser med (alle hvis ikke angivet)."""
    members = [m for m in state["family"] if member_ids is None or m["id"] in member_ids]
    allergens: dict[str, list[str]] = {}
    other: dict[str, list[str]] = {}
    dislikes: list[str] = []
    for m in members:
        for key in m.get("allergies", []):
            if key in ALLERGENS:
                allergens.setdefault(key, []).append(m["name"])
        for term in free_text_terms(m.get("other_allergies", "")):
            other.setdefault(term, []).append(m["name"])
        if (m.get("dislikes") or "").strip():
            dislikes.append(f"{m['name']}: {m['dislikes'].strip()}")
    return {"allergens": allergens, "other": other, "dislikes": dislikes,
            "names": [m["name"] for m in members]}


def check_text(text: str, profile: dict) -> list[str]:
    """Returnér læsbare advarsler, hvis teksten rammer en af familiens allergier."""
    hits = []
    for key in sorted(allergens_in(text) & set(profile["allergens"])):
        hits.append(f"{ALLERGENS[key]['label']} ({', '.join(profile['allergens'][key])})")
    low = (text or "").lower()
    for term, who in profile["other"].items():
        if any(word in low for word in search_terms(term)):
            hits.append(f"{term.capitalize()} ({', '.join(who)})")
    return hits


def check_recipe(recipe: dict, profile: dict) -> list[str]:
    """Uafhængigt allergitjek af en opskrift – oven på det, AI'en selv er blevet bedt om."""
    hits: list[str] = []
    texts = [recipe.get("title", "")] + [i.get("name", "") for i in recipe.get("ingredients", [])]
    for text in texts:
        for hit in check_text(text, profile):
            line = f"{hit} – fundet i «{text}»"
            if line not in hits:
                hits.append(line)
    for key in recipe.get("allergens", []):
        if key in profile["allergens"] and not any(ALLERGENS[key]["label"] in h for h in hits):
            hits.append(f"{ALLERGENS[key]['label']} ({', '.join(profile['allergens'][key])}) – angivet af AI")
    return hits
