import streamlit as st

st.set_page_config(page_title="Detektiven", page_icon="favicon.png", layout="centered")

# Styling
st.markdown("""
    <style>
    [data-testid="stAppViewContainer"] { background-color: #FBFBFD !important; }
    [data-testid="stAppViewContainer"], p, h1, h2, h3, h4, h5, h6, span { color: #1D1D1F !important; }
    </style>
    """, unsafe_allow_html=True)

st.title("🕵️ Detektiven")
st.markdown("Scan ingredienser og log dine symptomer for at finde mønstre.")

st.camera_input("Scan ingredienslisten")
symptoms = st.multiselect("Hvordan har du det?", ["Ondt i maven", "Hovedpine", "Hyperaktiv", "Træt", "Hududslæt"])

if st.button("Log hændelse"):
    st.balloons()
    st.success("Logget! Matti analyserer dine data og giver dig besked om 30 dage.")