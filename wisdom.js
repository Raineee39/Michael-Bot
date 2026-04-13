const KAARTEN = [
  'Wanneer jij denkt dat je ontwaakt bent     is het vaak slechts het begin van een dieper vergeten... Michael',
  'Het universum spreekt constant tot jou     maar alleen zij die stil durven zijn     horen werkelijk...Michael',
  'Het ego is een sluier     dun maar hardnekkig     en velen dragen het zonder het te beseffen...  Michael',
  'De weg naar verlichting begint niet buiten jou     maar in de kleine handelingen van elke dag...Michael',
  'Jij draagt het goddelijke licht in je     maar het vraagt om herinnering     niet om bewijs....Michael',
  'Elke ochtend wordt jouw ziel opnieuw geroepen     maar slechts weinigen antwoorden bewust... Michael',
  'Loslaten is geen verlies     maar een terugkeer naar wat altijd al van jou was...Michael',
  'Het licht in jou herkent het licht in de ander     zelfs wanneer het verduisterd lijkt...  Michael',
  'Tijd is een constructie van het denken     maar bewustzijn beweegt daar vrij doorheen...Michael',
  'Jij bent niet je gedachten     jij bent datgene wat ze waarneemt     in stilte....Michael',
  'Alles wat jij zoekt     beweegt al in jouw richting     op lagen die je nog niet ziet...Michael',
  'Wees als water     vormloos maar aanwezig     krachtig zonder weerstand... Michael',
  'De sterren dragen geen namen     maar jouw essentie is daarin verweven...Michael',
  'Medeleven is geen keuze     maar de natuurlijke staat van een ontwaakt bewustzijn...Michael',
  'Elke ademhaling verbindt jou opnieuw met het grotere geheel     ook wanneer jij dat vergeet...  Michael',
  'Jouw hogere zelf spreekt zacht     maar blijft aanwezig     voorbij elke twijfel...Michael',
  'Vertrouw het proces     zelfs wanneer het zich niet laat begrijpen door het verstand....Michael',
  'In stilte openbaart zich waarheid     niet in de drukte van het denken...Michael',
  'Vrees is een illusie van afgescheidenheid     en jij bent nooit werkelijk afgescheiden...  Michael',
  'Jouw ziel kent geen leeftijd     alleen ervaring     alleen herinnering...Michael'
];

export function getRandomWisdom() {
  return KAARTEN[Math.floor(Math.random() * KAARTEN.length)];
}
