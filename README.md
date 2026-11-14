# Mymatti

Web-app til familiens madlager: skriv hvad I har, få opskrifter ud fra det, og få gjort indkøbet til
Bilka ToGo klar – med hensyn til familiens allergier hele vejen. Kører på https://mymatti.netlify.app/.

## Det kan appen

- **Lager** – skriv varerne frit, indsæt en ordrebekræftelse, eller tag et foto af køleskab eller bon.
  Varerne vises som kort med plus/minus. Faste varer med et minimum kommer selv på indkøbslisten.
- **Opskrifter** – forslag ud fra lageret, hvor varer der udløber snart bruges først (kræver AI-nøgle,
  ellers spørger man Claude). "Lavet" trækker forbruget fra lageret.
- **Indkøb** – samlet liste med søge-link til Bilka ToGo pr. vare og en færdig besked til Claude med
  [HandleMCP](https://handlemcp.dk/bilkatogo-api/), som kan fylde kurven. Man bestiller og betaler selv.
- **Allergier** – de 14 EU-allergener plus fritekst pr. familiemedlem. Opskrifter tjekkes to gange:
  AI'en får allergierne som krav, og bagefter frasorterer et uafhængigt ordbaseret tjek forslag, der rammer.
- **Tilbagekaldte produkter** – Fødevarestyrelsens tilbagekald holdes op mod lageret og allergierne.
- **Claude** – samme data kan bruges fra Claude som brugerdefineret connector (MCP).

Allergitjekket er en hjælp, ikke en garanti. Læs altid varedeklarationen.

## Opbygning

| Del | Hvor | Hvad |
| --- | --- | --- |
| Hjemmeside | `web/` på Netlify | Statisk side uden byggetrin (`index.html`, `app.js`, `app.css`). |
| Server | `supabase/functions/mymatti-mcp/` | Supabase Edge Function med API til siden og MCP-server til Claude. |
| Data | Tabellen `mymatti_state` | Én række pr. husstand; id er SHA-256 af husstandskoden. |
| Allergiregler | `mymatti/core.py` | Kilden. `python scripts/gen_allergens.py` genererer `allergens.ts`. |

Serverens filer: `index.ts` (indgange og login), `api.ts` (handlinger bag siden), `mcp.ts` (Claude-værktøjer),
`logic.ts` (lager, indkøb, allergitjek), `ai.ts` (Gemini), `recalls.ts` (tilbagekald).

### Husstandskode

Hver husstand har en tilfældig kode, som indtastes én gang pr. telefon og står under Familie i appen.
Koden selv gemmes ingen steder – kun dens SHA-256. Den kan ikke genskabes, hvis den bliver væk.

### Claude-connectoren

Adressen er `https://<projekt>.supabase.co/functions/v1/mymatti-mcp/<husstandskode>` og tilføjes på
claude.ai under Tilpas → Connectors → Tilføj brugerdefineret forbindelse med "Intet login".
Adressen er hemmelig: alle med den kan læse og rette husstandens data.

## Udvikling

```bash
DEMO=1 node scripts/dev-server.mjs   # siden og API'et lokalt på http://localhost:8788 (data i hukommelsen)
node tests/api_test.mjs              # API-handlingerne
node tests/mcp_test.mjs              # Claude-værktøjerne, og at allergireglerne stemmer med Python
pip install pytest && python -m pytest   # allergireglerne i mymatti/core.py
```

Med `DEMO=1` oprettes en eksempel-husstand, hvis kode er `demo` gentaget 10 gange.

## Drift

- **Netlify:** udgiver mappen `web` (se `netlify.toml`). Ingen byggekommando eller miljøvariabler.
- **Supabase:** funktionen `mymatti-mcp` udgives med `verify_jwt = false` (den har sit eget login).
  Tabellen oprettes med `supabase/schema.sql`.
- **AI (valgfrit):** læg en Gemini-nøgle som secret `GEMINI_API_KEY` på funktionen. Standardmodellen er
  `gemini-flash-lite-latest` og kan ændres med `GEMINI_MODEL`. Uden nøgle virker alt undtagen opskrifter
  og foto i appen.
