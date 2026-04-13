const BOODSCHAPPEN = [
  'Dit betekent grote verandering     maar wanneer precies     dat weten wij niet     geduld is een schone zaak..Michael',
  'De uitverkorene draagt nu een verantwoordelijkheid     wat die precies inhoudt     wordt later duidelijk..Michael',
  'Jij bent gekozen uit velen     dit is geen vergissing     maar het kan even wennen..Michael',
  'Het lot heeft zijn vinger naar jou uitgestoken     dit reinigt niet altijd     maar het wijst wel..Michael',
  'Verwacht niet dat alles nu makkelijker wordt     maar het wordt anders     zeker anders..Michael',
  'De engelen hebben vergaderd     het duurde lang     maar over jou waren ze het snel eens..Michael',
  'Er is iets in jou dat het universum heeft opgemerkt     wat dat is     zeggen we nog niet..Michael',
  'De uitverkorene weet het zelf nog niet     dat is normaal     dat was bij ons allemaal zo..Michael',
  'Jouw pad was altijd al dit pad     je liep er alleen nog niet bewust op     dat verandert nu..Michael',
  'Dit moment was al geschreven voordat jij geboren werd     en toch verrast het ons een beetje..Michael',
  'Er wordt van je gevraagd     wat dat is weten wij     jij leert het onderweg..Michael',
  'De hemel heeft gesproken     de boodschap is jouw naam     en een zeker gevoel van onvermijdelijkheid..Michael',
];

const GIF_QUERIES = [
  'jesus blessed',
  'catholic holy light',
  'angels heaven',
  'religious lightning',
  'pope blessing',
  'holy spirit dove',
  'jesus walking clouds',
  'church miracle',
  'jesus christ risen',
  'angel wings glowing',
];

export function getRandomBoodschap() {
  return BOODSCHAPPEN[Math.floor(Math.random() * BOODSCHAPPEN.length)];
}

export function getRandomGifQuery() {
  return GIF_QUERIES[Math.floor(Math.random() * GIF_QUERIES.length)];
}
