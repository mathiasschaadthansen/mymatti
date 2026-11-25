// Ren regnelogik – ingen DOM. Bruges af content.js (og kan testes i Node).
//
// Buddet er inkl. 19 % tysk moms. Den tyske momsandel modregnes i den danske
// moms (25 % af nettoprisen), så der kun betales forskellen ("forskelsmoms"):
//   netto        = bud / 1,19
//   tysk moms    = bud - netto
//   dansk moms   = netto × 0,25
//   forskelsmoms = dansk moms - tysk moms
//   pris inkl. dansk moms = bud + forskelsmoms = netto × 1,25
(function (root) {
  const DE_VAT = 0.19;
  const DK_VAT = 0.25;

  function calc(i) {
    const rate = i.rate;
    const delivery = (i.deliveryEur || 0) * rate; // netto
    const other = i.otherDkk || 0; // ekskl. moms
    const sale = i.saleDkk || 0; // inkl. dansk moms
    const profitTarget = i.profitDkk || 0;

    const o = { delivery, other };
    o.bidDkk = (i.bidEur || 0) * rate;
    o.carNet = o.bidDkk / (1 + DE_VAT);
    o.deVat = o.bidDkk - o.carNet;
    o.dkVat = o.carNet * DK_VAT;
    o.diffVat = o.dkVat - o.deVat;
    o.carInclDk = o.carNet + o.dkVat;
    o.cost = o.carNet + delivery + other; // ekskl. moms
    o.costInclDk = o.cost * (1 + DK_VAT);
    if (sale) {
      const saleNet = sale / (1 + DK_VAT);
      o.profit = saleNet - o.cost;
      o.maxBid = ((saleNet - profitTarget - delivery - other) * (1 + DE_VAT)) / rate;
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
