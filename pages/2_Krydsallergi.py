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
        padding: 18px;
        border-radius: 12px;
        margin-top: 15px;
        line-height: 1.5;
    }
    .warning-severe {
        background-color: #FFF2F2;
        border-left: 5px solid #FF3B30;
        padding: 18px;
        border-radius: 12px;
        margin-top: 15px;
        line-height: 1.5;
    }
    </style>
    """, unsafe_allow_html=True)

st.title("🤧 Krydsallergi Detektiven")

# Tydelig, men letlæselig Disclaimer
st.markdown("""
<div class="disclaimer-box">
    <b>⚠️ Mattis Huskeregel</b><br>
    Selvom Mymatti bygger på anerkendt forskning, er appen din smarte guide og ikke en læge. Oplever du hævelser i svælget eller får svært ved at trække vejret, skal du straks søge læge eller ringe 112.
</div>
""", unsafe_allow_html=True)

st.markdown("Søg på en fødevare (f.eks. Æble, Rejer eller Svinekød) og se, hvilke andre ting den kan drille sammen med.")

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
    "Katte (Skæl/Hår)": ["Svinekød", "Pølser", "Bacon", "Komælk", "Oksekød", "Lammekød"],
    "Hunde (Skæl/Hår)": ["Svinekød", "Pølser", "Bacon", "Komælk", "Oksekød", "Lammekød"],
    "Heste (Skæl/Hår)": ["Svinekød", "Pølser", "Bacon", "Komælk", "Oksekød", "Lammekød"],
    "Fugle (Fjer/Klat)": ["Æggeblomme", "Kyllingekød", "Kalkunkød", "Andekød"],
    "Alfa-gal (Skovflåtbid)": ["Oksekød", "Svinekød", "Lammekød", "Vildtkød", "Bison", "Kaninkød", "Hestekød", "Gedekød", "Egern", "Kænguru", "Antilope", "Bøffel", "Kamel", "Hvalkød", "Lever", "Nyrer", "Hjerte", "Tarm", "Svineskind", "Tarmskind", "Pølseskind", "Brisler", "Blodpølse", "Svinefedt", "Ister", "Oksefedt", "Talg", "Spæk", "Fond", "Bouillon", "Sauce", "Gelatine", "Knoglemarv", "Kødekstrakt", "Komælk", "Fåremælk", "Gedemælk", "Ost", "Flødeost", "Mælkeprotein", "Oksekollagen", "Gelatine-kapsler", "Medicinsk glycerin", "Magnesiumstearat", "Carrageenan", "E407"]
}

# De allergier, der kræver ekstra forsigtighed (rød advarsel)
severe_allergies = ["Husstøvmider", "Alfa-gal (Skovflåtbid)", "Katte (Skæl/Hår)", "Hunde (Skæl/Hår)", "Heste (Skæl/Hår)", "Fugle (Fjer/Klat)", "Latex (Naturgummi)", "Platanpollen"]

food_search = st.text_input("", placeholder="Tast en fødevare her...")

if food_search:
    found_matches = []
    for allergen, foods in cross_data.items():
        if any(food_search.lower() == f.lower() or food_search.lower() in f.lower() for f in foods):
            found_matches.append(allergen)
            
    if found_matches:
        st.error(f"⚠️ Hvis du spiser **{food_search.lower()}**, skal du være opmærksom på følgende:")
        
        for match in found_matches:
            if match in severe_allergies:
                st.markdown(f"""
                <div class="warning-severe">
                    <span style="font-size: 18px;">🚨</span> <b>Krydsallergi: {match}</b><br>
                    <b>Vigtigt:</b> Hvis du i forvejen reagerer på {match.lower()}, kan din krop krydsreagere, når du spiser <b>{food_search.lower()}</b>. De proteiner, der udløser reaktionen, forsvinder sjældent ved opvarmning. Du kan altså reagere kraftigt i hele kroppen, uanset om maden er rå, kogt eller stegt.<br><br>
                    <i>Andre fødevarer der ofte driller ved {match.lower()}:</i> {', '.join(cross_data[match][:8])}...
                </div>
                """, unsafe_allow_html=True)
            else:
                st.markdown(f"""
                <div class="warning-mild">
                    <span style="font-size: 18px;">💡</span> <b>Krydsallergi: {match}</b><br>
                    <b>Godt at vide:</b> Hvis du reagerer på {match.lower()}, forveksler din krop det nogle gange med proteinerne i <b>{food_search.lower()}</b>. Du vil oftest mærke det som mild kløe eller prikken i mund og læber. Reaktionen forsvinder typisk, hvis du koger eller bager fødevaren.<br><br>
                    <i>Andre fødevarer der ofte krydsreagerer med {match.lower()}:</i> {', '.join(cross_data[match][:8])}...
                </div>
                """, unsafe_allow_html=True)
    else:
        st.success(f"✅ Vi fandt ingen kendte krydsallergier for '{food_search}'.")