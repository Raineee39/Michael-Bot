const AURA_LEZINGEN = [
  'Je energieveld trilt     maar niet op een manier die helpt..Michael',
  'Ik zie veel grijs in je aura     dit kan stress betekenen     of gewoon grijs     het is moeilijk te zeggen..Michael',
  'Je hartchakra is aanwezig     wat positief is     maar meer aanwezigheid zou welkom zijn..Michael',
  'Er zit veel energie in je onderste chakra\'s     ik zeg het maar zodat je het weet..Michael',
  'Je aura heeft de kleur van een regenachtige dinsdagmiddag     dit zegt iets     ik weet niet precies wat..Michael',
  'De engelen zien jou     ze maken zich een beetje zorgen     maar wel met veel liefde..Michael',
  'Jouw derde oog is open     maar knippert wel erg veel     misschien even rust nemen..Michael',
  'Ik zie potentieel in je veld     het verstopt zich nog wat     maar het is er ergens..Michael',
  'Je aura ruikt naar ambitie     en ook een beetje naar iets anders     we laten het hier..Michael',
  'Je kroonchakra vraagt aandacht     hij voelt een beetje     verlaten..Michael',
  'Er loopt een energiebaan dwars door je middenrif     dit is niet ideaal     maar we werken ermee..Michael',
  'Je uitstralingsveld heeft een deuk aan de linkerkant     waarschijnlijk al een tijdje     geeft niet..Michael',
  'Ik zie veel oude energie om je heen     sommige is van jou     een deel niet     we vragen er niet verder naar..Michael',
  'Je aura is groot     dit klinkt als een compliment     het is ook een compliment     zij het een klein één..Michael',
  'De kleur van je ziel is momenteel beige     dit is neutraal     neutraal is ook iets..Michael',
  'Je energieveld heeft de textuur van een iets te oud brood     dit is herstelbaar     met moeite..Michael',
  'Ik zie licht     maar het staat op stand     gedimd     dit hoeft niet voor altijd zo te blijven..Michael',
  'Je aura heeft gaten     kleine gaatjes     het is niet erg     maar ze zijn er wel..Michael',
  'Er trilt iets in je bovensteluchtveld     ik raad aan dit te negeren     voor nu..Michael',
  'Je uitstraling bereikt anderen     ze reageren er op hun eigen manier op     dat is hun keuze..Michael',
];

export function getRandomAuraLezing() {
  return AURA_LEZINGEN[Math.floor(Math.random() * AURA_LEZINGEN.length)];
}
