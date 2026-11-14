// Mymatti web-app. Al logik (lager, allergitjek, indkøb) ligger på serveren; her vises og sendes der kun.
const API = ["localhost", "127.0.0.1"].includes(location.hostname)
  ? "/api"
  : "https://dmwgqmdvvuognflntjdb.supabase.co/functions/v1/mymatti-mcp/api";
const MCP_BASE = "https://dmwgqmdvvuognflntjdb.supabase.co/functions/v1/mymatti-mcp/";
const DISCLAIMER = "Allergitjekket er en hjælp, ikke en garanti. Læs altid varedeklarationen på de konkrete produkter.";
const THEMES = [["skov", "Skov"], ["hav", "Hav"], ["baer", "Bær"], ["sol", "Sol"], ["grafit", "Grafit"], ["nat", "Nat"]];
const THEME_COLORS = { skov: "#1F6F4A", hav: "#1D5FA8", baer: "#9B2C55", sol: "#A85F0A", grafit: "#2F3A44", nat: "#121815" };
const TABS = [["overblik", "🏠", "Overblik"], ["lager", "🥕", "Lager"], ["opskrifter", "🍳", "Opskrifter"], ["indkob", "🛒", "Indkøb"], ["familie", "👨‍👩‍👧", "Familie"]];
const STEP = { g: 100, ml: 100, kg: 0.5, l: 0.5 };

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* privat vindue */ } },
};

const S = {
  code: store.get("mymatti-code"), view: null, tab: "overblik", busy: false,
  where: "Alle", pending: null, pendingNote: "", recalls: null, cooking: null, recipeTab: "forslag", newCode: null,
};

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (qty, unit = "") => `${Number(qty).toFixed(2).replace(/\.?0+$/, "").replace(".", ",")} ${unit}`.trim();
const kr = (n) => Math.round(n).toLocaleString("da-DK");
const opts = (values, selected) => values.map((v) => `<option${v === selected ? " selected" : ""}>${esc(v)}</option>`).join("");

function setTheme(name) {
  const theme = THEMES.some(([key]) => key === name) ? name : "skov";
  document.documentElement.dataset.theme = theme;
  $('meta[name="theme-color"]').content = THEME_COLORS[theme];
  store.set("mymatti-theme", theme);
}

let toastTimer;
function toast(message, error = false) {
  const el = $("#toast");
  el.textContent = message;
  el.className = error ? "error" : "";
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, error ? 6000 : 2600);
}

/** Send en handling til serveren. Returnerer svaret, eller null hvis den fejlede (fejlen er vist). */
async function api(action, payload = {}, { quiet = false } = {}) {
  if (!quiet) { S.busy = true; $("#app").classList.add("busy"); }
  try {
    const resp = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(S.code ? { "x-mymatti-code": S.code } : {}) },
      body: JSON.stringify({ action, payload }),
    });
    const data = await resp.json().catch(() => ({}));
    if (resp.status === 401) { logout(); toast("Husstandskoden er ikke gyldig.", true); return null; }
    if (!resp.ok) { toast(data.error || "Der opstod en fejl. Prøv igen.", true); return null; }
    if (data.view) S.view = data.view;
    return data;
  } catch {
    toast("Ingen forbindelse. Tjek nettet, og prøv igen.", true);
    return null;
  } finally {
    if (!quiet) { S.busy = false; $("#app").classList.remove("busy"); }
  }
}

function logout() {
  store.set("mymatti-code", null);
  Object.assign(S, { code: null, view: null, tab: "overblik", pending: null, recalls: null });
  render();
}

// ------------------------------------------------------------------ skærme
function freshness(item) {
  const d = item.days_left;
  if (d === null || d === undefined) return "";
  const days = (n) => `${n} ${n === 1 ? "dag" : "dage"}`;
  if (d < 0) return `<span class="dot late"></span>udløbet for ${days(-d)} siden`;
  if (d === 0) return `<span class="dot soon"></span>udløber i dag`;
  return `<span class="dot${d <= 3 ? " soon" : ""}"></span>${days(d)} tilbage`;
}

function viewLogin() {
  if (S.newCode) {
    return `<h1>Jeres husstand er oprettet</h1>
      <div class="card warn"><p><b>Gem husstandskoden nu.</b> Den er jeres eneste nøgle til dataene og kan ikke genskabes, hvis den bliver væk.</p>
      <pre id="newcode">${esc(S.newCode)}</pre>
      <button data-act="copy" data-target="newcode">Kopiér koden</button></div>
      <p class="muted">Del koden med din partner, så I bruger samme lager. Den står også under Familie, så længe I er logget ind.</p>
      <button class="primary" data-act="enter-new">Jeg har gemt koden – fortsæt</button>`;
  }
  return `<h1>Mymatti</h1>
    <p class="muted">Familiens madlager, opskrifter og indkøb – med styr på allergierne.</p>
    <form class="card" data-form="login">
      <label>Husstandskode<input name="code" autocomplete="off" autocapitalize="off" spellcheck="false" required minlength="32" placeholder="Indsæt koden her"></label>
      <button class="primary">Åbn husstanden</button>
    </form>
    <div class="card"><h3>Ny her?</h3><p class="muted">Opret en husstand, og få en kode, som I deler i familien.</p>
      <button data-act="create">Opret ny husstand</button></div>`;
}

