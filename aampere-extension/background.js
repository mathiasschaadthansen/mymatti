// Henter dagens EUR/DKK-kurs (ECB via frankfurter.dev). Ligger i baggrunden,
// så Aamperes egen side (CORS/CSP) ikke kan blokere kaldet.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "getRate") return;
  fetch("https://api.frankfurter.dev/v1/latest?base=EUR&symbols=DKK")
    .then((r) => r.json())
    .then((d) => sendResponse({ rate: d?.rates?.DKK, date: d?.date }))
    .catch(() => sendResponse({}));
  return true; // asynkront svar
});
