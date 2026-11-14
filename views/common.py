"""Fælles hjælpefunktioner til siderne."""
import streamlit as st

from mymatti import core, storage

DISCLAIMER = ("Allergitjekket er en hjælp, ikke en garanti. Læs altid varedeklarationen på de "
              "konkrete produkter – AI og ordlister kan overse noget.")


def load_state() -> dict:
    try:
        return storage.load()
    except Exception as exc:  # netværksfejl mod databasen skal ikke give en rå fejlside
        st.error(f"Kunne ikke hente jeres data ({storage.backend_name()}): {exc}")
        st.stop()


def save_state(state: dict) -> None:
    try:
        storage.save(state)
    except Exception as exc:
        st.error(f"Kunne ikke gemme ({storage.backend_name()}): {exc}")
        st.stop()


def flash(message: str) -> None:
    """Vis en besked efter næste genindlæsning."""
    st.session_state["_flash"] = message


def show_flash() -> None:
    message = st.session_state.pop("_flash", None)
    if message:
        st.toast(message)


def freshness_label(item: dict) -> str:
    left = core.days_left(item)
    if left is None:
        return ""
    if left < 0:
        return f"🔴 udløbet for {-left} dag(e) siden"
    if left == 0:
        return "🟠 udløber i dag"
    return f"{'🟠' if left <= 3 else '🟢'} {left} dag(e) tilbage"