function viewOverblik(v) {
  const soon = v.inventory.filter((i) => i.qty > 0 && i.days_left !== null && i.days_left <= 3);
  const low = v.inventory.filter((i) => i.low);
  const stat = (n, label, cls = "") => `<div class="stat ${cls}"><b>${n}</b><span>${label}</span></div>`;
  let html = `<h1>Mymatti</h1>
    <div class="stats">${stat(v.inventory.filter((i) => i.qty > 0).length, "På lager")}${stat(soon.length, "Brug snart", soon.length ? "warn" : "")}
    ${stat(low.length, "Mangler", low.length ? "alert" : "")}${stat(v.shopping.length, "Indkøb")}</div>`;
  if (v.budget.month) {
    const over = v.budget.spent > v.budget.month;
    html += `<div class="stack"><p>Madbudget denne måned: <b>${kr(v.budget.spent)}</b> af ${kr(v.budget.month)} kr.${over ? ` <span class="alert-text">(${kr(v.budget.spent - v.budget.month)} kr. over)</span>` : ""}</p>
      <div class="bar${over ? " over" : ""}"><i data-width="${Math.min(v.budget.spent / v.budget.month, 1) * 100}"></i></div></div>`;
  }
  if (!v.family.length) html += `<div class="card warn"><p>Start med at indtaste familiens allergier, så opskrifter og indkøb tager højde for dem.</p><button data-act="tab" data-tab="familie">Gå til Familie</button></div>`;
  if (!v.inventory.length) html += `<div class="card"><p>Lageret er tomt. Skriv, hvad I har i køleskab, fryser og skabe.</p><button class="primary" data-act="tab" data-tab="lager">Tilføj varer</button></div>`;
  else html += `<button class="primary" data-act="tab" data-tab="opskrifter">Hvad skal vi have i aften?</button>`;

  if (S.recalls?.relevant.length) {
    html += `<h2>⚠️ Tilbagekaldte produkter, der kan vedrøre jer</h2>` + S.recalls.relevant.map((r) => `<div class="card alert">
      <a href="${esc(r.link)}" target="_blank" rel="noopener"><b>${esc(r.title)}</b></a><p>${esc(r.description)}</p>
      <p class="alert-text">${[r.items.length ? "Matcher jeres varer: " + esc(r.items.join(", ")) : "", r.allergens.length ? "Udeklareret allergen: " + esc(r.allergens.join(", ")) : ""].filter(Boolean).join(" · ")}</p></div>`).join("")
      + `<p class="muted">Matchet er lavet på varenavn. Tjek mærke, batch og dato i opslaget.</p>`;
  }
  if (soon.length) html += `<h2>Brug først</h2><ul class="plain">${soon.map((i) => `<li class="card tight"><div class="item-head"><b>${esc(i.name)}</b><span class="qty">${fmt(i.qty, i.unit)}</span></div><p class="muted">${esc(i.location)} · ${freshness(i)}</p></li>`).join("")}</ul>`;
  if (low.length) html += `<h2>Faste varer, der er ved at slippe op</h2><ul class="plain">${low.map((i) => `<li class="card tight"><div class="item-head"><b>${esc(i.name)}</b><span class="qty">${fmt(i.qty, i.unit)} af ${fmt(i.min_qty, i.unit)}</span></div></li>`).join("")}</ul><p class="muted">De er lagt på indkøbslisten automatisk.</p>`;
  if (v.profile.allergens.length || v.profile.other.length) {
    html += `<h2>Familiens allergier</h2><ul class="plain">${[...v.profile.allergens, ...v.profile.other].map((a) => `<li>${esc(a.label)} – ${esc(a.who.join(", "))}</li>`).join("")}</ul><p class="muted">${DISCLAIMER}</p>`;
  }
  if (S.recalls && !S.recalls.error) {
    html += `<details class="card"><summary>Seneste tilbagekald fra Fødevarestyrelsen (${S.recalls.total})</summary><ul class="plain">${S.recalls.latest.map((r) => `<li><a href="${esc(r.link)}" target="_blank" rel="noopener">${esc(r.title)}</a> <span class="muted">${esc(r.published ?? "")}</span></li>`).join("")}</ul>
      <a href="${esc(S.recalls.page)}" target="_blank" rel="noopener">Se alle tilbagekald</a></details>`;
  }
  return html;
}

