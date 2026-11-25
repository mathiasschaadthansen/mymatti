(() => {
  if (window.__aampereDkk) return;
  window.__aampereDkk = true;

  const { calc, parseNum } = globalThis.AampereCalc;
  const FALLBACK_RATE = 7.46;

  const state = {
    bidEur: 0,
    rate: FALLBACK_RATE,
    rateDate: null,
    rateManual: false,
    deliveryEur: 600,
    deliveryManual: false,
    otherDkk: 0,
    saleDkk: 0,
    profitDkk: 0,
    collapsed: false,
  };
  const PERSIST = ["rate", "rateDate", "rateManual", "otherDkk", "profitDkk", "collapsed"];

  // ---------- UI ----------
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
<style>
  :host { all: initial; }
  * { box-sizing: border-box; font-family: Inter, system-ui, -apple-system, "Segoe UI", sans-serif; }
  .box { width: 300px; background: #fff; color: #111827; border-radius: 12px; font-size: 13px;
         box-shadow: 0 8px 30px rgba(0,0,0,.22); border: 1px solid #e5e7eb; overflow: hidden; }
  header { display: flex; justify-content: space-between; align-items: center; cursor: pointer;
           background: #3dbf95; color: #fff; padding: 8px 12px; font-weight: 600; user-select: none; }
  header span.sum { font-variant-numeric: tabular-nums; }
  .body { padding: 10px 12px 12px; }
  .collapsed .body { display: none; }
  .row { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin: 5px 0; }
  .row label { color: #4b5563; flex: 1; }
  input { width: 110px; padding: 4px 6px; border: 1px solid #d1d5db; border-radius: 6px;
          font-size: 13px; text-align: right; font-variant-numeric: tabular-nums; color: #111827; background: #fff; }
  input:focus { outline: 2px solid #3dbf95; outline-offset: -1px; }
  hr { border: 0; border-top: 1px solid #e5e7eb; margin: 9px 0; }
  .out { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .total { font-weight: 700; font-size: 15px; }
  .total label { color: #111827; }
  .pos { color: #047857; } .neg { color: #b91c1c; }
  .hint { color: #6b7280; font-size: 11px; margin-top: 2px; line-height: 1.35; }
  .max { background: #ecfdf5; border-radius: 8px; padding: 6px 8px; margin-top: 6px; font-weight: 600; }
</style>
<div class="box">
  <header><span>Bud → DKK</span><span class="sum" id="sum"></span></header>
  <div class="body">
    <div class="row"><label>Bud (€)</label><input id="bidEur" inputmode="decimal" placeholder="fra siden"></div>
    <div class="row"><label>Kurs EUR/DKK</label><input id="rate" inputmode="decimal"></div>
    <div class="row"><label>Levering (€ netto)</label><input id="deliveryEur" inputmode="decimal"></div>
    <div class="row"><label>Øvrige omk. (kr ekskl. moms)</label><input id="otherDkk" inputmode="decimal" placeholder="0"></div>
    <div class="hint" id="rateHint"></div>
    <hr>
    <div id="result"></div>
    <hr>
    <div class="row"><label>Salgspris inkl. moms (kr)</label><input id="saleDkk" inputmode="decimal" placeholder="valgfri"></div>
    <div class="row"><label>Ønsket avance (kr ekskl. moms)</label><input id="profitDkk" inputmode="decimal" placeholder="0"></div>
    <div id="saleResult"></div>
  </div>
</div>`;
  const $ = (id) => root.getElementById(id);
  const box = root.querySelector(".box");

  const kr = (n) => Math.round(n).toLocaleString("da-DK") + " kr";
  const eur = (n) => Math.round(n).toLocaleString("da-DK") + " €";
  const line = (label, value, cls = "") =>
    `<div class="row ${cls}"><label>${label}</label><span class="out">${value}</span></div>`;

  function render() {
    box.classList.toggle("collapsed", state.collapsed);
    $("rateHint").textContent = state.rateManual
      ? "Kurs sat manuelt."
      : state.rateDate ? `ECB-kurs ${state.rateDate}.` : "Standardkurs – kunne ikke hente dagens.";

    const o = calc(state);
    let html = "";
    if (!state.bidEur) {
      html = `<div class="hint">Skriv et bud i feltet på siden – eller her.</div>`;
      $("sum").textContent = "";
    } else {
      html += line("Bud inkl. tysk moms", kr(o.bidDkk));
      html += line("Heraf tysk moms (19 %)", kr(o.deVat));
      html += line("Dansk moms (25 % af netto)", kr(o.dkVat));
      html += line("Forskelsmoms at betale", kr(o.diffVat));
      html += line("Bil inkl. dansk moms", kr(o.carInclDk), "total");
      html += line("Bil ekskl. moms", kr(o.carNet));
      html += line("Levering ekskl. moms", kr(o.delivery));
      if (o.other) html += line("Øvrige omk.", kr(o.other));
      html += line("Kostpris i alt inkl. moms", kr(o.costInclDk));
      $("sum").textContent = kr(o.carInclDk);
    }
    $("result").innerHTML = html;

    let s = "";
    if (state.saleDkk) {
      if (state.bidEur) s += line("Avance ekskl. moms", kr(o.profit), o.profit >= 0 ? "pos" : "neg");
      s += `<div class="row max"><label>Maks bud</label><span class="out">${o.maxBid > 0 ? eur(Math.floor(o.maxBid)) : "–"}</span></div>`;
    }
    $("saleResult").innerHTML = s;
  }

  function setInput(id, value) {
    const el = $(id);
    if (root.activeElement === el) return; // forstyr ikke mens der tastes
    el.value = value ? String(value).replace(".", ",") : "";
  }

  function save() {
    const data = {};
    PERSIST.forEach((k) => (data[k] = state[k]));
    try { chrome.storage?.local.set({ aampereDkk: data }); } catch {}
  }

  ["bidEur", "rate", "deliveryEur", "otherDkk", "saleDkk", "profitDkk"].forEach((id) => {
    $(id).addEventListener("input", (e) => {
      state[id] = parseNum(e.target.value);
      if (id === "rate") { state.rateManual = state.rate > 0; if (!state.rate) state.rate = FALLBACK_RATE; }
      if (id === "deliveryEur") state.deliveryManual = true;
      save();
      render();
    });
    // Aamperes egne tastaturgenveje skal ikke fange vores indtastning
    ["keydown", "keyup", "keypress"].forEach((t) => $(id).addEventListener(t, (e) => e.stopPropagation()));
  });
  root.querySelector("header").addEventListener("click", () => {
    state.collapsed = !state.collapsed; save(); render();
  });

  // ---------- Læs Aamperes side ----------
  const BID_HINT = /vat|mwst|moms|ust|bid|gebot|bud/i;

  function isBidInput(el) {
    if (!(el instanceof HTMLInputElement) || host.contains(el)) return false;
    const hay = `${el.placeholder} ${el.name} ${el.id} ${el.getAttribute("aria-label") || ""}`;
    if (BID_HINT.test(hay)) return true;
    // Feltet i budboksen: tjek teksten omkring det
    const ctx = el.closest("form, section, div")?.parentElement?.innerText || "";
    return /my bid|mein gebot|place binding bid/i.test(ctx.slice(0, 600));
  }

  function onPageInput(e) {
    if (!isBidInput(e.target)) return;
    state.bidEur = parseNum(e.target.value);
    setInput("bidEur", state.bidEur);
    render();
  }
  document.addEventListener("input", onPageInput, true);
  document.addEventListener("change", onPageInput, true);

  function scanPage() {
    const text = document.body?.innerText || "";
    if (!state.deliveryManual) {
      const m = text.match(/(?:delivery|lieferung)[^\n€]*\n?\s*([\d.,]+)\s*€/i);
      if (m && parseNum(m[1]) > 0) state.deliveryEur = parseNum(m[1]);
    }
    const bidEl = [...document.querySelectorAll("input")].find(isBidInput);
    if (bidEl && root.activeElement !== $("bidEur")) {
      const v = parseNum(bidEl.value);
      if (v || document.activeElement === bidEl) state.bidEur = v;
    }
    setInput("bidEur", state.bidEur);
    setInput("deliveryEur", state.deliveryEur);
    render();
  }

  // Aampere er en SPA: scan igen når siden ændrer sig (ny bil = nulstil manuelle valg)
  let timer, lastUrl = location.href;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        Object.assign(state, { bidEur: 0, saleDkk: 0, deliveryManual: false });
        setInput("saleDkk", 0);
      }
      scanPage();
    }, 400);
  }).observe(document.documentElement, { childList: true, subtree: true });

  // ---------- Start ----------
  function fetchRate() {
    try {
      chrome.runtime.sendMessage({ type: "getRate" }, (res) => {
        if (chrome.runtime.lastError || !res?.rate || state.rateManual) return;
        state.rate = res.rate;
        state.rateDate = res.date;
        setInput("rate", state.rate);
        save();
        render();
      });
    } catch {}
  }

  function start(saved) {
    Object.assign(state, saved || {});
    if (!(state.rate > 0)) state.rate = FALLBACK_RATE;
    document.documentElement.appendChild(host);
    setInput("rate", state.rate);
    setInput("otherDkk", state.otherDkk);
    setInput("profitDkk", state.profitDkk);
    scanPage();
    fetchRate();
  }

  try {
    chrome.storage.local.get("aampereDkk", (d) => start(d?.aampereDkk));
  } catch {
    start();
  }
})();
