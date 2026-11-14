// GENERERET af scripts/gen_allergens.py ud fra mymatti/core.py – ret ikke i hånden.
export const ALLERGENS: Record<string, { label: string; pattern: string; ignore?: string; free?: string }> = {
 "gluten": {
  "label": "Gluten (hvede, rug, byg, havre)",
  "pattern": "hvede|(?<![\\p{L}\\p{N}_])rug(?![\\p{L}\\p{N}_])|rug(?:brød|mel|kerner)|(?<![\\p{L}\\p{N}_])byg(?![\\p{L}\\p{N}_])|byg(?:mel|gryn)|perlebyg|havre|spelt|kamut|(?<![\\p{L}\\p{N}_])mel(?![\\p{L}\\p{N}_])|[\\p{L}\\p{N}_]+mel(?![\\p{L}\\p{N}_])|pasta|spaghetti|penne|fusilli|lasagne|tagliatelle|makaroni|nudler|brød|(?<![\\p{L}\\p{N}_])boller?(?![\\p{L}\\p{N}_])|[\\p{L}\\p{N}_]+boller?(?![\\p{L}\\p{N}_])|rasp|panko|bulgur|couscous|semulje|mannagryn|durum|kiks|tortilla|(?<![\\p{L}\\p{N}_])wraps?(?![\\p{L}\\p{N}_])|[\\p{L}\\p{N}_]*dej(?![\\p{L}\\p{N}_])|(?<![\\p{L}\\p{N}_])øl(?![\\p{L}\\p{N}_])|sojasauce|soya|seitan|crouton|müsli|mysli",
  "ignore": "boghvede[\\p{L}\\p{N}_]*|(?:majs|ris|mandel|kartoffel|kokos|kikærte|johannesbrødkerne)mel(?![\\p{L}\\p{N}_])|karamel[\\p{L}\\p{N}_]*|kødboller?|fiskeboller?|risnudler|glasnudler",
  "free": "glutenfri"
 },
 "krebsdyr": {
  "label": "Krebsdyr (rejer, krabbe, hummer)",
  "pattern": "reje|krabbe|hummer|krebs|languster|scampi|surimi"
 },
 "aeg": {
  "label": "Æg",
  "pattern": "(?<![\\p{L}\\p{N}_])æg(?![\\p{L}\\p{N}_])|(?<![\\p{L}\\p{N}_])ægge(?!plante)[\\p{L}\\p{N}_]*|(?<![\\p{L}\\p{N}_])[\\p{L}\\p{N}_]*(?:spejl|hønse|vagtel|skrabe|frilands|pasta)æg(?![\\p{L}\\p{N}_])|røræg|mayonnaise|(?<![\\p{L}\\p{N}_])mayo(?![\\p{L}\\p{N}_])|aioli|bearnaise|hollandaise|marengs|remoulade|omelet|frisk pasta",
  "free": "vegansk|plantebaseret|ægfri"
 },
 "fisk": {
  "label": "Fisk",
  "pattern": "fisk|laks|torsk|(?<![\\p{L}\\p{N}_])tun(?![\\p{L}\\p{N}_])|sild|makrel|ansjos|rødspætte|(?<![\\p{L}\\p{N}_])sej(?![\\p{L}\\p{N}_])|kuller|ørred|kaviar|rogn|worcestershire|sardin|pangasius|kulmule|(?<![\\p{L}\\p{N}_])ål(?![\\p{L}\\p{N}_])",
  "ignore": "blæksprutte[\\p{L}\\p{N}_]*"
 },
 "jordnoedder": {
  "label": "Jordnødder (peanuts)",
  "pattern": "jordnød|peanut|satay"
 },
 "soja": {
  "label": "Soja",
  "pattern": "soja|soya|tofu|edamame|miso|tempeh"
 },
 "maelk": {
  "label": "Mælk (inkl. laktose)",
  "pattern": "[\\p{L}\\p{N}_]*mælk[\\p{L}\\p{N}_]*|[\\p{L}\\p{N}_]*fløde[\\p{L}\\p{N}_]*|(?<![\\p{L}\\p{N}_])[\\p{L}\\p{N}_]*smør(?![\\p{L}\\p{N}_])|(?<![\\p{L}\\p{N}_])smør(?!e)[\\p{L}\\p{N}_]*|(?<![\\p{L}\\p{N}_])[\\p{L}\\p{N}_]*ost(?![\\p{L}\\p{N}_])|(?<![\\p{L}\\p{N}_])oste[\\p{L}\\p{N}_]*|yoghurt|skyr|cr[eè]me ?fra[iî]che|parmesan|mozzarella|feta|mascarpone|ricotta|kvark|(?<![\\p{L}\\p{N}_])valle|ymer|cheddar|(?<![\\p{L}\\p{N}_])ghee(?![\\p{L}\\p{N}_])|kasein|laktose|halloumi|burrata|gorgonzola|(?<![\\p{L}\\p{N}_])brie(?![\\p{L}\\p{N}_])|emmentaler|(?<![\\p{L}\\p{N}_])is(?![\\p{L}\\p{N}_])|bechamel|a38|(?<![\\p{L}\\p{N}_])kærne",
  "ignore": "(?:kokos|havre|soja|ris|mandel|plante|ærte)(?:mælk|fløde|drik)[\\p{L}\\p{N}_]*|(?:jordnødde|mandel|nødde|kakao|peanut|plante)smør|peanutbutter|(?<![\\p{L}\\p{N}_])(?:toast|frost|kost|post|kompost|most|æblemost)(?![\\p{L}\\p{N}_])",
  "free": "vegansk|plantebaseret|mælkefri"
 },
 "noedder": {
  "label": "Nødder (mandler, hasselnødder, valnødder m.fl.)",
  "pattern": "(?<![\\p{L}\\p{N}_])nød|[\\p{L}\\p{N}_]+nød|mandel|mandler|cashew|pekan|pecan|pistacie|macadamia|marcipan|nougat|pesto|nutella|praline",
  "ignore": "jordnød[\\p{L}\\p{N}_]*|kokosnød[\\p{L}\\p{N}_]*|muskatnød[\\p{L}\\p{N}_]*|nødvendig[\\p{L}\\p{N}_]*"
 },
 "selleri": {
  "label": "Selleri",
  "pattern": "selleri"
 },
 "sennep": {
  "label": "Sennep",
  "pattern": "sennep|dijon"
 },
 "sesam": {
  "label": "Sesam",
  "pattern": "sesam|tahin|hummus"
 },
 "sulfitter": {
  "label": "Svovldioxid og sulfitter",
  "pattern": "sulfit|(?<![\\p{L}\\p{N}_])(?:hvid|rød|rosé|mad)?vin(?![\\p{L}\\p{N}_])|rosin|tørrede? abrikos"
 },
 "lupin": {
  "label": "Lupin",
  "pattern": "lupin"
 },
 "bloeddyr": {
  "label": "Bløddyr (muslinger, blæksprutte)",
  "pattern": "musling|blæksprutte|østers|snegle|calamari"
 }
};

export const FREE_TEXT_ALIASES: Record<string, string[]> = {
 "okse": [
  "okse",
  "bøf",
  "kalv",
  "roastbeef",
  "entrecote",
  "culotte",
  "pastrami",
  "bresaola"
 ],
 "græskar": [
  "græskar",
  "hokkaido",
  "butternut"
 ],
 "svin": [
  "svin",
  "gris",
  "bacon",
  "skinke",
  "flæsk",
  "medister",
  "pølse",
  "spegepølse",
  "leverpostej"
 ],
 "kylling": [
  "kylling",
  "høns",
  "hane"
 ]
};
