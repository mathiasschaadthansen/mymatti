import streamlit as st
import pandas as pd

# 1. Konfiguration
st.set_page_config(page_title="Mymatti Bibliotek", page_icon="favicon.png", layout="wide")

# 2. Apple-Style Design til Biblioteket
st.markdown("""
    <style>
    [data-testid="stAppViewContainer"] { background-color: #FBFBFD !important; }
    [data-testid="stAppViewContainer"], p, h1, h2, h3, h4, h5, h6, span { color: #1D1D1F !important; }
    
    .e-card {
        background-color: #ffffff;
        border-radius: 20px;
        padding: 24px;
        margin-bottom: 20px;
        border: 1px solid #E5E5EA;
        box-shadow: 0 4px 12px rgba(0,0,0,0.03);
    }
    .status-badge {
        padding: 4px 12px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 700;
        color: white;
    }
    .warning-box {
        background-color: #FFF2F2;
        border-left: 5px solid #FF3B30;
        padding: 15px;
        border-radius: 8px;
        margin-top: 10px;
        font-size: 14px;
    }
    .source-text {
        font-size: 11px;
        color: #8E8E93;
        margin-top: 15px;
    }
    </style>
    """, unsafe_allow_html=True)

# 3. Indlæs data
@st.cache_data
def load_data():
    return pd.read_csv("enumre.csv")

df = load_data()

# 4. Header & Intro fra dine dokumenter
st.title("📚 Det Komplette Bibliotek")
st.markdown("""
Denne oversigt er baseret på **Den Systematiske Oversigt over EU-godkendte Fødevaretilsætningsstoffer**. 
Vi vurderer her stofferne ud fra forsigtighedsprincippet og nyere toksikologisk forskning.
""")

# 5. Søgefunktion & Filtrering
col1, col2 = st.columns([2, 1])
with col1:
    search = st.text_input("Søg i videnbasen", placeholder="Søg på E-nummer eller navn (f.eks. Karmin)...")
with col2:
    filter_risk = st.multiselect("Filtrer efter risiko", ["Red", "Yellow", "Green"], default=["Red", "Yellow", "Green"])

# Logik til filtrering
filtered_df = df[df['Risk Category'].isin(filter_risk)]
if search:
    filtered_df = filtered_df[
        filtered_df['E-Number'].str.contains(search, case=False, na=False) |
        filtered_df['Scientific Name'].str.contains(search, case=False, na=False)
    ]

# 6. Visning af kort
if filtered_df.empty:
    st.info("Ingen resultater matcher din søgning.")
else:
    for _, row in filtered_df.iterrows():
        color = "#34C759" if row['Risk Category'] == 'Green' else "#FFCC00" if row['Risk Category'] == 'Yellow' else "#FF3B30"
        
        with st.container():
            st.markdown(f"""
            <div class="e-card">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 24px; font-weight: 800;">{row['E-Number']}</span>
                    <span class="status-badge" style="background-color: {color};">{row['Risk Category'].upper()}</span>
                </div>
                <div style="font-weight: 600; color: #48484A; margin-bottom: 10px;">{row['Scientific Name']}</div>
                <p>{row['Danish Description']}</p>
                <div style="font-style: italic; color: #007AFF; font-size: 14px;">🗨️ Mattis Note: {row['Matti_Note']}</div>
            </div>
            """, unsafe_allow_html=True)
            
            # Tilføj toksikologiske advarsler fra dine DOCX filer
            if row['ADHD Impact'] == 'Yes':
                st.markdown('<div class="warning-box">⚠️ <b>ADHD Advarsel:</b> Dette stof er en del af Southampton-studiet og kan påvirke børns aktivitet og koncentrationsevne.</div>', unsafe_allow_html=True)
            
            if row['E-Number'] in ["E433", "E466"]:
                st.markdown('<div class="warning-box">🧪 <b>Tarmflora:</b> Nyere forskning indikerer, at dette stof kan nedbryde tarmens beskyttende slimlag (Leaky Gut).</div>', unsafe_allow_html=True)

st.divider()
st.markdown("""
<div class="source-text">
<b>Kilder:</b><br>
1. EFSA (European Food Safety Authority) - Re-evaluation program 2026.<br>
2. Forordning (EF) nr. 1333/2008 om fødevaretilsætningsstoffer.<br>
3. Southampton-studiet (McCann et al.) vedr. azo-farvestoffer.<br>
4. Dansk Fødevarestyrelse - Særregler for nitrit (E249-250).
</div>
""", unsafe_allow_html=True)