function itemFields(i, v, prefix = "") {
  return `<label>Vare<input name="${prefix}name" value="${esc(i.name)}" required maxlength="80"></label>
    <div class="row"><label class="grow">Mængde<input name="${prefix}qty" type="number" inputmode="decimal" min="0" step="any" value="${i.qty}"></label>
    <label class="grow">Enhed<select name="${prefix}unit">${opts(v.units, i.unit)}</select></label></div>
    <div class="row"><label class="grow">Placering<select name="${prefix}location">${opts(v.locations, i.location)}</select></label>
    <label class="grow">Kategori<select name="${prefix}category">${opts(v.categories, i.category)}</select></label></div>
    <div class="row"><label class="grow">Udløber (valgfri)<input name="${prefix}expires" type="date" value="${esc(i.expires ?? "")}"></label>
    <label class="grow">Minimum (fast vare)<input name="${prefix}min_qty" type="number" inputmode="decimal" min="0" step="any" value="${i.min_qty ?? ""}" placeholder="Ikke fast vare"></label></div>`;
}

function viewLager(v) {
  let html = `<h1>Lager</h1>`;
  if (S.pending) {
    html += `<div class="card"><h3>Tjek varerne, før de lægges på lager</h3>
      <p class="muted">Mængde og holdbarhed er et skøn. Sæt den rigtige dato på kød og mejeri – resten kan stå.</p>
      ${S.pendingNote ? `<p class="alert-text">${esc(S.pendingNote)}</p>` : ""}
      <form class="stack" data-form="pending">${S.pending.map((i, n) => `<div class="card"><div class="row spread"><b>${esc(i.name)}</b><button type="button" class="quiet danger" data-act="pending-remove" data-n="${n}">Fjern</button></div>
        <div class="row"><label class="grow">Mængde<input name="qty${n}" type="number" inputmode="decimal" min="0" step="any" value="${i.qty}"></label>
        <label class="grow">Enhed<select name="unit${n}">${opts(v.units, i.unit)}</select></label></div>
        <div class="row"><label class="grow">Placering<select name="location${n}">${opts(v.locations, i.location)}</select></label>
        <label class="grow">Udløber<input name="expires${n}" type="date" value="${esc(i.expires ?? "")}"></label></div></div>`).join("")}
      <div class="row"><button class="primary grow">Læg ${S.pending.length} vare(r) på lager</button><button type="button" data-act="pending-cancel">Fortryd</button></div></form></div>`;
    return html;
  }
  html += `<form class="card" data-form="parse"><label>Hvad har I?<textarea name="text" placeholder="Fx: 2 l havremælk, 400 g kyllingebryst, ris, 3 dåser flåede tomater, løg" required></textarea></label>
    <div class="row"><button class="primary grow">Tilføj varer</button>
    <label class="btn">📷 Foto<input type="file" accept="image/*" data-change="photo" hidden></label></div>
    <p class="muted">Skriv frit, indsæt en ordrebekræftelse, eller tag et billede af køleskabet eller bonen${v.ai_available ? "" : " (foto kræver, at AI er sat op)"}.</p></form>
    <button data-act="staple-new">📌 Tilføj fast vare</button>`;
  const flagged = v.inventory.filter((i) => i.warnings.length);
  if (flagged.length) html += `<details class="card warn"><summary>⚠️ ${flagged.length} vare(r) indeholder familiens allergener</summary><ul class="plain">${flagged.map((i) => `<li><b>${esc(i.name)}</b>: ${esc(i.warnings.join("; "))}</li>`).join("")}</ul><p class="muted">De holdes ude af opskrifter til de berørte personer.</p></details>`;
  html += `<div class="chips" role="group" aria-label="Placering">${["Alle", ...v.locations].map((w) => `<button class="chip" data-act="where" data-where="${esc(w)}" aria-pressed="${S.where === w}">${esc(w)}</button>`).join("")}</div>`;
  const shown = v.inventory.filter((i) => S.where === "Alle" || i.location === S.where);
  if (!shown.length) html += `<p class="muted">${v.inventory.length ? `Ingen varer i ${esc(S.where.toLowerCase())}.` : "Ingen varer endnu."}</p>`;
  html += shown.map((i) => {
    const step = STEP[i.unit] ?? 1;
    const details = [esc(i.location), freshness(i), i.min_qty ? `📌 min. ${fmt(i.min_qty, i.unit)}` : ""].filter(Boolean).join(" · ");
    return `<div class="card${i.low ? " alert" : ""}"><div class="item-head"><b>${esc(i.name)}${i.warnings.length ? " ⚠️" : ""}</b><span class="qty">${fmt(i.qty, i.unit)}</span></div>
      <div class="item-foot"><p class="muted">${details}</p>
      <div class="actions"><button class="square" data-act="adjust" data-id="${i.id}" data-delta="${-step}" aria-label="Brugt ${fmt(step, i.unit)} ${esc(i.name)}">−</button>
      <button class="square" data-act="adjust" data-id="${i.id}" data-delta="${step}" aria-label="Læg ${fmt(step, i.unit)} ${esc(i.name)} til">+</button>
      <button data-act="edit-item" data-id="${i.id}">Ret</button></div></div></div>`;
  }).join("");
  return html;
}

