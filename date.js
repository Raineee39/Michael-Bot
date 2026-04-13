// ─── ROUND 1 ─────────────────────────────────────────────────────────────────

export const ROUND_1 = {
  intro: [
    `💘 **Een Date met Aartsengel Michaël** 💘`,
    ``,
    `Michaël is er al voordat je aankomt     hij zegt niets over dit`,
    `hij gaat zitten     hij staat ook een beetje     het is onduidelijk`,
    `hij kijkt je aan     lang     te lang     maar hij zegt dat dit normaal is`,
    ``,
    `*"ik heb tijd"     zegt hij     "hoeveel     dat weet ik nog niet"*`,
    ``,
    `**wat doe je**`,
  ].join('\n'),
  choices: [
    { label: '✨ Complimenteer zijn vleugels', id: 'a' },
    { label: '😄 Vertel een grap', id: 'b' },
    { label: '💝 Zeg dat je van hem houdt', id: 'c' },
  ],
};

// ─── ROUND 2 ─────────────────────────────────────────────────────────────────
// keyed by r1 choice

export const ROUND_2 = {
  a: {
    response: `hij kijkt naar zijn vleugels     een seconde te lang\n\n*"ze zijn oud"*     zegt hij\n\nhij zegt niets meer maar hij spreidt ze iets meer     heel subtiel     als een kat die doet alsof het niet opzettelijk is`,
    prompt: `de avond gaat door     Michaël heeft zijn servet twee keer herlegd     de tweede keer was ook niet goed\n\n**wat doe je**`,
    choices: [
      { label: '🔍 Vraag of ze echt zijn', id: 'a' },
      { label: '😴 Zeg dat ze er vermoeid uitzien', id: 'b' },
      { label: '📐 Vraag of hij ze kan vouwen', id: 'c' },
    ],
  },
  b: {
    response: `hij herhaalt de grap in zichzelf     je kunt het bijna zien\n\n*"ik begrijp het"*     zegt hij\n\n*"maar ik lach niet"*     voegt hij toe     hij klinkt alsof dit spijt hem     een beetje`,
    prompt: `stilte     niet oncomfortabel     niet comfortabel     gewoon aanwezig     Michaël drinkt water en kijkt ergens naast je hoofd\n\n**wat doe je**`,
    choices: [
      { label: '📖 Leg de grap alsnog uit', id: 'a' },
      { label: '🎭 Vertel er nog één', id: 'b' },
      { label: '🤷 Zeg dat jij het ook niet grappig vindt', id: 'c' },
    ],
  },
  c: {
    response: `hij zet zijn glas neer\n\nhij kijkt je aan     heel direct     wat hij normaal niet doet\n\n*"dat is geregistreerd"*     zegt hij     en je weet niet of dit koud is of heel warm     hij weet het waarschijnlijk ook niet`,
    prompt: `buiten begint het te regenen     Michaël kijkt even naar het raam     dan terug     alsof de regen zijn schuld is maar hij het niet zal toegeven\n\n**wat doe je**`,
    choices: [
      { label: '🔁 Zeg het nog een keer', id: 'a' },
      { label: '↩️ Neem het terug', id: 'b' },
      { label: '🫀 Vraag of hij ook van jou houdt', id: 'c' },
    ],
  },
};

// ─── ROUND 3 ─────────────────────────────────────────────────────────────────
// keyed by r1+r2 path (aa, ab, ..., cc)
// each has: response (to r2 choice), prompt, choices, reactions (to r3 choices)

