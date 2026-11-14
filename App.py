"""Mymatti – familiens madlager, opskrifter og indkøb til Bilka ToGo."""
import hmac

import streamlit as st

from mymatti import storage
from views import beholdning, familie, indkob, opskrifter, overblik

st.set_page_config(page_title="Mymatti", page_icon="favicon.png", layout="centered")

st.markdown("""
<style>
#MainMenu, footer {visibility: hidden;}
.block-container {padding-top: 2.5rem; max-width: 820px;}
div[data-testid="stMetric"] {background: #FFFFFF; border: 1px solid #E5E5EA; border-radius: 16px; padding: 12px 16px;}
div[data-testid="stExpander"] {background: #FFFFFF; border-radius: 16px;}
.stButton button, .stLinkButton a {border-radius: 12px;}
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

page = st.navigation([
    st.Page(overblik.render, title="Overblik", icon="🏠", url_path="overblik", default=True),
    st.Page(beholdning.render, title="Beholdning", icon="🥕", url_path="beholdning"),
    st.Page(opskrifter.render, title="Opskrifter", icon="🍳", url_path="opskrifter"),
    st.Page(indkob.render, title="Indkøb", icon="🛒", url_path="indkob"),
    st.Page(familie.render, title="Familie & allergier", icon="👨‍👩‍👧", url_path="familie"),
])
page.run()