function recipeCard(r, v, saved) {
  const missing = r.ingredients.filter((i) => !i.in_stock);
  let html = `<div class="card"><h3>${esc(r.title)}</h3>
    <p class="muted">⏱ ${esc(r.time_min ?? "?")} min · 👥 ${esc(r.servings ?? "?")} pers. · ${missing.length ? `🛒 mangler ${missing.length}` : "✅ alt på lager"}</p>`;
  if (r.allergy_hits?.length) html += `<div class="card alert"><b>Indeholder allergener for familien</b><ul class="plain">${r.allergy_hits.map((h) => `<li class="alert-text">${esc(h)}</li>`).join("")}</ul></div>`;
  else if (r.eaters?.length) html += `<p class="muted">Allergitjekket for: ${esc(r.eaters.join(", "))}</p>`;
  html += `<p>${esc(r.description ?? "")}</p><details><summary>Ingredienser og fremgangsmåde</summary><div class="stack">
    <ul class="plain">${r.ingredients.map((i) => `<li>${i.in_stock ? "✅" : "🛒"} ${esc(i.amount)} ${esc(i.name)}</li>`).join("")}</ul>
    <ol class="steps">${(r.steps ?? []).map((s) => `<li>${esc(s)}</li>`).join("")}</ol>${r.tip ? `<p class="muted">💡 ${esc(r.tip)}</p>` : ""}</div></details>`;
  if (S.cooking === r.id) {
    const used = r.ingredients.filter((i) => i.in_stock);
    html += `<form class="card" data-form="cooked" data-id="${r.id}"><h3>Hvad brugte I?</h3>${used.length ? "" : `<p class="muted">Opskriften bruger ingen varer, der stadig er på lager.</p>`}
      ${used.map((i) => { const item = v.inventory.find((x) => x.id === i.inventory_id); return `<label>${esc(item.name)} (har ${fmt(item.qty, item.unit)})<input name="${item.id}" type="number" inputmode="decimal" min="0" step="any" value="${i.use_qty ?? 0}"></label>`; }).join("")}
      <div class="row"><button class="primary grow">Træk fra lageret</button><button type="button" data-act="cook-cancel">Fortryd</button></div></form>`;
  } else {
    html += `<div class="row even"><button data-act="recipe-shop" data-id="${r.id}"${missing.length ? "" : " disabled"} aria-label="Læg manglende varer på indkøbslisten">🛒 Mangler</button>
      <button data-act="cook" data-id="${r.id}">✅ Lavet</button>
      ${saved ? `<button class="danger" data-act="recipe-delete" data-id="${r.id}">Fjern</button>` : `<button data-act="recipe-save" data-id="${r.id}"${v.saved_recipes.some((x) => x.title === r.title) ? " disabled" : ""}>⭐ Gem</button>`}</div>`;
  }
  return html + `</div>`;
}

