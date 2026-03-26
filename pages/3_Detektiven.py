import streamlit as st
import pandas as pd
from datetime import datetime

st.set_page_config(page_title="Detektiven", page_icon="favicon.png", layout="centered")

# Styling
st.markdown("""
    <style>
    [data-testid="stAppViewContainer"] { background-color: #FBFBFD !important; }
    [data-testid="stAppViewContainer"], p, h1, h2, h3, h4, h5, h6, span { color: #1D1D1F !important; }
    .stTextArea textarea { border-radius: 12px !important; border: 1px solid #D1D1D6 !important; }
    .log-card { background: white; border-radius: 16px; padding: 16px; border: 1px solid #E5E5EA; margin-bottom: 12px; }
    </style>
    """, unsafe_allow_html=True)

st.title("🕵️ Detektiven")
st.markdown("Log din mad og dine symptomer. Når du har samlet data, kan Matti finde mønstrene.")

# --- INITIALISER "HUKOMMELSE" (Midlertidig database) ---
if "logs" not in st.session_state:
    st.session_state.logs = []

# --- FANER TIL DETEKTIVEN ---
tab_log, tab_analyse = st.tabs(["📝 Log Hændelse", "🔍 Start Detektiv"])

# 1. LOG-FANEN
with tab_log:
    st.markdown("### 1. Scan eller indtast ingredienser")
    
    # Kamera (senere kobler vi AI på billedet)
    billede = st.camera_input("Tag billede af ingredienslisten", help="Tryk for at åbne kameraet")
    
    # Tekstfelt (Her kan brugeren rette, eller skrive selv)
    ingredienser = st.text_area(
        "Ingredienser", 
        value="Sukker, hvedemel, E120, E407, aroma..." if billede else "", # Simulerer at OCR udfylder feltet
        placeholder="Skriv ingredienserne, eller ret teksten hvis scanneren lavede en fejl...",
        height=100
    )
    
    st.markdown("### 2. Hvordan har du det?")
    symptomer = st.multiselect(
        "Vælg symptomer", 
        ["Ondt i maven", "Hovedpine", "Hyperaktiv", "Træt", "Hududslæt", "Kvalme", "Kløe"]
    )
    
    if st.button("Log Måltid", type="primary", use_container_width=True):
        if ingredienser and symptomer:
            # Gem i vores midlertidige database
            st.session_state.logs.append({
                "dato": datetime.now().strftime("%d-%m-%Y %H:%M"),
                "ingredienser": ingredienser,
                "symptomer": symptomer
            })
            st.success("✅ Logget! Måltidet er gemt i din dagbog.")
        else:
            st.error("Hov! Du mangler at udfylde enten ingredienser eller symptomer.")

# 2. ANALYSE-FANEN
with tab_analyse:
    st.markdown("### Din Logbog")
    
    if len(st.session_state.logs) == 0:
        st.info("Din logbog er tom. Gå til 'Log Hændelse' for at starte sporingen.")
    else:
        for log in reversed(st.session_state.logs):
            st.markdown(f"""
            <div class="log-card">
                <span style="color: #8E8E93; font-size: 12px;">{log['dato']}</span><br>
                <b>Symptomer:</b> {', '.join(log['symptomer'])}<br>
                <div style="font-size: 14px; color: #48484A; margin-top: 8px;"><i>Ingredienser: {log['ingredienser']}</i></div>
            </div>
            """, unsafe_allow_html=True)
        
        st.divider()
        st.markdown("### Lad Matti finde mønstrene")
        if st.button("Start Analyse 🕵️", use_container_width=True):
            if len(st.session_state.logs) < 3:
                st.warning("Matti har brug for lidt mere data for at finde præcise mønstre. Prøv at logge mindst 3 måltider med symptomer.")
            else:
                st.balloons()
                st.success("Analyserer data...")
                # Her kommer logikken senere, der tjekker for tværgående E-numre
                st.info("💡 **Mattis Mistanke:** I 100% af de tilfælde hvor du fik 'Ondt i maven', indeholdt maden 'E407' (Carrageenan). Lad os holde øje med det stof i fremtiden.")