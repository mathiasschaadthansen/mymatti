# Mymatti

Web-app til familiens madlager: skriv hvad I har, få opskrifter ud fra det, og få gjort
indkøbet til Bilka ToGo klar – med hensyn til familiens allergier hele vejen.

## Det kan appen

- **Beholdning** – skriv varerne i fri tekst, eller tag et billede af køleskabet eller kassebonen.
  AI'en foreslår mængde, placering og holdbarhed, som I retter til, før det lægges på lager.
- **Opskrifter** – forslag ud fra lageret, hvor varer der udløber snart bruges først.
  Vælg hvem der spiser med, antal personer, tid og hvor mange ekstra varer der må købes.
  "Vi har lavet den" trækker forbruget fra lageret.
- **Indkøb** – faste varer under minimum og manglende ingredienser samles automatisk på en liste
  med søge-link til Bilka ToGo for hver vare. I gennemgår og bestiller selv.
  Listen kan også gives til Claude med [HandleMCP](https://handlemcp.dk/bilkatogo-api/), som fylder kurven.
- **Allergier** – de 14 EU-allergener plus fritekst pr. familiemedlem. Opskrifter tjekkes to gange:
  AI'en får allergierne som krav, og bagefter kører et uafhængigt ordbaseret tjek, der frasorterer forslag.
- **Tilbagekaldte produkter** – Fødevarestyrelsens tilbagekald holdes op mod jeres varer og allergier.

Allergitjekket er en hjælp, ikke en garanti. Læs altid varedeklarationen.

## Kør lokalt

```bash
pip install -r requirements.txt
cp .streamlit/secrets.toml.example .streamlit/secrets.toml   # udfyld nøgler
streamlit run App.py
```

Tests: `pip install pytest && python -m pytest`

## Mangler før appen er klar (gøres ved computeren)

- [ ] Læg `SUPABASE_URL` (`https://dmwgqmdvvuognflntjdb.supabase.co`) og `SUPABASE_KEY` ind i appens secrets.
      Nøglen er service_role/secret key under Project Settings → API Keys i Supabase-projektet Naevnt.
      Tabellen `mymatti_state` er oprettet.
- [ ] Læg `GEMINI_API_KEY` og `APP_PASSWORD` ind samme sted, og fyld Gemini-kontoen op.
- [ ] Tjek at forsiden nederst viser "Data gemmes i: Supabase".
- [ ] Flet grenen ind, når secrets er på plads (ellers kører appen uden adgangskode og varig lagring).

## Opsætning (secrets)

| Navn | Formål |
| --- | --- |
| `GEMINI_API_KEY` | AI til opskrifter og fortolkning af varer/billeder. Uden den virker lager og indkøb stadig. |
| `APP_PASSWORD` | Adgangskode til appen (anbefales). |
| `SUPABASE_URL`, `SUPABASE_KEY` | Varig lagring. Kør `supabase/schema.sql` i projektet og brug service_role-nøglen. |

Uden Supabase gemmes data i `data/state.json`. På Streamlit Cloud forsvinder den fil ved genstart,
så sæt Supabase op, når appen skal bruges for alvor.

## Opbygning

- `App.py` – navigation og adgangskode
- `views/` – de fem sider
- `mymatti/core.py` – lager, enheder, indkøbsliste og allergitjek (uden Streamlit, dækket af tests)
- `mymatti/ai.py` – kald til Gemini · `mymatti/recalls.py` – tilbagekald · `mymatti/storage.py` – lagring