function viewOpskrifter(v) {
  let html = `<h1>Opskrifter</h1><div class="chips"><button class="chip" data-act="recipe-tab" data-rt="forslag" aria-pressed="${S.recipeTab === "forslag"}">Forslag</button>
    <button class="chip" data-act="recipe-tab" data-rt="gemte" aria-pressed="${S.recipeTab === "gemte"}">Gemte (${v.saved_recipes.length})</button></div>`;
  if (S.recipeTab === "gemte") {
    return html + (v.saved_recipes.length ? v.saved_recipes.map((r) => recipeCard(r, v, true)).join("") : `<p class="muted">Ingen gemte opskrifter endnu.</p>`);
  }
  if (!v.ai_available) html += `<div class="card warn"><p>Opskriftsforslag her i appen kræver, at AI er sat op. Du kan i stedet spørge Claude, hvis Mymatti er tilsluttet der.</p></div>`;
  else if (!v.inventory.some((i) => i.qty > 0)) html += `<div class="card"><p>Lageret er tomt – tilføj varer først.</p></div>`;
  else {
    html += `<form class="card" data-form="generate">
      ${v.family.length ? `<fieldset class="stack"><legend class="muted">Hvem spiser med?</legend>${v.family.map((m) => `<label class="check"><input type="checkbox" name="eater" value="${m.id}" checked>${esc(m.name)}</label>`).join("")}</fieldset>` : ""}
      <div class="row"><label class="grow">Måltid<select name="meal">${opts(["Aftensmad", "Madpakker", "Frokost", "Morgenmad", "Bagværk/dessert"], "Aftensmad")}</select></label>
      <label class="grow">Personer<input name="persons" type="number" min="1" max="20" value="${v.settings.persons}"></label></div>
      <div class="row"><label class="grow">Maks. tid<select name="max_time">${[15, 20, 30, 45, 60, 90].map((t) => `<option value="${t}"${t === 20 ? " selected" : ""}>${t} min</option>`).join("")}</select></label>
      <label class="grow">Antal forslag<select name="count">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}"${n === 3 ? " selected" : ""}>${n}${n === 7 ? " (ugeplan)" : ""}</option>`).join("")}</select></label>
      <label class="grow">Må købe ekstra<select name="max_missing">${[0, 1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}"${n === 2 ? " selected" : ""}>${n} varer</option>`).join("")}</select></label></div>
      <label>Ønsker (valgfrit)<input name="wishes" maxlength="200" placeholder="Fx børnevenligt, brug kyllingen"></label>
      <button class="primary">Find opskrifter</button></form>`;
  }
  const safe = v.suggestions.filter((r) => !r.allergy_hits?.length), blocked = v.suggestions.filter((r) => r.allergy_hits?.length);
  if (safe.length > 1 && safe.some((r) => r.ingredients.some((i) => !i.in_stock))) html += `<button data-act="recipe-shop">🛒 Læg alt, der mangler til de ${safe.length} retter, på indkøbslisten</button>`;
  html += safe.map((r) => recipeCard(r, v, false)).join("");
  if (blocked.length) html += `<details class="card alert"><summary>🚫 ${blocked.length} forslag frasorteret af allergitjekket</summary>${blocked.map((r) => `<p><b>${esc(r.title)}</b></p><ul class="plain">${r.allergy_hits.map((h) => `<li class="alert-text">${esc(h)}</li>`).join("")}</ul>`).join("")}</details>`;
  if (v.suggestions.length) html += `<p class="muted">${DISCLAIMER}</p>`;
  return html;
}

function shoppingText(v) { return v.shopping.map((e) => `- ${e.name}${e.amount ? ` – ${e.amount}` : ""}`).join("\n"); }
function claudePrompt(v) {
  const avoid = [...v.profile.allergens, ...v.profile.other].map((a) => a.label);
  let p = "Fyld min kurv hos BilkaToGo med denne indkøbsliste. Vælg det billigste produkt, der passer, og vis mig dine valg og usikre varer, før du lægger noget i kurven. Du må ikke bestille eller betale – det gør jeg selv.";
  if (avoid.length) p += `\nVigtigt: Familien har allergi over for: ${avoid.join(", ")}. Vælg kun produkter uden disse allergener som ingrediens, og fortæl mig, hvis du er i tvivl om en vare. ${v.settings.traces_ok ? "Varer mærket 'kan indeholde spor af' er i orden." : "Undgå også varer mærket 'kan indeholde spor af'."}`;
  if (v.settings.shop_prefs) p += `\nØnsker til varevalg: ${v.settings.shop_prefs}.`;
  return `${p}\n\n${shoppingText(v)}`;
}

function viewIndkob(v) {
  let html = `<h1>Indkøb</h1><form class="card" data-form="shop-add"><div class="row"><label class="grow">Vare<input name="name" required maxlength="80" placeholder="Fx havregryn"></label>
    <label class="grow">Mængde<input name="amount" maxlength="40" placeholder="Fx 1 kg"></label></div>
    <div class="row"><label class="grow">Varegruppe<select name="category">${opts(v.categories, "Andet")}</select></label><button class="primary">Tilføj</button></div></form>`;
  if (!v.shopping.length) return html + `<div class="card"><p>Indkøbslisten er tom. Faste varer under minimum og manglende ingredienser fra opskrifter kommer på af sig selv.</p></div>`;
  for (const cat of v.categories) {
    const entries = v.shopping.filter((e) => e.category === cat);
    if (!entries.length) continue;
    html += `<h2>${esc(cat)}</h2>` + entries.map((e) => `<div class="card${e.in_cart ? " done" : ""}"><div class="item-foot"><label class="check"><input type="checkbox" data-change="cart" data-id="${e.id}"${e.in_cart ? " checked" : ""}><span><b>${esc(e.name)}</b>${e.amount ? ` · ${esc(e.amount)}` : ""}</span></label>
      <div class="actions"><a class="btn" href="${esc(e.bilka_url)}" target="_blank" rel="noopener" aria-label="Find ${esc(e.name)} hos Bilka">Bilka</a><button class="square danger" data-act="shop-remove" data-id="${e.id}" aria-label="Fjern ${esc(e.name)}">✕</button></div></div>
      ${e.warnings.length ? `<p class="alert-text">⚠️ ${esc(e.warnings.join("; "))}</p>` : e.reason ? `<p class="muted">${esc(e.reason)}</p>` : ""}</div>`).join("");
  }
  const inCart = v.shopping.filter((e) => e.in_cart).length;
  html += `<p class="muted">${inCart} af ${v.shopping.length} lagt i kurven. Sæt flueben, når en vare er i kurven.</p>
    <h2>Gør bestillingen klar</h2>
    <details class="card"><summary>Lad Claude fylde kurven (HandleMCP)</summary><div class="stack"><p class="muted">Kræver Claude på computeren med HandleMCP sat op. Claude bestiller og betaler aldrig.</p>
      <pre id="prompt">${esc(claudePrompt(v))}</pre><button data-act="copy" data-target="prompt">Kopiér besked til Claude</button></div></details>
    <details class="card"><summary>Indkøbslisten som tekst</summary><div class="stack"><pre id="listtext">${esc(shoppingText(v))}</pre><button data-act="copy" data-target="listtext">Kopiér listen</button></div></details>
    <a class="btn primary" href="https://www.bilkatogo.dk/" target="_blank" rel="noopener">Åbn Bilka ToGo</a>
    <form class="card" data-form="order"><h3>Når bestillingen er gennemført</h3><p class="muted">De afkrydsede varer lægges på lageret.</p>
      <label>Hvad kom bestillingen på? (kr., valgfrit)<input name="amount" type="number" inputmode="decimal" min="0" step="any"></label>
      <button class="primary"${inCart ? "" : " disabled"}>Læg ${inCart} vare(r) på lager</button></form>`;
  if (v.profile.allergens.length || v.profile.other.length) html += `<p class="muted">${DISCLAIMER}</p>`;
  return html;
}

function viewFamilie(v) {
  const theme = document.documentElement.dataset.theme;
  let html = `<h1>Familie</h1>` + v.family.map((m) => {
    const labels = [...m.allergies.map((k) => v.allergen_options.find((o) => o.key === k)?.label.split(" (")[0]), m.other_allergies].filter(Boolean);
    return `<div class="card"><div class="item-head"><b>${esc(m.name)}</b><button data-act="member-edit" data-id="${m.id}">Ret</button></div>
      <p class="muted">${labels.length ? esc(labels.join(", ")) : "Ingen allergier"}${m.dislikes ? ` · kan ikke lide: ${esc(m.dislikes)}` : ""}</p></div>`;
  }).join("");
  html += `<button class="primary" data-act="member-edit">Tilføj familiemedlem</button><p class="muted">${DISCLAIMER}</p>
    <h2>Farvetema</h2><div class="chips">${THEMES.map(([key, label]) => `<button class="chip" data-act="theme" data-theme-key="${key}" aria-pressed="${theme === key}">${label}</button>`).join("")}</div>
    <p class="muted">Temaet gælder kun på denne telefon.</p>
    <h2>Indstillinger</h2><form class="card" data-form="settings">
      <label>Antal personer I normalt laver mad til<input name="persons" type="number" min="1" max="20" value="${v.settings.persons}"></label>
      <label>Månedligt madbudget (kr.) – 0 hvis I ikke har et<input name="budget_month" type="number" min="0" step="100" value="${v.settings.budget_month}"></label>
      <label>Ønsker til varevalg ved indkøb<input name="shop_prefs" maxlength="200" value="${esc(v.settings.shop_prefs)}"></label>
      <label class="check"><input type="checkbox" name="traces_ok"${v.settings.traces_ok ? " checked" : ""}>Varer mærket “kan indeholde spor af …” er i orden</label>
      <button class="primary">Gem indstillinger</button></form>
    <h2>Husstandskode</h2><div class="card"><p class="muted">Koden giver adgang til alle jeres data. Del den kun med dem, der skal bruge appen.</p>
      <details><summary>Vis koden</summary><div class="stack"><pre id="code">${esc(S.code)}</pre><button data-act="copy" data-target="code">Kopiér koden</button></div></details>
      <details><summary>Tilslut Claude</summary><div class="stack"><p class="muted">Tilføj denne adresse som brugerdefineret connector i Claude. Så kan Claude se og rette lager og indkøbsliste.</p>
      <pre id="mcp">${esc(MCP_BASE + S.code)}</pre><button data-act="copy" data-target="mcp">Kopiér adressen</button></div></details>
      <button class="danger" data-act="logout">Log ud på denne telefon</button></div>`;
  return html;
}

const VIEWS = { overblik: viewOverblik, lager: viewLager, opskrifter: viewOpskrifter, indkob: viewIndkob, familie: viewFamilie };

function render() {
  const app = $("#app"), tabs = $("#tabs");
  if (!S.code || !S.view) {
    tabs.hidden = true;
    app.innerHTML = S.code && !S.newCode ? `<p class="muted">Henter…</p>` : viewLogin();
    return;
  }
  tabs.hidden = false;
  tabs.innerHTML = TABS.map(([key, icon, label]) => `<button data-act="tab" data-tab="${key}"${S.tab === key ? ' aria-current="page"' : ""}><span aria-hidden="true">${icon}</span>${label}</button>`).join("");
  app.innerHTML = VIEWS[S.tab](S.view);
  for (const el of app.querySelectorAll("[data-width]")) el.style.width = `${el.dataset.width}%`;
}

// ------------------------------------------------------------------ dialog
function openSheet(html) {
  const sheet = $("#sheet");
  sheet.innerHTML = html;
  if (!sheet.open) sheet.showModal();
}
const closeSheet = () => $("#sheet").close();
$("#sheet").addEventListener("close", () => { $("#sheet").innerHTML = ""; });

function sheetItem(item, title) {
  openSheet(`<form class="stack" data-form="item" data-id="${item.id ?? ""}"><h2>${esc(title)}</h2>${itemFields(item, S.view)}
    <div class="row"><button class="primary grow">Gem</button><button type="button" data-act="sheet-close">Luk</button>
    ${item.id ? `<button type="button" class="danger" data-act="item-delete" data-id="${item.id}">Slet</button>` : ""}</div></form>`);
}

function sheetMember(m) {
  openSheet(`<form class="stack" data-form="member" data-id="${m.id ?? ""}"><h2>${m.id ? "Ret familiemedlem" : "Nyt familiemedlem"}</h2>
    <label>Navn<input name="name" value="${esc(m.name ?? "")}" required maxlength="40"></label>
    <fieldset class="stack"><legend class="muted">Allergier og intolerancer</legend>${S.view.allergen_options.map((o) => `<label class="check"><input type="checkbox" name="allergy" value="${o.key}"${(m.allergies ?? []).includes(o.key) ? " checked" : ""}>${esc(o.label)}</label>`).join("")}</fieldset>
    <label>Andre allergier (adskil med komma)<input name="other_allergies" value="${esc(m.other_allergies ?? "")}" maxlength="200" placeholder="Fx oksekød, græskar, kiwi"></label>
    <label>Kan ikke lide (ikke allergi)<input name="dislikes" value="${esc(m.dislikes ?? "")}" maxlength="200" placeholder="Fx svampe, oliven"></label>
    <div class="row"><button class="primary grow">Gem</button><button type="button" data-act="sheet-close">Luk</button>
    ${m.id ? `<button type="button" class="danger" data-act="member-delete" data-id="${m.id}">Slet</button>` : ""}</div></form>`);
}

// ---------------------------------------------------------------- handlinger
async function copyFrom(id) {
  const text = $(`#${id}`)?.textContent ?? "";
  try { await navigator.clipboard.writeText(text); toast("Kopieret"); }
  catch { toast("Kunne ikke kopiere – markér teksten og kopiér selv.", true); }
}

