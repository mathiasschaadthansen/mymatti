"""Fælles hjælpefunktioner til siderne."""
import streamlit as st

from mymatti import core, storage

DISCLAIMER = ("Allergitjekket er en hjælp, ikke en garanti. Læs altid varedeklarationen på de "
              "konkrete produkter – AI og ordlister kan overse noget.")


# Farvetemaer: (primær, baggrund, blød flade, kant). Vælges under Familie & allergier.
THEMES = {
    "Skov": ("#1F6F4A", "#F6F8F4", "#EAF0E9", "#D9E0D8"),
    "Hav": ("#1D5FA8", "#F5F8FB", "#E6EEF6", "#D5DFEA"),
    "Bær": ("#9B2C55", "#FBF6F8", "#F5E8ED", "#E8D5DC"),
    "Sol": ("#A85F0A", "#FBF8F2", "#F5EBD9", "#E8DCC6"),
    "Grafit": ("#2F3A44", "#F6F7F8", "#E9ECEF", "#D8DDE2"),
}
DEFAULT_THEME = "Skov"


def theme_css(name: str | None, active: str = "") -> str:
    """CSS der farver appen efter det valgte tema (Streamlits eget tema kan ikke skiftes pr. husstand)."""
    primary, bg, soft, line = THEMES.get(name or "", THEMES[DEFAULT_THEME])
    return f"""<style>
:root {{--mm-primary: {primary}; --mm-bg: {bg}; --mm-soft: {soft}; --mm-line: {line};}}
.stApp, [data-testid="stHeader"] {{background: {bg};}}
button[kind="primary"], button[kind="primaryFormSubmit"], a[kind="primary"] {{
  background-color: {primary} !important; border-color: {primary} !important; color: #FFFFFF !important;}}
[data-baseweb="tab-highlight"] {{background-color: {primary} !important;}}
button[role="tab"][aria-selected="true"] p {{color: {primary} !important;}}
[data-testid="stProgress"] [role="progressbar"] > div > div {{background-color: {primary} !important;}}
label[data-baseweb="checkbox"]:has(input:checked) > span:first-of-type {{
  background-color: {primary} !important; border-color: {primary} !important;}}
[data-baseweb="slider"] [role="slider"] {{background-color: {primary} !important;}}
[data-baseweb="tag"] {{background-color: {primary} !important;}}
[data-testid="stTextInputRootElement"], [data-testid="stNumberInputContainer"],
[data-testid="stTextAreaRootElement"], [data-baseweb="select"] > div {{background-color: {soft} !important;}}
.st-key-tabbar a {{background: transparent !important;}}
.st-key-tabbar a[href="{active}"] {{background: {soft} !important;}}
.st-key-tabbar a[href="{active}"] p {{color: {primary}; font-weight: 700;}}
[data-testid="stMarkdownContainer"] a {{color: {primary};}}
</style>"""


def load_state() -> dict:
    try:
        state = storage.load()
        st.session_state["theme"] = state["settings"].get("theme")
        return state
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
