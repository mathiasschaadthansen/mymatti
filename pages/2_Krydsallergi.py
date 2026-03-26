import streamlit as st

st.set_page_config(page_title="Krydsallergi", page_icon="favicon.png", layout="centered")

# Styling (Apple-look og advarselsbokse)
st.markdown("""
    <style>
    [data-testid="stAppViewContainer"] { background-color: #FBFBFD !important; }
    [data-testid="stAppViewContainer"], p, h1, h2, h3, h4, h5, h6, span { color: #1D1D1F !important; }
    .stTextInput input { border-radius: 22px !important; border: 1px solid #D1D1D6 !important; padding: 16px 24px !important; }
    
    .disclaimer-box {
        background-color: #F2F2F7;
        border-left: 5px solid #8E8E93;
        padding: 16px;
        border-radius: 12px;
        margin-bottom: 25px;
        font-size: 14px;
        color: #48484A;
        line-height: 1.5;
    }
    .warning-mild {
        background-color: #FFF9E6;
        border-left: 5px solid #FFCC00;
        padding: 15px;
        border-radius: 8px;
        margin-top: 10px;
    }
    .warning-severe {
        background-color: #FFF2F2;
        border-left: 5px solid #FF3B30;
        padding: 15px;
        border-radius: 8px;
        margin-top: 10px;
    }
    </style>
    """, unsafe_allow_html=True)

st.title("🤧 Krydsallergi Detektiven")

# Tydelig Medicinsk Disclaimer
st.markdown("""
<div class="disclaimer-box">
    <b>⚠️ Vigtig Sundhedsfaglig Ansvarsfraskrivelse</b><br>
    Mymatti er et vejledende informationsværktøj baseret på generel klinisk forskning. Oplysningerne heri erstatter <b>ikke</b> professionel medicinsk rådgivning, diagnose eller behandling. Ved mistanke om alvorlig allergi, eller hvis du oplever symptomer som hævelse i svælg eller vejrtrækningsbesvær, skal du straks søge læge eller ringe 112.
</div>
""", unsafe_allow_html=True)

st.markdown("Søg på en fødevare og se præcis hvilke pollen, mider eller dyr, den kan krydsreagere med.")

