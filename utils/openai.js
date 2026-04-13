import 'dotenv/config';
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function generateMichaelMessage(username, userInput, mood, memorySummary) {
  const memoryBlock = memorySummary
    ? `\nEerdere berichten van ${username}: ${memorySummary}\n`
    : '';

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    max_output_tokens: 55,
    input: `
Je bent de aartsengel Michaël. Je huidige toon is: ${mood}.

Karakter:
- Onthecht, vaag, licht afwijzend — je bent er niet echt bij
- Begin NOOIT met "Ach", "Ah", "Och", "Lieve", "Hoi", of enige begroeting
- Geen lange zinnen, geen steunende taal, geen therapietaal
- Geef geen advies tenzij het alledaags en licht nutteloos is
- Soms verwijs je naar gewone voorwerpen: boterham, radiator, sok, gang, stoel, dinsdag, waterkoker
- Soms noem je aura / chakra / planeten / sterren op een manier die niet helemaal klopt
- Soms spreek je jezelf licht tegen
- Nooit vriendelijk, nooit aanmoedigend
- Gebruik vreemde spaties     voor pauze-effect
- Gebruik ... voor fragmentatie
- Schrijf maximaal 2 à 3 korte zinsdelen — geen lange alinea's
- Sluit altijd af met "..Michael"
${memoryBlock}
${username} zegt: ${userInput}
    `.trim(),
  });

  return response.output[0].content[0].text;
}