const ACTIONS = {
  tab: (d) => { S.tab = d.tab; S.cooking = null; window.scrollTo(0, 0); },
  where: (d) => { S.where = d.where; },
  theme: (d) => setTheme(d.themeKey),
  "recipe-tab": (d) => { S.recipeTab = d.rt; },
  copy: (d) => copyFrom(d.target),
  logout,
  "sheet-close": closeSheet,
  create: async () => { const r = await api("create_household"); if (r?.code) S.newCode = r.code; },
  "enter-new": async () => { S.code = S.newCode; S.newCode = null; store.set("mymatti-code", S.code); await api("get"); loadRecalls(); },
  adjust: (d) => api("inventory_adjust", { id: d.id, delta: Number(d.delta) }, { quiet: true }),
  "edit-item": (d) => sheetItem(S.view.inventory.find((i) => i.id === d.id), "Ret vare"),
  "staple-new": () => sheetItem({ name: "", qty: 0, unit: "pk", location: "Kolonial", category: "Kolonial", min_qty: 1 }, "Ny fast vare"),
  "item-delete": async (d) => { if (await api("inventory_delete", { id: d.id })) closeSheet(); },
  "pending-remove": (d) => { S.pending.splice(Number(d.n), 1); if (!S.pending.length) S.pending = null; },
  "pending-cancel": () => { S.pending = null; },
  "member-edit": (d) => sheetMember(S.view.family.find((m) => m.id === d.id) ?? {}),
  "member-delete": async (d) => { if (await api("family_delete", { id: d.id })) closeSheet(); },
  "shop-remove": (d) => api("shopping_remove", { id: d.id }),
  "recipe-shop": async (d) => { const r = await api("recipe_shop", { id: d.id }); if (r) toast(`${r.added} vare(r) lagt på indkøbslisten`); },
  "recipe-save": async (d) => { if (await api("recipe_save", { id: d.id })) toast("Opskrift gemt"); },
  "recipe-delete": (d) => api("recipe_delete", { id: d.id }),
  cook: (d) => { S.cooking = d.id; },
  "cook-cancel": () => { S.cooking = null; },
};

