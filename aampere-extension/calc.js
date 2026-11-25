// Ren regnelogik – ingen DOM. Bruges af content.js (og kan testes i Node).
//
// Buddet er inkl. 19 % tysk moms. Dansk moms er 25 % af hele buddet (brutto),
// og den tyske momsandel modregnes, så der betales forskellen ("forskelsmoms"):
//   tysk moms    = bud × 19/119
//   dansk moms   = bud × 0,25
//   forskelsmoms = dansk moms - tysk moms
//   bil inkl. dansk moms = bud + forskelsmoms
// Bilen er momsdød (købt af privat) og kan ikke sælges ekskl. moms, så ved
// videresalg regnes brugtmoms: 20 % af (salgspris - bil inkl. dansk moms).
(function (root) {
  const DE_SHARE = 0.19 / 1.19; // tysk momsandel af bruttoprisen
  const DK_VAT = 0.25;
  const FACTOR = 1 + DK_VAT - DE_SHARE; // bud → bil inkl. dansk moms
  const MARGIN_VAT = DK_VAT / (1 + DK_VAT); // brugtmoms: 20 % af differencen

  function calc(i) {
    const rate = i.rate;
    const delivery = (i.deliveryEur || 0) * rate; // netto
    const other = i.otherDkk || 0;
    const sale = i.saleDkk || 0;
    const profitTarget = i.profitDkk || 0;

    const o = { delivery, other };
    o.bidDkk = (i.bidEur || 0) * rate;
    o.deVat = o.bidDkk * DE_SHARE;
    o.dkVat = o.bidDkk * DK_VAT;
    o.diffVat = o.dkVat - o.deVat;
    o.car = o.bidDkk + o.diffVat;
    o.cost = o.car + delivery + other;
    if (sale) {
      o.saleVat = Math.max(0, sale - o.car) * MARGIN_VAT;
      o.profit = sale - o.car - o.saleVat - delivery - other;
      let maxCar = sale - (profitTarget + delivery + other) / (1 - MARGIN_VAT);
      if (maxCar > sale) maxCar = sale - profitTarget - delivery - other; // tab: ingen brugtmoms
      o.maxBid = maxCar / FACTOR / rate;
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