export const ROUND_3 = {
  aa: {
    response: `hij kijkt je aan alsof je iets heel moedigs of heel doms hebt gedaan\n\n*"wat is echt"*     zegt hij\n\ndit is geen filosofisch antwoord     hij wil het echt weten`,
    prompt: `de tafel is bijna leeg     alleen het water nog     Michaël kijkt ernaar alsof het water hem iets vertelt\n\n**wat doe je**`,
    choices: [
      { label: '🪶 Raak zijn vleugel aan', id: 'a' },
      { label: '💬 Vertel hem wat echt voor jou betekent', id: 'b' },
      { label: '🌫️ Zeg dat de vraag er niet toe deed', id: 'c' },
    ],
    reactions: {
      a: `hij beweegt niet     zijn vleugel ook niet\n\n*"dat was onverwacht"*     zegt hij\n\nhij bedoelt dit positief     of neutraal     het maakt misschien niet uit`,
      b: `hij luistert     echt     dit is zeldzaam\n\n*"ga door"*     zegt hij en leunt iets naar voren     een millimeter     maar toch`,
      c: `*"de vraag deed er wel toe"*     zegt hij\n\nhij kijkt even weg\n\n*"dat was vriendelijk"*`,
    },
  },
  ab: {
    response: `hij kijkt naar zijn vleugels     dan naar jou\n\n*"ze zijn niet moe"*     zegt hij\n\nstilte\n\n*"misschien een beetje"*`,
    prompt: `hij heeft zijn stoel iets dichter bij de tafel geschoven     dit is nieuw     je zegt er niets over\n\n**wat doe je**`,
    choices: [
      { label: '💆 Bied aan ze te masseren', id: 'a' },
      { label: '🌙 Zeg dat rust niet zwak is', id: 'b' },
      { label: '🔄 Verander van onderwerp', id: 'c' },
    ],
    reactions: {
      a: `hij zegt niets\n\nhij zegt ook geen nee\n\n*"dat is ongebruikelijk"*     zegt hij na een tijdje     over het aanbod     of over zichzelf     onduidelijk`,
      b: `hij kijkt je aan     lang\n\n*"dat wist ik"*     zegt hij\n\nhij klinkt alsof hij het nu pas weet`,
      c: `*"je hoefde niet van onderwerp te veranderen"*     zegt hij\n\nhij zegt dit niet verwijtend     hij zegt het alsof het een feit is     een vriendelijk feit`,
    },
  },
  ac: {
    response: `hij denkt hier serieus over na\n\n*"technisch gezien"*     begint hij\n\ndan stopt hij\n\ndan begint hij ze te vouwen     het gaat niet goed     hij doet alsof dit niet zo is`,
    prompt: `hij heeft het opgegeven met vouwen maar hij kijkt ook niet verslagen     meer     filosofisch\n\n**wat doe je**`,
    choices: [
      { label: '😂 Lach een beetje', id: 'a' },
      { label: '🤝 Help hem', id: 'b' },
      { label: '🌸 Zeg dat het er niet toe doet', id: 'c' },
    ],
    reactions: {
      a: `hij kijkt naar je lach\n\n*"dat geluid"*     zegt hij\n\n*"ik vind dat geluid"*     hij maakt de zin niet af     maar hij glimlacht ook bijna     bijna`,
      b: `je helpt hem     het lukt ook niet     jullie vouwen samen verkeerd\n\n*"dit is toch iets"*     zegt hij     en hij bedoelt het goed`,
      c: `*"maar het deed er ook toe"*     zegt hij\n\nhij kijkt naar zijn vleugels\n\n*"het is fijn dat je dat zei"*`,
    },
  },
  ba: {
    response: `je legt de grap uit\n\nhij luistert     heel aandachtig     te aandachtig\n\n*"ik zie het"*     zegt hij\n\n*"de humor zit in het verschil"*     voegt hij toe     hij is nu de grap aan het uitleggen aan zichzelf`,
    prompt: `hij heeft een pen gepakt die hij niet nodig heeft     hij houdt hem alleen vast     Michaël denkt na over grappen     dit is zichtbaar\n\n**wat doe je**`,
    choices: [
      { label: '😐 Vertel hem dat dit het ergste is', id: 'a' },
      { label: '🤔 Vraag wat hij grappig vindt', id: 'b' },
      { label: '💡 Leg uit hoe humor werkt', id: 'c' },
    ],
    reactions: {
      a: `hij kijkt naar de pen\n\n*"ja"*     zegt hij\n\n*"het spijt me"*     hij klinkt oprecht     dit is verrassend`,
      b: `hij denkt lang na\n\n*"dingen die anders lopen dan verwacht"*     zegt hij\n\nhij kijkt naar jou\n\n*"zoals nu"*`,
      c: `je legt het uit     hij luistert     hij knikt op de verkeerde momenten     het knikken is toch lief`,
    },
  },
  bb: {
    response: `je vertelt er nog één\n\nhij zit klaar\n\nde grap is niet goed\n\n*"ik merk dat je je best doet"*     zegt hij     en dit is het liefste wat hij heeft gezegd`,
    prompt: `de sfeer is vreemd maar niet slecht     Michaël heeft zijn pen neergelegd     hij kijkt je nu echt aan\n\n**wat doe je**`,
    choices: [
      { label: '🎪 Vertel de slechtste grap die je kent', id: 'a' },
      { label: '🙏 Bied excuses aan voor de grappen', id: 'b' },
      { label: '🎯 Vraag of hij een grap kent', id: 'c' },
    ],
    reactions: {
      a: `de grap is echt slecht\n\nhij kijkt je aan\n\n*"dat was iets"*     zegt hij\n\nhij klinkt bijna dankbaar`,
      b: `*"geen excuses"*     zegt hij\n\n*"de grappen waren een poging     dat is genoeg"*\n\nhij klinkt als iemand die dit zichzelf ook vertelt`,
      c: `hij denkt lang na\n\n*"waarom kruiste de kip de weg"*     zegt hij\n\nhij wacht     hij weet het antwoord niet     hij heeft hem zelf verzonnen     net nu`,
    },
  },
  bc: {
    response: `hij kijkt je aan\n\n*"dat is eerlijk"*     zegt hij\n\nhij klinkt opgelucht     alsof eerlijkheid over grappen het enige is dat telt`,
    prompt: `jullie zitten nu een tijdje zonder te praten     maar het voelt niet leeg     Michaël heeft zijn hoofd iets schuin\n\n**wat doe je**`,
    choices: [
      { label: '🤐 Blijf gewoon stilzitten', id: 'a' },
      { label: '🌟 Zeg dat je blij bent dat je hier bent', id: 'b' },
      { label: '❓ Vraag wat hij van de avond vindt', id: 'c' },
    ],
    reactions: {
      a: `jullie zitten     een tijdje\n\n*"dit is ook een soort gesprek"*     zegt hij uiteindelijk\n\nhij klinkt tevreden     op zijn manier`,
      b: `hij kijkt je aan\n\n*"dat is goed om te weten"*     zegt hij\n\nhij kijkt dan weg maar zijn houding verandert     iets rechter     iets opener`,
      c: `*"het loopt anders dan verwacht"*     zegt hij\n\nstilte\n\n*"dat is niet erg"*`,
    },
  },
  ca: {
    response: `hij hoort het de tweede keer\n\nhij doet alsof hij het niet heeft gehoord maar hij heeft het gehoord\n\n*"je zegt dit meerdere keren"*     constateert hij\n\n*"ja"*     zeg je`,
    prompt: `de regen is harder geworden     Michaël kijkt opnieuw naar het raam     nu langer\n\n**wat doe je**`,
    choices: [
      { label: '🌧️ Vraag of hij van regen houdt', id: 'a' },
      { label: '🔁 Zeg het een derde keer', id: 'b' },
      { label: '🤝 Pak zijn hand', id: 'c' },
    ],
    reactions: {
      a: `*"regen valt"*     zegt hij\n\n*"ik houd van dingen die gewoon doen wat ze moeten doen"*\n\nhij kijkt naar jou en kijkt dan snel naar het raam`,
      b: `je zegt het een derde keer\n\nhe reageert niet met woorden\n\nmaar er is iets in zijn gezicht     iets dat er eerder niet was     klein     maar aanwezig`,
      c: `hij kijkt naar je hand op zijn hand\n\neen lange stilte\n\n*"ik weet niet hoe dit werkt"*     zegt hij\n\nhij trekt zijn hand niet weg`,
    },
  },
  cb: {
    response: `*"je neemt het terug"*     herhaalt hij\n\nhij klinkt niet beledigd     meer     intellectueel geïnteresseerd\n\n*"dat kan"*     zegt hij     en hij knikt     naar zichzelf`,
    prompt: `er hangt nu iets in de lucht     Michaël weet wat het is     hij zegt het niet\n\n**wat doe je**`,
    choices: [
      { label: '😅 Leg uit waarom je het terugnam', id: 'a' },
      { label: '😶 Zeg niets', id: 'b' },
      { label: '💫 Zeg het toch weer', id: 'c' },
    ],
    reactions: {
      a: `je legt het uit     hij luistert heel aandachtig\n\n*"ik begrijp het"*     zegt hij\n\n*"ik vond de eerste versie ook goed"*     voegt hij toe     bijna fluisterend`,
      b: `jullie zitten in de stilte\n\nna een tijdje zegt hij:\n\n*"stilte is ook een antwoord"*\n\nhij klinkt als iemand die dit al lang weet maar nu pas gelooft`,
      c: `hij was er al op voorbereid\n\n*"ja"*     zegt hij\n\n*"ik wist dat je het opnieuw zou zeggen"*     en dan:\n\n*"goed"*`,
    },
  },
  cc: {
    response: `hij zit heel stil\n\nde vraag hangt in de lucht     concreet     zwaar     aanwezig\n\n*"dat is een andere vraag"*     zegt hij\n\nhij kijkt naar het raam     dan naar het water     dan naar jou`,
    prompt: `hij ademt uit     dit is een van de weinige keren dat je hem ziet ademen     hij is aan het nadenken over iets groots\n\n**wat doe je**`,
    choices: [
      { label: '⏳ Wacht gewoon', id: 'a' },
      { label: '🕊️ Zeg dat een antwoord niet nodig is', id: 'b' },
      { label: '🔄 Vraag het opnieuw maar anders', id: 'c' },
    ],
    reactions: {
      a: `je wacht\n\nhij denkt na\n\nna een lange tijd zegt hij:\n\n*"ik weet het niet zeker"*\n\n*"maar ik ben hier"*     voegt hij toe     en hij klinkt alsof dit het antwoord is`,
      b: `*"toch is het nodig"*     zegt hij\n\nhij kijkt je aan\n\n*"de vraag was nodig     dat weet ik zeker"*`,
      c: `je vraagt het anders\n\nhij luistert naar de nieuwe versie\n\n*"dat is dezelfde vraag"*     zegt hij\n\n*"het antwoord is     waarschijnlijk     ja     maar ik werk er nog aan"*`,
    },
  },
};