const num = (v) => (v === "" || v === null ? null : Number(String(v).replace(",", ".")));

const FORMS = {
  login: async (f) => { S.code = f.get("code").trim(); if (await api("get")) { store.set("mymatti-code", S.code); loadRecalls(); } else S.code = null; },
  parse: async (f) => { const r = await api("parse_text", { text: f.get("text") }); if (r) setPending(r); },
  pending: async (f) => {
    const items = S.pending.map((i, n) => ({ ...i, qty: num(f.get(`qty${n}`)) ?? i.qty, unit: f.get(`unit${n}`), location: f.get(`location${n}`), expires: f.get(`expires${n}`) || null }));
    if (await api("inventory_add", { items })) { toast(`${items.length} vare(r) lagt på lager`); S.pending = null; }
  },
  item: async (f, form) => {
    const item = { id: form.dataset.id || undefined, name: f.get("name"), qty: num(f.get("qty")) ?? 0, unit: f.get("unit"), location: f.get("location"), category: f.get("category"), expires: f.get("expires") || null, min_qty: num(f.get("min_qty")) };
    const ok = item.id ? await api("inventory_update", { item }) : await api("inventory_add", { items: [item] });
    if (ok) closeSheet();
  },
  member: async (f, form) => {
    const member = { id: form.dataset.id || undefined, name: f.get("name"), allergies: f.getAll("allergy"), other_allergies: f.get("other_allergies"), dislikes: f.get("dislikes") };
    if (await api("family_save", { member })) closeSheet();
  },
  settings: async (f) => { if (await api("settings_save", { persons: f.get("persons"), budget_month: f.get("budget_month"), shop_prefs: f.get("shop_prefs"), traces_ok: f.get("traces_ok") === "on" })) toast("Indstillinger gemt"); },
  "shop-add": (f) => api("shopping_add", { name: f.get("name"), amount: f.get("amount"), category: f.get("category") }),
  order: async (f) => { const r = await api("order_complete", { amount: num(f.get("amount")) }); if (r) toast(`${r.received.length} vare(r) lagt på lager`); },
  generate: async (f) => {
    const eaters = f.getAll("eater");
    if (S.view.family.length && !eaters.length) return toast("Vælg mindst én, der spiser med.", true);
    await api("recipes_generate", { eaters, meal: f.get("meal"), persons: f.get("persons"), max_time: f.get("max_time"), count: f.get("count"), max_missing: f.get("max_missing"), wishes: f.get("wishes") });
  },
  cooked: async (f, form) => {
    const used = [...f.entries()].map(([inventory_id, qty]) => ({ inventory_id, qty: num(qty) ?? 0 }));
    if (await api("recipe_cooked", { id: form.dataset.id, used })) { S.cooking = null; toast("Lageret er opdateret"); }
  },
};

