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

- [ ] **Netlify:** Opret et site fra dette repo. Byggekommando: ingen. Publish directory: `web` (står i `netlify.toml`).
- [ ] **Husstandskoden:** Åbn siden, og log ind med koden fra Claude Code-samtalen (den sidste del af connector-adressen),
      eller opret en ny husstand. Opret familien og allergierne under Familie.
- [ ] **Claude:** Tilføj connector-adressen som brugerdefineret connector (Indstillinger → Connectors).
      Adressen står under Familie → Husstandskode → Tilslut Claude.
- [ ] **AI i appen (valgfrit):** Læg en gratis Gemini-nøgle ind som secret `GEMINI_API_KEY` på Supabase-funktionen
      `mymatti-mcp` (Edge Functions → Secrets). Uden den virker alt andet, og Claude kan lave opskrifterne.

## Netlify-udgaven (web/)

Den nye app er en statisk side uden byggetrin. Al logik ligger i Supabase-funktionen `supabase/functions/mymatti-mcp/`:

- `web/` – siden (`index.html`, `app.js`, `app.css`). Farvetema og husstandskode gemmes på den enkelte telefon.
- `api.ts` – handlingerne bag siden · `ai.ts` – Gemini · `recalls.ts` – tilbagekald · `logic.ts` – lager, indkøb og allergitjek.
- En husstand er én række i `mymatti_state`, hvis id er SHA-256 af husstandskoden. Koden selv gemmes ikke nogen steder.
- Lokalt: `node scripts/dev-server.mjs` (data i hukommelsen) → http://localhost:8788. Med `DEMO=1` oprettes en eksempel-husstand.
- Tests: `node tests/api_test.mjs` og `node tests/mcp_test.mjs`.

Streamlit-udgaven (`App.py`, `views/`, `mymatti/`) ligger her stadig, men er afløst af Netlify-udgaven.
`mymatti/core.py` er fortsat kilden til allergireglerne (`python scripts/gen_allergens.py`).

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
