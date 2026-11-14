"""Tilbagekaldte fødevarer fra Fødevarestyrelsens RSS-feed, holdt op mod husstandens varer."""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

import requests

from .core import ALLERGENS, allergens_in

FEED_URL = ("https://www.foedevarestyrelsen.dk/handlers/DynamicRss.ashx"
            "?id=8c2cdc12-6a58-43d1-8b4e-97aa96dedd0c")
PAGE_URL = "https://www.foedevarestyrelsen.dk/nyheder/tilbagekaldte-produkter"

# Ord der står i næsten alle tilbagekald og derfor ikke må give et match.
_STOP = {"tilbagekald", "tilbagekalder", "tilbagekaldes", "produkt", "produktet", "produkter",
         "danmark", "økologisk", "økologiske", "frisk", "friske", "hakket", "store", "små", "uden", "med"}


def parse_feed(xml_text: str) -> list[dict]:
    root = ET.fromstring(xml_text)
    out = []
    for node in root.iter("item"):
        try:
            published = parsedate_to_datetime(node.findtext("pubDate") or "")
        except (TypeError, ValueError):
            published = None
        out.append({
            "title": (node.findtext("title") or "").strip(),
            "link": (node.findtext("link") or PAGE_URL).strip(),
            "description": re.sub(r"\s+", " ", node.findtext("description") or "").strip(),
            "published": published,
        })
    return out


def fetch(max_age_days: int = 60) -> list[dict]:
    resp = requests.get(FEED_URL, timeout=15)
    resp.raise_for_status()
    cutoff = datetime.now(timezone.utc) - timedelta(days=max_age_days)
    return [r for r in parse_feed(resp.text) if r["published"] is None or r["published"] >= cutoff]


def _words(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-zæøåéü]{4,}", text.lower()) if w not in _STOP}


def _matches(name: str, recall_words: set[str]) -> bool:
    """En vare matcher, når alle dens væsentlige ord genfindes i tilbagekaldet (også i sammensætninger)."""
    words = _words(name)
    if not words:
        return False
    return all(any(w in rw or (len(rw) >= 5 and rw in w) for rw in recall_words) for w in words)


def undeclared_allergens(recall: dict) -> set[str]:
    """Allergener nævnt i et tilbagekald om udeklareret/ikke-mærket indhold."""
    text = f"{recall['title']} {recall['description']}".lower()
    if not re.search(r"udeklareret|ikke deklareret|ikke mærket|fremgår ikke|ikke fremgår|allergi", text):
        return set()
    return allergens_in(recall["title"])


def relevant(recalls: list[dict], state: dict, profile: dict) -> list[dict]:
    """Tilbagekald der kan vedrøre husstanden: varer på lager/indkøbsliste eller familiens allergener."""
    names = [i["name"] for i in state["inventory"]] + [e["name"] for e in state["shopping"]]
    out = []
    for recall in recalls:
        words = _words(f"{recall['title']} {recall['description']}")
        items = sorted({n for n in names if _matches(n, words)})
        allergens = sorted(undeclared_allergens(recall) & set(profile["allergens"]))
        if items or allergens:
            out.append({**recall, "items": items,
                        "allergens": [ALLERGENS[a]["label"] for a in allergens]})
    return out
