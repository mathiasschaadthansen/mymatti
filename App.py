import streamlit as st
import pandas as pd
import os

# 1. Konfiguration
st.set_page_config(page_title="Mymatti", page_icon="favicon.png", layout="centered")

# 2. Apple UI Design
st.markdown("""
    <style>
    [data-testid="stAppViewContainer"] { background-color: #FBFBFD !important; }
    [data-testid="stAppViewContainer"], p, h1, h2, h3, h4, h5, h6, span { color: #1D1D1F !important; }
    #MainMenu, footer, header {visibility: hidden;}
    .header-container { display: flex; flex-direction: column; align-items: center; margin-top: -30px; margin-bottom: 20px; }
    .stTextInput input {
        font-size: 18px !important; padding: 16px 24px !important; border-radius: 22px !important;
        border: 1px solid #D1D1D6 !important; background-color: #FFFFFF !important;
        color: #1D1D1F !important; box-shadow: 0 4px 12px rgba(0,0,0,0.05) !important;
    }
    .matti-card {
        background: white; border-radius: 28px; padding: 28px; border: 1px solid #E5E5EA; 
        margin-bottom: 24px; box-shadow: 0 8px 32px rgba(0,0,0,0.04);
    }
    </style>
    """, unsafe_allow_html=True)

# 3. Data-motor
@st.cache_data
def load_data():
    return pd.read_csv("enumre.csv")

df = load_data()

# 4. Header
st.markdown('<div class="header-container">', unsafe_allow_html=True)
if os.path.exists("icon-512.png"):
    st.image("icon-512.png", width=120)
st.markdown("<h1 style='font-weight: 800; font-size: 42px; margin-top: 10px; margin-bottom: 0;'>Mymatti</h1>", unsafe_allow_html=True)
st.markdown("<p style='font-size: 18px; color: #8E8E93 !important; font-weight: 500;'>Hurtig-opslag</p>", unsafe_allow_html=True)
st.markdown('</div>', unsafe_allow_html=True)

# --- OPSLAG (Hovedfunktion) ---
query = st.text_input("", placeholder="Søg på 102, Nitrit eller Farvestof...", key="search_main")
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
                    <b>Mattis Note:</b><br>{row['Matti_Note']}
                </div>
            </div>
            """, unsafe_allow_html=True)
    else:
        st.info("Ingen resultater fundet. Prøv Biblioteket i menuen for den fulde liste.")