# Den udtømmende kliniske database
cross_data = {
    "Birkepollen": ["Æble", "Pære", "Blomme", "Fersken", "Nektarin", "Abrikos", "Kirsebær", "Kiwi", "Banan", "Figen", "Avocado", "Jordbær", "Mango", "Gulerod", "Knoldselleri", "Bladselleri", "Kartoffel", "Tomat", "Peberfrugt", "Hasselnød", "Mandel", "Valnød", "Paranød", "Soja", "Bønner", "Kikærter", "Linser", "Jordnødder", "Persille", "Koriander", "Dild", "Fennikel", "Kommen", "Basilikum", "Oregano", "Estragon"],
    "El og Hasselpollen": ["Æble", "Kirsebær", "Fersken", "Selleri", "Persille", "Hasselnød", "Mandel", "Valnød", "Paranød"],
    "Bøg og Egepollen": ["Æble", "Pære", "Hasselnød", "Mandel", "Valnød", "Melon", "Solsikkekerne"],
    "Askepollen": ["Banan", "Peberfrugt", "Kartoffel", "Tomat", "Oliven", "Syren", "Liguster", "Jasmin"],
    "Platanpollen": ["Fersken", "Æble", "Hasselnød", "Jordnød", "Banan", "Selleri", "Salat", "Majs", "Kål", "Sennep"],
    "Græspollen": ["Melon", "Vandmelon", "Appelsin", "Figen", "Tomat", "Kartoffel", "Selleri", "Grøn peber", "Pastinak", "Hvidløg", "Løg", "Jordnød", "Grønne ærter", "Kiwi", "Fersken", "Hvede", "Majs", "Bambus"],
    "Gråbynkepollen": ["Knoldselleri", "Bladselleri", "Gulerod", "Persille", "Fennikel", "Dild", "Koriander", "Kommen", "Pastinak", "Purløg", "Estragon", "Løvstikke", "Sennep", "Sort peber", "Grøn peber", "Paprika", "Hvidløg", "Løg", "Karry", "Melon", "Fersken", "Mango", "Kiwi", "Tomat", "Solsikkekerne", "Kål", "Broccoli", "Kamille", "Mælkebøtte", "Artiskok", "Echinacea", "Hibiscus"],
    "Ambrosiapollen": ["Banan", "Honningmelon", "Cantaloupe", "Vandmelon", "Agurk", "Squash", "Zucchini", "Peberfrugt", "Solsikkekerne", "Artiskok", "Kamille", "Hibiscus"],
    "Vejbred": ["Melon", "Tomat"],
    "Latex (Naturgummi)": ["Avocado", "Banan", "Kastanje", "Kiwi", "Æble", "Gulerod", "Selleri", "Melon", "Papaya", "Kartoffel", "Tomat", "Abrikos", "Boghvede", "Cassava", "Maniok", "Ricinusbønne", "Kirsebær", "Kikært", "Citrusfrugter", "Kokosnød", "Agurk", "Dild", "Aubergine", "Figen", "Gojibær", "Drue", "Hasselnød", "Jujubebær", "Jackfrugt", "Litchi", "Mango", "Nektarin", "Oregano", "Passionsfrugt", "Fersken", "Jordnød", "Pære", "Peberfrugt", "Persimmon", "Kaki", "Ananas", "Græskar", "Rug", "Salvie", "Jordbær", "Skaldyr", "Sojabønne", "Solsikkekerne", "Tobak", "Turnips", "Roe", "Valnød", "Hvede", "Squash", "Zucchini"],
    "Stuebirk (Ficus)": ["Figen", "Tørrede figner", "Kiwi", "Banan", "Papaya", "Ananas", "Morbær", "Avocado"],
    "Skimmelsvamp (Alternaria)": ["Spinat", "Champignon", "Portobello", "Cremini", "Quorn", "Spisesvampe"],
    "Skimmelsvamp (Penicillium/Aspergillus)": ["Spisesvampe", "Gær", "Saccharomyces", "Fermenterede fødevarer", "Lagrede drikkevarer"],
    "Husstøvmider": ["Rejer", "Tigerreje", "Nordsøreje", "Hummer", "Jomfruhummer", "Krabber", "Krebs", "Blåmusling", "Kammusling", "Østers", "Snegle", "Vinbjergsnegle", "Søører", "Abalone", "Tiarmede blæksprutter", "Squid", "Cuttlefish", "Ottearmede blæksprutter", "Octopus", "Kakerlak", "Melorme", "Fårekyllinger", "Karmin", "E120"],
    "Katteallergi (Skæl/Hår)": ["Svinekød", "Pølser", "Bacon", "Komælk", "Oksekød", "Lammekød"],
    "Fugleallergi (Fjer/Klat)": ["Æggeblomme", "Kyllingekød", "Kalkunkød", "Andekød"],
    "Alfa-gal (Skovflåtbid)": ["Oksekød", "Svinekød", "Lammekød", "Vildtkød", "Bison", "Kaninkød", "Hestekød", "Gedekød", "Egern", "Kænguru", "Antilope", "Bøffel", "Kamel", "Hvalkød", "Lever", "Nyrer", "Hjerte", "Tarm", "Svineskind", "Tarmskind", "Pølseskind", "Brisler", "Blodpølse", "Svinefedt", "Ister", "Oksefedt", "Talg", "Spæk", "Fond", "Bouillon", "Sauce", "Gelatine", "Knoglemarv", "Kødekstrakt", "Komælk", "Fåremælk", "Gedemælk", "Ost", "Flødeost", "Mælkeprotein", "Oksekollagen", "Gelatine-kapsler", "Medicinsk glycerin", "Magnesiumstearat", "Carrageenan", "E407"]
}

severe_allergies = ["Husstøvmider", "Alfa-gal (Skovflåtbid)", "Katteallergi (Skæl/Hår)", "Fugleallergi (Fjer/Klat)", "Latex (Naturgummi)", "Platanpollen"]

food_search = st.text_input("Indtast fødevare", placeholder="F.eks. Melon, Rejer eller Svinekød...")
if food_search:
    found_matches = []
    for allergen, foods in cross_data.items():
        if any(food_search.lower() == f.lower() or food_search.lower() in f.lower() for f in foods):
            found_matches.append(allergen)
            
    if found_matches:
        st.error(f"⚠️ **{food_search.capitalize()}** krydsreagerer ofte med følgende allergener:")
        
        for match in found_matches:
            if match in severe_allergies:
                st.markdown(f"""
                <div class="warning-severe">
                    <b>{match}</b><br>
                    Denne type krydsallergi er ofte varmestabil og kan udløse systemiske reaktioner eller svær anafylaksi uanset om maden er tilberedt. Andre kilder til denne reaktion: {', '.join(cross_data[match][:10])}...
                </div>
                """, unsafe_allow_html=True)
            else:
                st.markdown(f"""
                <div class="warning-mild">
                    <b>{match}</b><br>
                    Dette er primært et Oralt Allergisyndrom (OAS). Symptomerne mærkes oftest kun i mund/svælg, og de fleste tåler fødevaren, hvis den bliver kogt eller bagt. Andre relaterede fødevarer: {', '.join(cross_data[match][:10])}...
                </div>
                """, unsafe_allow_html=True)
    else:
        st.success("Ingen almindelige krydsallergier fundet for dette emne.")