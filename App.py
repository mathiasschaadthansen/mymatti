import streamlit as st
import pandas as pd
import time

# 1. Mymatti Konfiguration med det nye ikon
st.set_page_config(
    page_title="Mymatti", 
    page_icon="icon.png", 
    layout="centered"
)

# 2. Apple UI Design & Dark Mode Fix
st.markdown("""
    <style>
    [data-testid="stAppViewContainer"] { background-color: #FBFBFD !important; }
    [data-testid="stAppViewContainer"], p, h1, h2, h3, h4, h5, h6, span { color: #1D1D1F !important; }
    #MainMenu, footer, header {visibility: hidden;}
    
    /* Centrer logo og titel */
    .header-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        margin-top: -30px;
        margin-bottom: 20px;
    }

    /* iOS-style Søgefelt */
    .stTextInput input {
        font-size: 18px !important;
        padding: 16px 24px !important;
        border-radius: 22px !important;
        border: 1px solid #D1D1D6 !important;
        background-color: #FFFFFF !important;
        box-shadow: 0 4px 12px rgba(0,0,0,0.05) !important;
    }
    
    /* Matti Card Design */
    .matti-card {
        background: white; 
        border-radius: 28px; 
        padding: 28px; 
        border: 1px solid #E5E5EA; 
        margin-bottom: 24px; 
        box-shadow: 0 8px 32px rgba(0,0,0,0.04);
    }
    </style>
    """, unsafe_allow_html=True)

# 3. Data-motor
@st.cache_data
def load_data():
    return pd.read_csv("enumre.csv")

df = load_data()

# Krydsallergi Database
cross_data = {
    "Birkepollen": ["Æble", "Pære", "Gulerod", "Hasselnød", "Mandel", "Fersken", "Blomme", "Kirsebær", "Kartoffel"],
    "Græspollen": ["Appelsin", "Melon", "Tomat", "Peanut", "Ært", "Bønner"],
    "Lateks": ["Avocado", "Banan", "Kiwi", "Figen"]
}

# 4. App Header med Logo
st.markdown('<div class="header-container">', unsafe_allow_html=True)
st.image("icon.png", width=120)
st.markdown("<h1 style='font-weight: 800; font-size: 42px; margin-top: 10px; margin-bottom: 0;'>Mymatti</h1>", unsafe_allow_html=True)
st.markdown("<p style='font-size: 18px; color: #8E8E93 !important; font-weight: 500;'>Seriøs viden. Let at forstå.</p>", unsafe_allow_html=True)
st.markdown('</div>', unsafe_allow_html=True)

tabs = st.tabs(["🔍 Opslag", "📋 Liste", "🤧 Krydsallergi", "🕵️ Detektiven"])

# --- FANE 1: OPSLAG ---
with tabs[0]:
    query = st.text_input("", placeholder="Søg f.eks. 102 eller Nitrit...", key="search_main")
    if query:
        res = df[df['E-Number'].astype(str).str.contains(query, case=False) | df['Scientific Name'].astype(str).str.contains(query, case=False)]
        if not res.empty:
            for _, row in res.iterrows():
                risk_color = "#34C759" if row['Risk Category'] == 'Green' else "#FFCC00" if row['Risk Category'] == 'Yellow' else "#FF3B30"
                badge = "SIKKER" if row['Risk Category'] == 'Green' else "OBS" if row['Risk Category'] == 'Yellow' else "UNDGÅ"
                
                st.markdown(f"""
                <div class="matti-card">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <h2 style="margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -1px;">{row['E-Number']}</h2>
                        <div style="background: {risk_color}; color: white; padding: 6px 16px; border-radius: 20px; font-size: 12px; font-weight: 800;">{badge}</div>
                    </div>
                    <div style="font-weight: 600; font-size: 19px; color: #48484A; margin-bottom: 15px;">{row['Scientific Name']}</div>
                    <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #3A3A3C;">{row['Danish Description']}</p>
                    <div style="margin-top: 20px; background: #F2F2F7; padding: 16px; border-radius: 16px; font-size: 14px; border-left: 5px solid #007AFF;">
                        <span style="font-size: 18px; margin-right: 8px;">🗨️</span><b>Mattis Note:</b><br>{row['Matti_Note']}
                    </div>
                </div>
                """, unsafe_allow_html=True)

# --- FANE 2: LISTE ---
with tabs[1]:
    st.markdown("### Komplet E-nummer oversigt")
    st.dataframe(df[['E-Number', 'Scientific Name', 'Risk Category']], use_container_width=True, hide_index=True)

# --- FANE 3: KRYDSALLERGI ---
with tabs[2]:
    st.markdown("### Tjek din krydsallergi")
    food_search = st.text_input("Indtast fødevare", placeholder="F.eks. Gulerod...", key="cross_search")
    if food_search:
        match = next((p for p, foods in cross_data.items() if food_search.lower() in [f.lower() for f in foods]), None)
        if match:
            st.error(f"⚠️ **{food_search.capitalize()}** krydsreagerer ofte med **{match}**.")
            st.info(f"Vær opmærksom på: {', '.join(cross_data[match])}")
        else:
            st.success("Ingen almindelige krydsallergier fundet for dette emne.")

# --- FANE 4: DETEKTIVEN ---
with tabs[3]:
    st.markdown("### Symptom Detektiven")
    st.camera_input("Scan ingredienslisten")
    st.multiselect("Hvordan har du det?", ["Ondt i maven", "Hovedpine", "Hyperaktiv", "Træt", "Hududslæt"])
    if st.button("Log hændelse"):
        st.balloons()
        st.success("Logget! Matti leder nu efter mønstre i din kost.")