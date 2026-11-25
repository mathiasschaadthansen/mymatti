// Ren regnelogik – ingen DOM. Bruges af content.js (og kan testes i Node).
//
// Margin (tysk Differenzbesteuerung §25a → dansk brugtmoms):
//   Buddet er den fulde pris. Ingen moms kan trækkes fra, og der lægges ingen
//   dansk moms oveni. Ved videresalg betales 25 % moms af avancen
//   (= 20 % af forskellen mellem salgspris og bilens købspris).
//
// Fuld moms (tysk Regelbesteuerung 19 %):
//   Buddet er inkl. 19 % tysk moms. Som dansk momsregistreret køber du netto
//   (EU-handel), og bilen sælges i Danmark med 25 % moms.
(function (root) {
  const DE_VAT = 0.19;
  const DK_VAT = 0.25;

  function calc(i) {
    const rate = i.rate;
    const delivery = (i.deliveryEur || 0) * rate; // netto, reverse charge
    const other = i.otherDkk || 0;
    const sale = i.saleDkk || 0;
    const profitTarget = i.profitDkk || 0;
    const bid = i.bidEur || 0;
    const o = { mode: i.mode, delivery, other };

    if (i.mode === "vat") {
      o.carNet = (bid / (1 + DE_VAT)) * rate;
      o.carInclDk = o.carNet * (1 + DK_VAT);
      o.cost = o.carNet + delivery + other; // ekskl. moms
      o.costInclDk = o.cost * (1 + DK_VAT);
      if (sale) {
        o.saleVat = sale - sale / (1 + DK_VAT);
        o.profit = sale / (1 + DK_VAT) - o.cost;
        const maxCarNet = sale / (1 + DK_VAT) - profitTarget - delivery - other;
        o.maxBid = (maxCarNet * (1 + DE_VAT)) / rate;
      }
    } else {
      o.car = bid * rate;
      o.cost = o.car + delivery + other;
      if (sale) {
        o.saleVat = Math.max(0, sale - o.car) * (DK_VAT / (1 + DK_VAT));
        o.profit = sale - o.car - o.saleVat - delivery - other;
        // sale - car - 0,2·(sale - car) - omk = avance  →  car = sale - (avance + omk)/0,8
        let maxCar = sale - (profitTarget + delivery + other) / (1 - DK_VAT / (1 + DK_VAT));
        if (maxCar > sale) maxCar = sale - profitTarget - delivery - other; // negativ avance: ingen brugtmoms
        o.maxBid = maxCar / rate;
      }
    }
    return o;
  }

  // "25.000", "25 000,50", "25000.5", "33.767 €" → tal
  function parseNum(s) {
    if (typeof s === "number") return s;
    s = String(s || "").replace(/[^\d.,-]/g, "");
    if (!s) return 0;
    if (s.includes(".") && s.includes(",")) {
      s = s.lastIndexOf(",") > s.lastIndexOf(".")
        ? s.replace(/\./g, "").replace(",", ".")
        : s.replace(/,/g, "");
    } else if (s.includes(",")) {
      s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
    } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, "");
    }
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  root.AampereCalc = { calc, parseNum };
  if (typeof module !== "undefined") module.exports = root.AampereCalc;
})(typeof globalThis !== "undefined" ? globalThis : this);
