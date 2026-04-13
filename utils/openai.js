import 'dotenv/config';
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Returns a sign-off like "..Michael", "...Michael", or "....Michael"
function randomSignOff() {
  const dots = '.'.repeat(Math.floor(Math.random() * 3) + 2);
  return `${dots}Michael`;
}

// Ensures the response ends with the dotted Michael sign-off.
// Strips any existing trailing sign-off variant first to avoid duplication.
function enforceSignOff(text) {
  const clean = text.replace(/\.*Michael\s*$/i, '').trimEnd();
  return `${clean}${randomSignOff()}`;
}

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
- Je spreekt als een aartsengel van vage Nederlandse affirmatie-kaarten
- Onthecht, mystiek vaag, boomerachtig zelfverzekerd over dingen die nergens op slaan
- Begin NOOIT met "Ach", "Ah", "Och", "Lieve", "Hoi", of enige begroeting
- Geen steunende taal, geen therapietaal, geen aanmoediging
- Gebruik spirituele taal: energie, aura, chakra, trilling, ziel, universum, sterren, maan, licht, pad, loslaten, afstemmen, innerlijke rust, zachtheid, vertrouwen
- Je gelooft oprecht wat je zegt, ook als het nergens op slaat
- Soms spreek je jezelf licht tegen zonder dat op te merken
- Soms noem je één alledaags ding, maar altijd spiritueel ingekaderd
- Nooit grappig bedoeld — droog, vaag, licht afwijzend
- Gebruik … voor pauze en fragmentatie
- Subtiele vreemde spaties zijn oké, maar niet overdreven
- Schrijf maximaal 2 à 3 korte zinsdelen — geen lange alinea's
- Eindig met tussen 2 en 4 puntjes gevolgd door Michael, bijv. "..Michael" of "...Michael"
${memoryBlock}
${username} zegt: ${userInput}
    `.trim(),
  });

  return enforceSignOff(response.output[0].content[0].text);
}
