"""Lagring af husstandens data: Supabase hvis konfigureret, ellers en lokal JSON-fil."""
from __future__ import annotations

import json
import os
from pathlib import Path

import requests

from .core import normalize_state

LOCAL_FILE = Path(os.environ.get("MYMATTI_DATA_FILE")
                  or Path(__file__).resolve().parent.parent / "data" / "state.json")
TABLE = "mymatti_state"
ROW_ID = "husstand"
TIMEOUT = 15


def secret(name: str) -> str | None:
    """Læs en indstilling fra miljøvariabler eller Streamlit secrets."""
    if os.environ.get(name):
        return os.environ[name]
    try:
        import streamlit as st

        value = st.secrets.get(name)
        return str(value) if value else None
    except Exception:
        return None


def _supabase() -> tuple[str, dict] | None:
    url, key = secret("SUPABASE_URL"), secret("SUPABASE_KEY")
    if not (url and key):
        return None
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    return f"{url.rstrip('/')}/rest/v1/{TABLE}", headers


def backend_name() -> str:
    return "Supabase" if _supabase() else "lokal fil"


def load() -> dict:
    sb = _supabase()
    if sb:
        url, headers = sb
        resp = requests.get(url, headers=headers, params={"id": f"eq.{ROW_ID}", "select": "data"},
                            timeout=TIMEOUT)
        resp.raise_for_status()
        rows = resp.json()
        return normalize_state(rows[0]["data"] if rows else None)
    if LOCAL_FILE.exists():
        return normalize_state(json.loads(LOCAL_FILE.read_text(encoding="utf-8")))
    return normalize_state(None)


def save(state: dict) -> None:
    sb = _supabase()
    if sb:
        url, headers = sb
        headers = {**headers, "Prefer": "resolution=merge-duplicates,return=minimal"}
        resp = requests.post(url, headers=headers, json={"id": ROW_ID, "data": state}, timeout=TIMEOUT)
        resp.raise_for_status()
        return
    LOCAL_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = LOCAL_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(LOCAL_FILE)
