import streamlit as st

st.set_page_config(page_title="Krydsallergi", page_icon="favicon.png", layout="centered")

# Styling (skal med på hver side for at bevare Apple-looket)
st.markdown("""
    <style>
    [data-testid="stAppViewContainer"] { background-color: #FBFBFD !important; }
    [data-testid="stAppViewContainer"], p, h1, h2, h3, h4, h5, h6, span { color: #1D1D1F !important; }
    .stTextInput input { border-radius: 22px !important; border: 1px solid #D1D1D6 !important; padding: 16px 24px !important; }
    </style>
    """, unsafe_allow_html=True)

st.title("🤧 Krydsallergi")
st.markdown("Find ud af hvilke pollen og fødevarer der driller hinanden.")

cross_data = {
    "Birkepollen": ["Æble", "Pære", "Gulerod", "Hasselnød", "Mandel", "Fersken", "Blomme", "Kirsebær", "Kartoffel"],
    "Græspollen": ["Appelsin", "Melon", "Tomat", "Peanut", "Ært", "Bønner"],
    "Lateks": ["Avocado", "Banan", "Kiwi", "Figen"]
}

food_search = st.text_input("Indtast fødevare", placeholder="F.eks. Gulerod...")
if food_search:
    match = next((p for p, foods in cross_data.items() if food_search.lower() in [f.lower() for f in foods]), None)
    if match:
        st.error(f"⚠️ **{food_search.capitalize()}** krydsreagerer ofte med **{match}**.")
        st.info(f"Folk med allergi overfor {match} reagerer også tit på: {', '.join(cross_data[match])}")
    else:
        st.success("Ingen almindelige krydsallergier fundet for dette emne.")