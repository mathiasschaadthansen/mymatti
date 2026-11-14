"""Mymatti – familiens madlager, opskrifter og indkøb til Bilka ToGo."""
import hmac

import streamlit as st

from mymatti import storage
from views import beholdning, familie, indkob, opskrifter, overblik

st.set_page_config(page_title="Mymatti", page_icon="favicon.png", layout="centered")

st.markdown("""
<style>
#MainMenu, footer {visibility: hidden;}
.block-container {padding-top: 2.2rem; padding-bottom: 7rem; max-width: 820px;}
h1 {letter-spacing: -0.02em;}
@media (max-width: 640px) {.block-container {padding-top: 1.2rem;} h1 {font-size: 2rem !important;} h2 {font-size: 1.4rem !important;} h3 {font-size: 1.15rem !important;}}
div[data-testid="stExpander"] {background: #FFFFFF; border-radius: 16px;}
div[data-testid="stVerticalBlockBorderWrapper"] {background: #FFFFFF;}

/* Nøgletal på forsiden: fire små felter på én række, også på telefon */
.mm-stats {display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 4px 0 12px;}
.mm-stat {background: #FFFFFF; border: 1px solid #D9E0D8; border-radius: 14px; padding: 10px 6px; text-align: center;}
.mm-stat b {display: block; font-size: 1.6rem; line-height: 1.1; font-variant-numeric: tabular-nums;}
.mm-stat span {font-size: 0.72rem; color: #5D6B63;}
.mm-stat.warn {border-color: #E0A23A; background: #FFF7E8;}
.mm-stat.alert {border-color: #D9694F; background: #FDEEEA;}

/* Fast menu i bunden, så siderne kan nås med tommelfingeren */
.st-key-tabbar {position: fixed; left: 0; right: 0; bottom: 0; z-index: 999; background: #FFFFFF;
  border-top: 1px solid #D9E0D8; padding: 6px 6px calc(6px + env(safe-area-inset-bottom, 0px));
  display: flex; flex-direction: row; flex-wrap: nowrap; justify-content: center; gap: 2px;}
.st-key-tabbar > div {flex: 1 1 0; min-width: 0; max-width: 150px; width: auto;}
.st-key-tabbar a {display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 2px; padding: 6px 2px; border-radius: 12px; min-height: 52px;}
.st-key-tabbar a p {font-size: 0.72rem; text-align: center; white-space: nowrap;}
.st-key-tabbar a span[data-testid="stIconEmoji"] {font-size: 1.3rem;}
</style>
""", unsafe_allow_html=True)


def require_password() -> None:
    """Simpel adgangskode, hvis APP_PASSWORD er sat – appen indeholder familiens helbredsoplysninger."""
    password = storage.secret("APP_PASSWORD")
    if not password or st.session_state.get("authed"):
        return
    st.title("Mymatti")
    with st.form("login"):
        entered = st.text_input("Adgangskode", type="password")
        if st.form_submit_button("Log ind", type="primary"):
            if hmac.compare_digest(entered.encode(), password.encode()):
                st.session_state["authed"] = True
                st.rerun()
            st.error("Forkert adgangskode.")
    st.stop()


require_password()

PAGES = [
    st.Page(overblik.render, title="Overblik", icon="🏠", url_path="overblik", default=True),
    st.Page(beholdning.render, title="Beholdning", icon="🥕", url_path="beholdning"),
    st.Page(opskrifter.render, title="Opskrifter", icon="🍳", url_path="opskrifter"),
    st.Page(indkob.render, title="Indkøb", icon="🛒", url_path="indkob"),
    st.Page(familie.render, title="Familie & allergier", icon="👨‍👩‍👧", url_path="familie"),
]
page = st.navigation(PAGES, position="hidden")
page.run()

with st.container(key="tabbar"):
    for item, label in zip(PAGES, ["Overblik", "Lager", "Opskrifter", "Indkøb", "Familie"]):
        st.page_link(item, label=label, icon=item.icon)