function setPending(r) {
  if (!r.items.length) return toast("Der blev ikke fundet nogen varer. Prøv at skrive dem på en anden måde.", true);
  S.pending = r.items;
  S.pendingNote = r.note || "";
}

async function onPhoto(input) {
  const file = input.files?.[0];
  if (!file) return;
  if (!S.view.ai_available) return toast("Foto kræver, at AI er sat op.", true);
  const kind = /bon|kvittering|receipt/i.test(file.name) ? "bon" : "koleskab";
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const r = await api("parse_image", { image_base64: base64, mime: file.type, kind });
  if (r) setPending(r);
}

async function loadRecalls() {
  const r = await api("recalls", {}, { quiet: true });
  if (r) { S.recalls = r; if (S.tab === "overblik") render(); }
}

document.addEventListener("click", async (event) => {
  const el = event.target.closest("[data-act]");
  if (!el || S.busy || el.disabled) return;
  await ACTIONS[el.dataset.act]?.(el.dataset);
  render();
});

document.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-form]");
  if (!form) return;
  event.preventDefault();
  if (S.busy) return;
  await FORMS[form.dataset.form]?.(new FormData(form), form);
  render();
});

document.addEventListener("change", async (event) => {
  const el = event.target.closest("[data-change]");
  if (!el) return;
  if (el.dataset.change === "cart") await api("shopping_toggle", { id: el.dataset.id, in_cart: el.checked }, { quiet: true });
  if (el.dataset.change === "photo") await onPhoto(el);
  render();
});

// --------------------------------------------------------------------- start
setTheme(store.get("mymatti-theme"));
const shared = new URLSearchParams(location.search).get("kode");
if (shared) { S.code = shared; store.set("mymatti-code", shared); history.replaceState(null, "", location.pathname); }
render();
if (S.code) api("get").then((r) => { render(); if (r) loadRecalls(); });