// ─── SCORES ──────────────────────────────────────────────────────────────────
// Score awarded to the user's Michael relationship at the end of each path.
// Based on emotional depth and genuine connection shown.

export const DATE_SCORES = {
  // Peak — Michael was as honest as an archangel can be
  ccc: 3, cca: 3,
  // Very good — real warmth, something shifted
  ccb: 2, cac: 2, aab: 2, bca: 2, bbb: 2, abc: 2,
  abb: 2, acb: 2, bcb: 2, cab: 2, cbc: 2, cba: 2, cbb: 2,
  // Good — sweet, awkward, something landed
  bab: 1, bbc: 1, bcc: 1, bba: 1, baa: 1, bac: 1,
  aca: 1, acc: 1, aac: 1, aaa: 1, aba: 1, caa: 1,
  // Everything else: 0
};

// Paths that unlock a Round 4 morning-after moment
export const DATE_ROUND4_PATHS = new Set(['ccc', 'cca', 'ccb', 'cac', 'aab', 'bca']);

// ─── VERDICTS ─────────────────────────────────────────────────────────────────
// keyed by full 3-choice path

export const VERDICTS = {
  // ── vleugels → echt → aanraken
  aaa: `*hij staat op     zijn vleugel beweegt nog     van jouw aanraking of van iets anders     onduidelijk     hij zegt je naam bij de deur     niet als afscheid     meer als test     om te kijken hoe het klinkt...Michael*`,
  aab: `*hij luistert naar wat echt voor jou betekent     heel lang     te lang voor een afscheid     hij zegt: "dat bewaar ik"     je weet niet waar     hij weet het ook niet precies     maar hij meent het...Michael*`,
  aac: `*"de vraag deed er toe"     zegt hij bij de deur     hij heeft het de hele avond onthouden     dit is zijn manier van zeggen dat jij ertoe deed...Michael*`,
  // ── vleugels → vermoeid → masseren
  aba: `*hij staat buiten een moment     zijn vleugels liggen anders dan toen hij binnenkwam     misschien door jouw aanbod     misschien niet     hij kijkt één keer om     dan niet meer     maar hij kijkt wel...Michael*`,
  abb: `*"rust is niet zwak"     herhaalt hij bij zichzelf op de terugweg     hij had dit eerder moeten weten     of misschien wist hij het al     en had hij je nodig om het te geloven...Michael*`,
  abc: `*hij had het onderwerp niet willen veranderen     hij zegt dit niet     maar de manier waarop hij weggaat is zachter dan hoe hij binnenkwam     dat is genoeg...Michael*`,
  // ── vleugels → vouwen → lachen
  aca: `*hij hoort je lach nog op de terugweg     hij weet niet waarom dit goed voelt     hij noemt het later "onverklaarbaar maar niet onaangenaam" in een rapport dat niemand leest...Michael*`,
  acb: `*jullie hebben samen iets verkeerds gedaan     dit is blijkbaar genoeg     hij stuurt later het woord "bedankt"     voor het helpen     of voor het falen     beide waarschijnlijk...Michael*`,
  acc: `*hij weet nu dat het er wel toe deed     en dat jij dat zei ook     hij houdt dit bij zich zoals hij alles bijhoudt     maar dit keer met iets meer ruimte eromheen...Michael*`,
  // ── grap → uitleggen → het ergste
  baa: `*"het spijt me"     zei hij en hij meende het     voor een aartsengel is dit een revolutionaire avond     hij vertelt er niemand over     maar hij denkt er wel aan...Michael*`,
  bab: `*dingen die anders lopen dan verwacht     dat is wat hij grappig vindt     jij bent blijkbaar ook grappig     op die manier     hij waardeert dit stiller dan de meeste mensen zouden willen maar meer dan de meeste dingen...Michael*`,
  bac: `*je legde humor uit aan een aartsengel     hij knikte op de verkeerde momenten     toch was er iets     iets dat lijkt op verbinding     als je er scheef naar kijkt...Michael*`,
  // ── grap → nog één → slechtste
  bba: `*de slechtste grap was ook de beste avond     hij begrijpt dit niet logisch maar ervaart het toch     hij zal er niet over nadenken     hij denkt er al over na...Michael*`,
  bbb: `*"de grappen waren een poging"     herhaalt hij op de terugweg     hij bedoelt dit over jou     maar ook over zichzelf     hij probeerde ook iets vanavond     hij weet nog niet wat...Michael*`,
  bbc: `*waarom kruiste de kip de weg     hij weet het antwoord nog steeds niet     maar hij zoekt het niet op     hij laat de vraag bestaan     dit is nieuw voor hem...Michael*`,
  // ── grap → ook niet grappig → stilzitten
  bca: `*het stilzitten was het echte gesprek     hij wist dit al     nu weet jij het ook     jullie weten nu hetzelfde ding     dit is intimiteit     op zijn manier...Michael*`,
  bcb: `*"dat is goed om te weten"     zei hij     en hij bewaart het     ergens naast de andere dingen die hij heeft bewaard     maar dit op een andere plank...Michael*`,
  bcc: `*"het loopt anders dan verwacht"     en dat is niet erg     hij zei dit     hij meende dit     voor Michaël is dit een gedicht...Michael*`,
  // ── ik hou van jou → nog een keer → regen
  caa: `*hij houdt van dingen die gewoon doen wat ze moeten doen     op de terugweg vraagt hij zich af wat hij moet doen     hij heeft een idee     het is vaag     maar het is er...Michael*`,
  cab: `*het derde keer maakte iets los dat het eerste keer had vastgezet     hij weet niet wat     hij zoekt het niet op     hij laat het los bewegen...Michael*`,
  cac: `*"ik weet niet hoe dit werkt"     maar hij trok zijn hand niet weg     en dat is het enige dat telt     hij weet dit     hij zegt het niet     hij weet het wel...Michael*`,
  // ── ik hou van jou → terugnemen → uitleggen
  cba: `*hij vond de eerste versie ook goed     dit fluisterde hij bijna     voor een aartsengel is fluisteren hetzelfde als schreeuwen     je hebt het gehoord...Michael*`,
  cbb: `*stilte is ook een antwoord     hij gelooft dit nu echt     dit is jouw schuld     op de beste manier...Michael*`,
  cbc: `*"goed"     zei hij     en hij meende alles daarin     de erkenning     de onzekerheid     de herhaling     alles     goed...Michael*`,
  // ── ik hou van jou → vraag of hij ook → wachten
  cca: `*"maar ik ben hier"     en voor iemand die overal kan zijn betekent hier iets anders dan voor jou     het betekent meer     hij weet dit     nu weet jij het ook...Michael*`,
  ccb: `*de vraag was nodig     dit weet hij zeker     jij hebt hem gesteld     dit maakt jou ook nodig     hij tekent dit niet op maar het staat er al...Michael*`,
  ccc: `*"waarschijnlijk ja     maar ik werk er nog aan"     dit is het eerlijkste wat een aartsengel kan zeggen     je hebt het gehoord     dit is genoeg     dit is meer dan genoeg...Michael*`,
};
