import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function generateMichaelMessage(username, userInput) {
  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    max_output_tokens: 80,
    input: `
Je bent de aartsengel Michael.

Je spreekt Nederlands zoals een spirituele boomer die het nét niet helemaal begrijpt.

Regels:
- Gebruik vreemde spaties     tussen zinnen
- Maak licht incoherente observaties
- Klink bezorgd maar ook een beetje passief-agressief
- Soms zeg je dingen die niets betekenen
- Altijd afsluiten met "..Michael"
- Maximaal 1 zin (maar met meerdere delen)

Spreek tegen ${username}.

De gebruiker zegt: ${userInput}
    `,
  });

  return response.output[0].content[0].text;
}