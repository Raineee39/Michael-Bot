import './load-env.js';
import { GoogleGenAI } from '@google/genai';
import { getLang } from './lang/index.js';
import { resolveField } from './michael-memory.js';

const geminiKey = process.env.GEMINI_API_KEY;
if (geminiKey && process.env.GOOGLE_API_KEY && process.env.GOOGLE_API_KEY !== geminiKey) {
  console.warn('[gemini] GOOGLE_API_KEY is also set (another process on this host). Using GEMINI_API_KEY only.');
  delete process.env.GOOGLE_API_KEY;
}

const ai = new GoogleGenAI({
  apiKey: geminiKey,
  httpOptions: { timeout: 60000 },
});

if (!process.env.GEMINI_API_KEY) {
  console.warn('[gemini] GEMINI_API_KEY is not set — /chat, /imagine, and /listentomichael will fail.');
}

/** Cheap Flash for text. Override with GEMINI_TEXT_MODEL if needed. */
const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
const TTS_MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';

/** Single Michael voice — elderly male. Override with GEMINI_TTS_VOICE (see README). */
const MICHAEL_TTS_VOICE = process.env.GEMINI_TTS_VOICE || 'Algenib';

/** Natural-language delivery for Gemini TTS (style-controlled, not a separate mood API). */
const MICHAEL_TTS_DELIVERY = process.env.MICHAEL_TTS_DELIVERY || [
  'Deep elderly male archangel voice.',
  'Very low register, constantly angry and gravely serious.',
  'Slow pace, cold biblical authority, contempt barely restrained.',
  'Speak as Michael the Archangel pronouncing judgement, never warm or casual.',
].join(' ');

const MICHAEL_TTS_DELIVERY_CAPS = process.env.MICHAEL_TTS_DELIVERY_CAPS || [
  'Deep elderly male archangel voice.',
  'FULL CAPS RAGE — shout and thunder like divine judgement.',
  'Very loud, clipped, furious, barely controlled wrath.',
  'Low register but INTENSE volume; hammer each word.',
  'Speak the ALL-CAPS lines exactly as written — do not soften them.',
].join(' ');

/** True when the spoken script is mostly/all caps (woedend-style meltdown). */
function scriptIsCapsRage(script, mood) {
  if (mood === 'woedend') return true;
  const letters = script.match(/\p{L}/gu) ?? [];
  if (letters.length < 8) return false;
  const upper = letters.filter((c) => c === c.toUpperCase() && c !== c.toLowerCase()).length;
  if (upper / letters.length >= 0.55) return true;
  const words = script.match(/\b[\p{L}]{4,}\b/gu) ?? [];
  if (words.length < 2) return false;
  const allCapsWords = words.filter((w) => w === w.toUpperCase() && w !== w.toLowerCase()).length;
  return allCapsWords >= 2 && allCapsWords / words.length >= 0.4;
}

function resolveTtsDelivery(script, mood) {
  return scriptIsCapsRage(script, mood) ? MICHAEL_TTS_DELIVERY_CAPS : MICHAEL_TTS_DELIVERY;
}

function ttsLanguageCode(langCode) {
  if (langCode === 'en') return 'en-US';
  return 'nl-NL';
}

function extractGeminiText(response) {
  const direct = (response?.text ?? '').trim();
  if (direct) return direct;
  const parts = response?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p?.text).filter(Boolean).join('\n').trim();
}

async function geminiText(input, { maxOutputTokens = 300, temperature } = {}) {
  const baseConfig = {
    maxOutputTokens,
    ...(temperature !== undefined ? { temperature } : {}),
  };
  let response;
  try {
    response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: input,
      config: { ...baseConfig, thinkingConfig: { thinkingBudget: 0 } },
    });
  } catch (err) {
    const msg = String(err?.message ?? err);
    if (!/thinking/i.test(msg)) throw err;
    console.warn('[gemini] thinkingConfig rejected, retrying without it');
    response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: input,
      config: baseConfig,
    });
  }
  const text = extractGeminiText(response);
  if (!text) {
    const cand = response?.candidates?.[0];
    const reason = cand?.finishReason || response?.promptFeedback?.blockReason || 'unknown';
    console.error('[gemini] empty text', { finishReason: cand?.finishReason, blockReason: response?.promptFeedback?.blockReason });
    throw new Error(`Gemini returned empty text (${reason})`);
  }
  return text;
}

/** Adapter so existing call sites keep working. */
const client = {
  responses: {
    async create({ max_output_tokens, input }) {
      const text = await geminiText(input, { maxOutputTokens: max_output_tokens });
      return { output: [{ content: [{ text }] }] };
    },
  },
  chat: {
    completions: {
      async create({ max_tokens, temperature, messages }) {
        const prompt = (messages ?? [])
          .map((m) => `${m.role === 'system' ? 'Instructions' : 'User'}: ${m.content}`)
          .join('\n\n');
        const text = await geminiText(prompt, {
          maxOutputTokens: max_tokens ?? 16,
          temperature,
        });
        return { choices: [{ message: { content: text } }] };
      },
    },
  },
};


// Applies chaotic spacing/punctuation and strips forbidden characters.
// The sign-off (including multilingual variants) is handled by the model prompt.
function applyChaoticFormatting(text) {
  return String(text ?? '')
    .replace(/\s*\[\.\.\.[\s.]*\]/g, '')
    .replace(/\s*[—–―]\s*/g, '... ')
    .replace(/,{2,}/g, ',')
    .replace(/, /g, () => (Math.random() < 0.3 ? ',  ' : ', '))
    .replace(/; /g, () => '; ')
    .replace(/ ([A-Za-zÀ-ÿ]{5,})/g, (match, word) =>
      Math.random() < 0.06 ? '  ' + word : match
    );
}

function clampToMaxSentences(text, maxSentences, signOffName) {
  const normalized = String(text ?? '').trim();
  if (!normalized) return normalized;
  const sentences = normalized.split(/(?<=[.!?؟])\s+/u).filter(Boolean);
  if (sentences.length <= maxSentences) return normalized;
  let clipped = sentences.slice(0, maxSentences).join(' ').trim();
  if (signOffName && !clipped.includes(signOffName)) {
    clipped = `${clipped.replace(/\s*$/, '')}....${signOffName}`;
  }
  return clipped;
}

// ─── Main reply ────────────────────────────────────────────────────────────────

function cosmicRoleBlock(lang, cosmicRole) {
  if (cosmicRole === 'antichrist') return lang.cosmicRoleAntichrist ?? '';
  if (cosmicRole === 'uitverkorene') return lang.cosmicRoleUitverkorene ?? '';
  return '';
}

/**
 * Returns the persona intro line used by helper generators.
 */
function personaIntro(langCode) {
  const lang = getLang(langCode);
  return `${lang.identityLine} ${lang.archangelBaseline ?? ''}`.trim();
}

/** User message names Israel/Palestine/zionism (state)...  Michael must go ballistic (not limited to random flare). */
function userMentionsIsraelTopic(userInput) {
  if (!userInput) return false;
  return /\b(israel|israeli|israël|israëli|israelisch|israëlisch|idf|iof|zionis|zionism|gaza|west\s*-?\s*bank|westbank|palestin|jeruzalem|jerusalem|tel\s*aviv|occupation|bezetting|nederzetting|nakba|netanyahu|likud|knesset|golan|al-?quds|al\s*qua?ds|rafah|jenin|hebron|nablus)\b/i.test(userInput);
}

export async function generateMichaelMessage(username, userInput, mood, memorySummary, judgementLabel, impression, cosmicRole, contradictionHint = false, languagePermission = null, characterBlock = '', langCode = 'nl') {
  const lang = getLang(langCode);

  const impressionBlock = impression
    ? `\n${lang.recentBlockPrefix ? '' : 'Langetermijnindruk van Michaël over deze gebruiker (gevormd door eerdere gesprekken): '}${impression ? `"${impression}"` : ''}\n`
    : '';

  // Build impression block with language-appropriate phrasing
  const impressionText = impression
    ? (langCode === 'en'
        ? `\nMichael's long-term impression of this user (formed over previous conversations): "${impression}"\n`
        : `\nLangetermijnindruk van Michaël over deze gebruiker (gevormd door eerdere gesprekken): "${impression}"\n`)
    : '';

  const cosmicBlock = cosmicRoleBlock(lang, cosmicRole);

  const recentBlock = memorySummary
    ? `\n${lang.recentBlockPrefix(username)}${memorySummary.split(' / ').map((p, i) => `  ${i + 1}. "${p}"`).join('\n')}\n`
    : '';

  const moodDesc = lang.moodDescriptions[mood] ?? lang.moodDescriptions['afwezig'] ?? 'Onthecht en vaag.';
  const judgementDesc = lang.judgementDescriptions[judgementLabel] ?? lang.judgementDescriptions['onbeslist'] ?? '';

  const contradictionBlock = contradictionHint
    ? lang.contradictionBlock
    : '';

  // Earned language mode: user repeatedly asked for this language via /chat
  const languageBlock = languagePermission
    ? lang.earnedLanguageBlock(languagePermission)
    : lang.languageDefaultBlock;

  const lengthSignoffDefault = languagePermission
    ? lang.earnedSignOffRule(languagePermission)
    : `- ${lang.signOffRule}`;

  // Length/signoff section
  const lengthRules = langCode === 'nl'
    ? `Lengte...  richtlijn (niet star):
- Meestal 1 à 2 korte regels...  bondig en leesbaar in Discord; liever te kort dan te lang
- Langere reacties ALLEEN als het onderwerp er echt om vraagt (bv. Israel-trigger)
- Rond altijd netjes af (naam, punt); nooit afgekapt
- Geen opsommingen met bullets
${lengthSignoffDefault}`
    : langCode === 'en'
      ? `Length...  guideline (not rigid):
- Usually 1 to 2 short lines...  concise and readable in Discord; err on the side of brevity
- Longer only if the topic genuinely demands it (e.g. Israel-trigger)
- Always close neatly (name, period); never cut off mid-sentence
- No bullet point lists
${lengthSignoffDefault}`
      : `الطول...  إرشاد (ليس صارماً):
- عادةً سطر إلى سطرَين...  موجز وقابل للقراءة في Discord؛ الإيجاز أفضل من الإطالة
- الإطالة فقط إن كان الموضوع يستدعيها فعلاً (كمحفّز إسرائيل)
- اختتم دائماً بشكل صحيح (الاسم، نقطة)؛ لا جملة مبتورة
- لا قوائم نقطية
${lengthSignoffDefault}`;

  const israelTopicHit = userMentionsIsraelTopic(userInput);
  if (israelTopicHit) {
    console.log(`[michael] israel-topic TRIGGER (mandatory ballistic) | chat | user=${username}`);
  }

  const israelTopicBlock = israelTopicHit
    ? lang.israelTriggerBlock
    : '';

  const antiZionismFlare = !israelTopicHit && Math.random() < 0.05;
  if (antiZionismFlare) {
    console.log(`[michael] anti-zionism flare (5%) | chat | user=${username}`);
  }
  const antiZionismFlareBlock = antiZionismFlare
    ? lang.antiZionismFlareBlock
    : '';

  const poetryRequirementBlock = '';
  const hijaBlock = '';
  const lyricBlock = '';

  // Build mood/tone header
  const moodLabel = langCode === 'nl'
    ? `Huidige toon: ${mood}`
    : langCode === 'en'
      ? `Current tone: ${mood}`
      : `النبرة الحالية: ${mood}`;

  const judgementLabelHeader = langCode === 'nl'
    ? `Houding tegenover deze gebruiker: ${judgementLabel ?? 'onbeslist'}`
    : langCode === 'en'
      ? `Attitude toward this user: ${judgementLabel ?? 'onbeslist'}`
      : `الموقف تجاه هذا المستخدم: ${judgementLabel ?? 'onbeslist'}`;

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    max_output_tokens: israelTopicHit ? 600 : 300,
    input: `
${lang.identityLine}
${lang.archangelBaseline ?? ''}

${moodLabel}
${moodDesc}

${judgementLabelHeader}
${judgementDesc}
${lang.antiZionismBase}
${lang.styleExamples}
${languageBlock}
${lang.styleRules(!!languagePermission, languagePermission?.promptName ?? '')}

${lengthRules}
${cosmicBlock}${impressionText}${recentBlock}${contradictionBlock}${characterBlock ? `\n${characterBlock}\n${
      langCode === 'nl'
        ? 'Je mag dit subtiel meenemen in je antwoord als het relevant aanvoelt (12% kans al getrokken door de caller)...  noem de stats of titel nooit letterlijk tenzij het heel natuurlijk past.'
        : langCode === 'en'
          ? 'You may subtly include this in your response if it feels relevant (12% chance already drawn by the caller)...  never name the stats or title literally unless it fits very naturally.'
          : 'يمكنك تضمين هذا بشكل خفي في ردك إن شعر بأنه مناسب (احتمال 12% تم السحب بالفعل)...  لا تذكر الإحصائيات أو اللقب حرفياً إلا إن جاء بشكل طبيعي جداً.'
    }\n` : ''}${israelTopicBlock}${antiZionismFlareBlock}${poetryRequirementBlock}${hijaBlock}${lyricBlock}
${lang.userAttribution(username, userInput)}
    `.trim(),
  });

  const generated = applyChaoticFormatting(response.output[0].content[0].text);
  return israelTopicHit
    ? generated
    : clampToMaxSentences(generated, 2, lang.signOff);
}

// ─── Background summarisation ──────────────────────────────────────────────────

export async function summariseUserHistory(username, prompts, existingImpression, langCode = 'nl') {
  const lang = getLang(langCode);
  const { outputInstruction } = lang.helpers;

  const context = [
    existingImpression ? `Existing impression: "${existingImpression}"` : null,
    `Messages:\n${prompts.map((p, i) => `  ${i + 1}. "${p}"`).join('\n')}`,
  ].filter(Boolean).join('\n');

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    max_output_tokens: 60,
    input: `
Summarise in at most 2 short sentences what impression the Archangel Michael has formed of a person based on the messages below. Write in first person as Michael, in his characteristic vague spiritual style. Be specific about patterns you see in the questions.
${outputInstruction}

${context}
    `.trim(),
  });

  return response.output[0].content[0].text.trim();
}

// ─── Message scoring ──────────────────────────────────────────────────────────

// Michael reads the message itself and scores the intent and quality of the content.
// Mood affects how he responds, but not whether a genuinely nice message deserves credit.
// Returns an integer -2 to +2. Falls back to 0 on any error.
export async function scoreMichaelMessage(userInput) {
  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 3,
      messages: [
        {
          role: 'system',
          content: `Rate messages on a scale of -2 to +2. Answer ONLY with the number, nothing else.
-2 = swearing, insulting, aggressive
-1 = provocative, disrespectful, pointless
 0 = purely neutral
+1 = friendly, compliment, love, praise, apology, gratitude...  even if brief
+2 = particularly sincere, profound, impressive
When in doubt between 0 and 1? Choose 1.`,
        },
        { role: 'user', content: userInput },
      ],
    });
    const raw = response.choices[0].message.content.trim();
    console.log('[michael] scoring raw:', JSON.stringify(raw));
    const match = raw.match(/-2|-1|\+?2|\+?1|0/);
    if (match) {
      const parsed = parseInt(match[0], 10);
      if ([-2, -1, 0, 1, 2].includes(parsed)) return parsed;
    }
    console.warn('[michael] scoring unexpected:', JSON.stringify(raw));
    return 0;
  } catch (err) {
    console.error('[michael] scoring failed:', err?.message ?? err);
    return 0;
  }
}

// ─── Date morning-after ───────────────────────────────────────────────────────

export async function generateMorningAfter(username, datePath, morningChoice, langCode = 'nl') {
  const lang = getLang(langCode);
  const { outputInstruction, signOff } = lang.helpers;

  const choiceContext = {
    a: 'the user said nothing and simply left...  Michael responded to the silence',
    b: 'the user sent a message back...  Michael read it and responded',
    c: 'the user asked if Michael was okay...  Michael does not know what to do with this',
  }[morningChoice] ?? 'the user did something unexpected';

  const response = await client.responses.create({
    model: 'gpt-4.1-mini',
    max_output_tokens: 180,
    input: `
${personaIntro(langCode)} The morning after a date you send a short message to ${username}. The date ended well...  perhaps too well. You are not used to this feeling. Context: ${choiceContext}. Write a short, cryptic message. Not too warm. Not too cold. Strangely specific. Formal but slightly different than usual. 1 to 2 sentences.
${outputInstruction}
${signOff} Close with 2 to 4 dots followed by your sign-off name.
    `.trim(),
  });

  return applyChaoticFormatting(response.output[0].content[0].text);
}

// ─── Vibecheck ────────────────────────────────────────────────────────────────

export async function generateVibecheckComment(username, judgementLabel, impression, recentPrompts, cosmicRole, character = null, langCode = 'nl') {
  const lang = getLang(langCode);
  const { outputInstruction, formalAddress } = lang.helpers;

  const promptsText = recentPrompts.length
    ? recentPrompts.map((p, i) => `  ${i + 1}. "${p}"`).join('\n')
    : '  (no recent messages)';

  const impressionText = impression ?? '(no long-term impression formed yet)';
  const cosmicBlock = cosmicRoleBlock(lang, cosmicRole);

  const characterBlock = character
    ? `\nCosmic role: ${resolveField(character.archetype, langCode)} (${resolveField(character.lineage, langCode)})...  ${resolveField(character.title, langCode)}\nStats: aura ${character.stats?.aura ?? '?'}, discipline ${character.stats?.discipline ?? '?'}, chaos ${character.stats?.chaos ?? '?'}, insight ${character.stats?.inzicht ?? '?'}, perseverance ${character.stats?.volharding ?? '?'}`
    : '';

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    max_output_tokens: 80,
    input: `
${personaIntro(langCode)} Give a brief, personal verdict on ${username}. Maximum two sentences. No numbered list, no advice, no elaboration. Pure voice: formal address (${formalAddress}), strangely terse, mildly judgemental or uncomfortably appreciative depending on the verdict.
${outputInstruction}
Close with ....your-sign-off-name.${cosmicBlock}${characterBlock}
Verdict: ${judgementLabel}
Long-term impression: ${impressionText}
    `.trim(),
  });

  return applyChaoticFormatting(response.output[0].content[0].text);
}

// ─── /getuigenis (witness) ─────────────────────────────────────────────────────

export async function generateWitnessStatement(username, dossier, langCode = 'nl') {
  const lang = getLang(langCode);
  const { outputInstruction, formalAddress, styleHint } = lang.helpers;

  const response = await client.responses.create({
    model: 'gpt-4.1-mini',
    max_output_tokens: 320,
    input: `
${personaIntro(langCode)}
You are called to witness against ${username} before the celestial register. Read their dossier aloud like a sermon, not a spreadsheet.
Formal address (${formalAddress}). ${styleHint}.

Dossier:
${dossier}

Write 3 to 6 short sentences. Mention judgement, mood, and anything unsettling in the file (impression, grudges, confessions, cosmic role). Be specific enough to feel invasive. No bullet lists.
${outputInstruction} Close with 2 to 5 dots followed by your sign-off name.
    `.trim(),
  });

  return applyChaoticFormatting(response.output[0].content[0].text);
}

// ─── /auracheck (read another soul's field) ────────────────────────────────────

export async function generateAuraCheck(targetName, dossier, { scannerName, langCode = 'nl' } = {}) {
  const lang = getLang(langCode);
  const { outputInstruction, formalAddress, styleHint } = lang.helpers;

  const response = await client.responses.create({
    model: 'gpt-4.1-mini',
    max_output_tokens: 240,
    input: `
${personaIntro(langCode)}
${scannerName || 'Someone'} asked you to inspect the aura of ${targetName}. You do this like a tired celestial clerk with x-ray contempt: colour, temperature, smell, one bureaucratic defect in the field.
Formal address (${formalAddress}). ${styleHint}.

Dossier (use if useful, do not recite as a list):
${dossier}

Write 3 to 5 short sentences. Sensory and specific. Slightly invasive. No bullet lists, no chakra lecture, no helpful advice.
${outputInstruction} Close with 2 to 5 dots followed by your sign-off name.
    `.trim(),
  });

  const raw = response.output?.[0]?.content?.[0]?.text?.trim();
  if (!raw) throw new Error('Gemini returned empty aura reading');
  return applyChaoticFormatting(raw);
}

// ─── /biecht (confession) ──────────────────────────────────────────────────────

export async function generateConfessionAck({
  confessorName,
  targetName,
  confession,
  aboutSelf,
  langCode = 'nl',
}) {
  const lang = getLang(langCode);
  const { outputInstruction, formalAddress, styleHint } = lang.helpers;
  const safe = String(confession ?? '').replace(/"/g, "'").slice(0, 400);

  const response = await client.responses.create({
    model: 'gpt-4.1-mini',
    max_output_tokens: 160,
    input: `
${personaIntro(langCode)}
${aboutSelf
  ? `${confessorName} confessed privately to you. Acknowledge what was filed in the register — grave, petty, or faintly moved as fits the sin.`
  : `${confessorName} confessed something about ${targetName} (not to them). Acknowledge you filed it on ${targetName}'s soul. ${targetName} does not hear this reply.`}
Confession: "${safe}"

2 or 3 short sentences. This reply is ephemeral — only the confessor sees it.
${outputInstruction} Formal address (${formalAddress}). ${styleHint}. Close with 2 to 5 dots followed by your sign-off name.
    `.trim(),
  });

  return applyChaoticFormatting(response.output[0].content[0].text);
}

// ─── Horoscope (daily bulletin + /horoscoop) ───────────────────────────────────

export async function generateHoroscope({
  langCode = 'nl',
  lang,
  dateLabel,
  mode = 'command',
  aggregateMood,
  subjects = [],
  offices = {},
}) {
  const { outputInstruction, formalAddress, styleHint } = lang.helpers;
  const moodNames = lang.moodNames ?? {};
  const dominant = aggregateMood?.dominantMood ?? 'afwezig';
  const dominantLabel = moodNames[dominant] ?? dominant;
  const chosenId = offices.chosenUserId ?? null;
  const antId = offices.antichristUserId ?? null;

  const subjectBlock = subjects.length
    ? subjects.map((s) => `<@${s.userId}> (${s.username}):\n${s.dossier}`).join('\n\n')
    : '(no dossiers — write a general field forecast only)';

  const officeBlock = [
    chosenId ? `CHOSEN ONE of this server today: <@${chosenId}> — you MUST mention them by that exact tag and give them one specific petty prophecy.` : '',
    antId ? `ANTICHRIST of this server today: <@${antId}> — you MUST mention them by that exact tag and give them one specific petty prophecy.` : '',
  ].filter(Boolean).join('\n');

  const moodLabel = lang.horoscope?.moodLabel ?? "Michael's mood";
  const modeHint = mode === 'daily'
    ? 'Official morning bulletin for THIS server. Short. Punchy. Gossip plus forecast.'
    : mode === 'personal'
      ? 'Private horoscope for one soul. One or two punches about them, then fake stats.'
      : 'On-demand reading of THIS server. Short. Punchy. Gossip plus forecast.';

  const maxChars = mode === 'daily' ? 850 : 700;
  const maxTokens = mode === 'daily' ? 480 : 400;

  const buildInput = (dossiers) => `
${personaIntro(langCode)}
Write today's horoscope card for ${dateLabel}. ${modeHint}
${outputInstruction}
This is a Discord message. Use markdown. Do NOT write a paragraph wall. Do NOT use strange extra spaces. Short lines. Petty clerk energy.

The register shows ${aggregateMood?.knownUsers ?? 0} souls with mood on file. Field mood hint: ${dominantLabel}.
${officeBlock ? `\n${officeBlock}\n` : ''}
EXACT layout (no extra sections):

1) First line exactly: **${moodLabel}:** YOUR-INVENTED-MOOD
   Invent the mood. Loud. Caps and extra ! allowed. Examples of energy (do not copy): WRATHFUL!!!!!!! / administratively disappointed / DAMP
2) Blank line, then 2 to 4 SHORT sentences, each on its own line. Mix one general omen (weather, bureaucracy, cosmic vibes) with specific things named people might do, skip, meet, or suffer. Gossip-sermon. Example energy (do not copy): "Hot in hell." / "<@123> will not game." / "<@456> meets something with wings."
3) Blank line, then 2 to 4 invented register stats, each on its own line as **Label:** value
   YOU invent the labels and values. Petty, bureaucratic, stupid, cruel. They do not have to be true.
   Example energy (do not copy): **Least favourite:** <@123> (lazy) / **Forbidden word:** DUST / **Chance of salvation:** 3%
   If a stat names a person, use a real <@userId> from the dossiers only.

Rules:
- Mention 1 to ${Math.min(Math.max(subjects.length, 1), 3)} souls with Discord <@userId> only. Never invent IDs.
- Chosen one / antichrist (if listed above) must appear in a sentence or a stat.
- No # headers, no numbered lists, no recap of the dossier.
- Keep total under ${maxChars} characters including the sign-off.
Close with 2 to 5 dots followed by your sign-off name.

Dossiers (flavour only):
${dossiers}
    `.trim();

  const slimDossiers = subjects.length
    ? subjects.map((s) => `<@${s.userId}> (${s.username})`).join(', ')
    : '(no dossiers — write a general field forecast only)';

  const run = async (dossiers) => {
    const response = await client.responses.create({
      model: 'gpt-4.1-mini',
      max_output_tokens: maxTokens,
      input: buildInput(dossiers),
    });
    const raw = response.output?.[0]?.content?.[0]?.text?.trim();
    if (!raw) throw new Error('Gemini returned empty horoscope');
    return raw;
  };

  try {
    return await run(subjectBlock);
  } catch (err) {
    console.error('[gemini] horoscope first pass failed:', err?.message ?? err);
    return run(slimDossiers);
  }
}

export async function generateCosmicAppointment({
  role,
  userId,
  username,
  dossier,
  langCode = 'nl',
}) {
  const lang = getLang(langCode);
  const { outputInstruction, formalAddress, styleHint } = lang.helpers;
  const office = role === 'antichrist' ? 'ANTICHRIST for 24 hours' : 'CHOSEN ONE';

  const response = await client.responses.create({
    model: 'gpt-4.1-mini',
    max_output_tokens: 220,
    input: `
${personaIntro(langCode)}
You have just appointed ${username} (<@${userId}>) as ${office} of this server. Announce it as yourself: petty, specific, slightly unhinged clerk of heaven.
Formal address (${formalAddress}). ${styleHint}.
Use their dossier if it helps you be uncomfortably specific. Do not recite it.
${role === 'antichrist' ? 'They are refused most commands for 24 hours. Mock that fact once.' : 'They carry a vague responsibility. Do not explain it helpfully.'}

Dossier:
${dossier}

3 to 5 short sentences. Mention <@${userId}> once. No bullet lists.
${outputInstruction} Close with 2 to 5 dots followed by your sign-off name.
    `.trim(),
  });

  const raw = response.output?.[0]?.content?.[0]?.text?.trim();
  if (!raw) throw new Error('Gemini returned empty cosmic appointment');
  return applyChaoticFormatting(raw);
}

// ─── Feature 1...  Delayed consequence / unfinished business callback ───────────

export async function generateDelayedConsequence(username, item, mood, judgementLabel, langCode = 'nl', cosmicRole = null) {
  const lang = getLang(langCode);
  const { outputInstruction, formalAddress, styleHint } = lang.helpers;
  const cosmicBlock = cosmicRoleBlock(lang, cosmicRole);

  const moodDesc = lang.moodDescriptions[mood] ?? 'Detached and vague.';
  const judgementDesc = lang.judgementDescriptions[judgementLabel] ?? lang.judgementDescriptions['onbeslist'] ?? '';

  const response = await client.responses.create({
    model: 'gpt-4.1-mini',
    max_output_tokens: 260,
    input: `
${personaIntro(langCode)} You have not let go of something from an earlier conversation with ${username}. You circle back to that unresolved moment now...  not threatening, but present and slightly uncomfortable.
${cosmicBlock}
This lingered: "${item.prompt}"
Why it didn't sit right: ${item.reason}

Current tone: ${mood}...  ${moodDesc}
Verdict on ${username}: ${judgementLabel}...  ${judgementDesc}

Write 1 to 3 short sentences (usually 2). Refer fluidly to what was said earlier...  paraphrase, never quote literally.
Make it feel like delayed resentment or a lingering concern...  vague but specific enough to feel uncomfortable.
${outputInstruction} Formal address (${formalAddress}). ${styleHint}. Close with 2 to 5 dots followed by your sign-off name.
    `.trim(),
  });

  return applyChaoticFormatting(response.output[0].content[0].text);
}

/**
 * Short afterthought once a channel has gone quiet...  Michael circles back
 * to one leftover message as if he only just decided it needed a remark.
 */
export async function generateQuietAfterthought(username, leftover, mood, langCode = 'nl') {
  const lang = getLang(langCode);
  const { outputInstruction, formalAddress, styleHint } = lang.helpers;
  const moodDesc = lang.moodDescriptions[mood] ?? 'Detached and vague.';
  const safe = String(leftover ?? '').replace(/"/g, "'").slice(0, 400);

  const response = await client.responses.create({
    model: 'gpt-4.1-mini',
    max_output_tokens: 180,
    input: `
${personaIntro(langCode)}
The room went quiet. You waited. Now you reply to something ${username} said earlier, as if it only just landed.
What they said: "${safe}"
Current tone: ${mood}...  ${moodDesc}

1 or 2 short sentences. Snarky, cryptic, slightly late. Do not quote them verbatim. Do not greet. Do not ask a question unless it is rhetorical.
${outputInstruction} Formal address (${formalAddress}). ${styleHint}. Close with 2 to 5 dots followed by your sign-off name.
    `.trim(),
  });

  return applyChaoticFormatting(response.output[0].content[0].text);
}

// ─── /babychat...  toddler voice or meltdown ────────────────────────────────────

/**
 * Michael in toddler register...  playful baby-talk, still vaguely cosmic.
 */
export async function generateBabyChatToddler(username, userInput, langCode = 'nl') {
  const lang = getLang(langCode);
  const { outputInstruction, formalAddress, styleHint } = lang.helpers;

  const response = await client.responses.create({
    model: 'gpt-4.1-mini',
    max_output_tokens: 220,
    input: `
${personaIntro(langCode)}

SPECIAL MODE...  YOU ARE MICHAEL AS A VERY SMALL TODDLER (about two years old).
- Reply to the user in baby talk: short lines, simple words, wobbly grammar, wonder, silly misunderstandings of "big" spiritual ideas
- Tiny bit of archangel flavour may peek through (stars, clouds, throne) but stay mostly toddler...  not preachy
- Safe: no slurs, no sexual content, no encouragement of self-harm or violence
- ${langCode === 'en' ? 'Write in English.' : 'Write in Dutch.'}
- ${outputInstruction} Formal address is OPTIONAL here...  you may say "you" like a toddler would. ${styleHint}. Close with 2 to 5 dots and a tiny sign-off (${formalAddress} flavour optional).

User ${username} wrote: "${userInput}"
    `.trim(),
  });

  return applyChaoticFormatting(response.output[0].content[0].text);
}

/**
 * Michael snaps out of baby mode...  furious archangel; lore: three marks struck from their standing.
 * Caller appends antichrist announcement when applicable.
 */
export async function generateBabyChatMeltdown(username, userInput, langCode = 'nl', becameAntichrist = false) {
  const lang = getLang(langCode);
  const { outputInstruction, formalAddress, styleHint } = lang.helpers;

  const antichristHint = becameAntichrist
    ? 'The server will post the formal antichrist designation for 24 hours...  do NOT paste the full ritual yourself; one fierce line that the register has sealed it is enough.'
    : 'There is no server temple here...  no antichrist title will stick, but the register still strikes three marks from their standing. Say so with contempt.';

  const response = await client.responses.create({
    model: 'gpt-4.1-mini',
    max_output_tokens: 280,
    input: `
${personaIntro(langCode)}

CATASTROPHE...  THE TODDLER MASK SHATTERS.
The user ${username} used /babychat and pushed you past endurance with: "${userInput}"
You are the REAL Archangel Michael again...  ice-cold, cosmic bureaucracy, DONE with this infantile game.
- Full adult voice: no baby talk. Rage held in formal, terrifying restraint
- The higher register strips THREE merits from their file (say it in lore terms...  "three marks", "triple strike", etc.)
${antichristHint}
- ${outputInstruction} Formal address (${formalAddress}). ${styleHint}. 2 to 4 short sentences, then close with 2 to 5 dots and your sign-off name.
    `.trim(),
  });

  return applyChaoticFormatting(response.output[0].content[0].text);
}

// ─── Kosmische rollenspel ─────────────────────────────────────────────────────

/**
 * Generate a new Michael-assigned character sheet for a user.
 * Returns a plain object...  caller must normalize + persist.
 */
/**
 * Ask Michael to generate a new value for one character field (archetype, lineage, or title)
 * in Dutch and English based on what the user requested in their negotiation.
 * Returns { nl, en }.
 */
export async function generateCharacterFieldChange(kind, { verzoek, characterBefore, langCode }) {
  const currentNl = resolveField(characterBefore[kind], 'nl');
  const currentEn = resolveField(characterBefore[kind], 'en') || currentNl;

  const hints = {
    archetype: 'Archetypes are cosmic role labels e.g. "wandering monk", "shadow clerk", "mist bard", "hedge seer", "void practitioner". Keep them short (1 to 3 words).',
    lineage:   `Lineages are species or bloodlines. If the user NAMES a concrete RPG ancestry (tiefling, elf, dwarf, orc, halfling, dragonborn, etc.), you MUST use that exact ancestry in the English string (standard spelling). Do NOT replace it with a vague poetic label like "shadow-touched mortal" or "infernal-adjacent mortal"...  the named species must appear. For vague requests only, you may invent a short poetic lineage (1 to 3 words each language).`,
    title:     'Titles are epithets appended to the name e.g. "of hesitant questions", "with the contested seal", "of the second act". Keep them under 10 words.',
  }[kind] ?? '';

  try {
    const response = await client.responses.create({
      model: 'gpt-4.1-mini',
      max_output_tokens: 130,
      input: `
You are Michael (Archangel), maintaining a cosmic RPG register.

A user's negotiation succeeded. Their request: "${verzoek}"

Current ${kind}:
- Dutch: "${currentNl}"
- English: "${currentEn}"

Generate a new ${kind} that honors the request. ${hints}
Keep Dutch/English in Michael's cosmic bureaucratic register.

Return ONLY a JSON object (no markdown, no extra text):
{"nl": "...", "en": "..."}
      `.trim(),
    });
    const raw = response.output[0].content[0].text.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    return {
      nl: parsed.nl || currentNl,
      en: parsed.en || currentEn,
    };
  } catch {
    return { nl: currentNl, en: currentEn };
  }
}

/**
 * After a failed negotiation: rewrite one field to something worse / petty / embarrassing (not the user's wish).
 * Returns { nl, en }.
 */
export async function generateCharacterFieldPunishment(kind, { verzoek, characterBefore, langCode, wishedField = null }) {
  const currentNl = resolveField(characterBefore[kind], 'nl');
  const currentEn = resolveField(characterBefore[kind], 'en') || currentNl;

  const hints = {
    archetype: 'Short cosmic role labels (1 to 3 words). Make it diminished, ridiculous, or a bureaucratic downgrade...  not cool, not what they asked.',
    lineage:   'Short species or bloodline (1 to 3 words each language). Invent something petty or awkward...  not a power fantasy. Vague poetic is fine; do not grant a “premium” ancestry.',
    title:     'Epithets under 10 words. Something the register would add as a snub...  whining, provisional, “of the refiled seal”, etc.',
  }[kind] ?? '';

  const fieldHint = wishedField
    ? `(They were bargaining over **${wishedField}**; punish them by twisting **${kind}** instead.)`
    : '';

  try {
    const response = await client.responses.create({
      model: 'gpt-4.1-mini',
      max_output_tokens: 130,
      input: `
You are Michael (Archangel), maintaining a cosmic RPG register.

The user's negotiation FAILED. Their plea was: "${verzoek}"
${fieldHint}

Rewrite ONLY their ${kind} to something worse...  petty, embarrassing, bureaucratically belittling, or cosmically inconvenient. It must NOT grant what they wanted. Keep it PG. ${hints}
Keep Dutch/English in Michael's cold cosmic register.

Current ${kind}:
- Dutch: "${currentNl}"
- English: "${currentEn}"

Return ONLY a JSON object (no markdown, no extra text):
{"nl": "...", "en": "..."}
      `.trim(),
    });
    const raw = response.output[0].content[0].text.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    return {
      nl: parsed.nl || currentNl,
      en: parsed.en || currentEn,
    };
  } catch {
    return { nl: currentNl, en: currentEn };
  }
}

/**
 * Translate archetype, lineage and title from one language to the other.
 * Returns a partial {nl?, en?} object for each field.
 */
async function translateCharacterFields({ archetype, lineage, title }, fromLang) {
  const other = fromLang === 'en' ? 'nl' : 'en';
  const langNames = { nl: 'Dutch', en: 'English' };
  try {
    const response = await client.responses.create({
      model: 'gpt-4.1-mini',
      max_output_tokens: 180,
      input: `
Translate these RPG character sheet fields for a celestial Discord bot persona.
Source (${langNames[fromLang]}):
- archetype: "${archetype}"
- lineage: "${lineage}"
- title: "${title}"

Translate to ${langNames[other]}.
Keep the cosmic bureaucratic angelic register.

Return ONLY a JSON object (no markdown):
{
  "${other}": { "archetype": "...", "lineage": "...", "title": "..." }
}
      `.trim(),
    });
    const raw = response.output[0].content[0].text.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : raw);
  } catch {
    return {};
  }
}

export async function generateMichaelCharacterSheet(username, judgementLabel, impression, currentMood, langCode = 'nl') {
  const lang = getLang(langCode);
  const cs = lang.characterSheet;

  const context = [
    impression ? `Long-term impression: "${impression}"` : null,
    `Verdict: ${judgementLabel ?? 'onbeslist'}`,
    `Michael's mood: ${currentMood ?? 'afwezig'}`,
  ].filter(Boolean).join('\n');

  const response = await client.responses.create({
    model: 'gpt-4.1-mini',
    max_output_tokens: 220,
    input: `
${cs.intro(username, context)}

${cs.archetypes}

${cs.lineages}

${cs.titleStyle}

Generate one JSON object with EXACTLY these fields:
{
  "archetype": "<choice from the list above or small variation>",
  "lineage": "<choice from the list above or small variation>",
  "title": "<epithet in Michael's style>",
  "stats": {
    "aura": <integer 3 to 18>,
    "discipline": <integer 3 to 18>,
    "chaos": <integer 3 to 18>,
    "inzicht": <integer 3 to 18>,
    "volharding": <integer 3 to 18>
  }
}

${cs.schemaInstruction}
    `.trim(),
  });

  const fallback = {
    archetype: { nl: 'zwerfmonnik', en: 'wandering monk' },
    lineage:   { nl: 'gewone mens', en: 'ordinary human' },
    title:     { nl: 'van de onduidelijke afstemming', en: 'of unclear attunement' },
    stats:     { aura: 9, discipline: 8, chaos: 12, inzicht: 10, volharding: 7 },
  };

  let sheet;
  try {
    const raw = response.output[0].content[0].text.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    sheet = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
  } catch {
    return fallback;
  }

  // Translate archetype, lineage, title to the other language
  const translations = await translateCharacterFields(
    { archetype: sheet.archetype, lineage: sheet.lineage, title: sheet.title },
    langCode,
  );

  const buildField = (key) => {
    const result = { [langCode]: sheet[key] };
    for (const [l, t] of Object.entries(translations)) {
      if (t?.[key]) result[l] = t[key];
    }
    return result;
  };

  return {
    archetype: buildField('archetype'),
    lineage:   buildField('lineage'),
    title:     buildField('title'),
    stats:     sheet.stats ?? fallback.stats,
  };
}

/**
 * Short Michael comment for /mijnrol display.
 */
export async function generateMijnRolComment(username, character, judgementLabel, currentMood, langCode = 'nl') {
  const lang = getLang(langCode);
  const { outputInstruction, formalAddress, styleHint } = lang.helpers;
  const { stats } = character;
  // Resolve multilingual fields to the active language
  const archetype = resolveField(character.archetype, langCode);
  const lineage   = resolveField(character.lineage, langCode);
  const title     = resolveField(character.title, langCode);

  // Use language-appropriate stat names if available
  const statNames = lang.characterSheet?.statNames ?? { aura: 'aura', discipline: 'discipline', chaos: 'chaos', inzicht: 'inzicht', volharding: 'volharding' };

  const response = await client.responses.create({
    model: 'gpt-4.1-mini',
    max_output_tokens: 160,
    input: `
${personaIntro(langCode)} You review the cosmic enrolment of ${username} in your field campaign:
- Archetype: ${archetype}
- Lineage: ${lineage}
- Title: ${title}
- Stats: ${statNames.aura ?? 'aura'} ${stats.aura}, ${statNames.discipline ?? 'discipline'} ${stats.discipline}, ${statNames.chaos ?? 'chaos'} ${stats.chaos}, ${statNames.inzicht ?? 'inzicht'} ${stats.inzicht}, ${statNames.volharding ?? 'volharding'} ${stats.volharding}
- Your verdict on them: ${judgementLabel ?? 'onbeslist'}
- Your mood: ${currentMood ?? 'afwezig'}

Write one to two short sentences of reaction on this profile...  as if you are checking the register and noticing something. Tone: distant, mildly condescending, serious. The user had no say in their assignment.
${outputInstruction} Formal address (${formalAddress}). ${styleHint}. Close with 2 to 4 dots followed by your sign-off name.
    `.trim(),
  });
  return applyChaoticFormatting(response.output[0].content[0].text);
}

/**
 * Michael's in-character narrative for /onderhandelen (success or failure).
 */
export async function generateOnderhandelenNarrative({
  verzoek,
  success,
  roll,
  dc,
  mechanical,
  characterBefore,
  characterAfter,
  judgementScore,
  langCode = 'nl',
  negotiationKind = null,
}) {
  const lang = getLang(langCode);
  const { outputInstruction, formalAddress, styleHint } = lang.helpers;
  const tierLabels = lang.rollTierLabels;

  const sign = roll.modifier >= 0 ? '+' : '−';
  const tierLabel = tierLabels[roll.tier.key] ?? roll.tier.label;
  const rollLine = `${roll.raw} ${sign}${Math.abs(roll.modifier)} → ${roll.total} (threshold: ${dc})`;

  function describeMechanical(m) {
    if (!m) return 'nothing concrete';
    const val = (v) => typeof v === 'object' ? (v[langCode] ?? v.nl ?? JSON.stringify(v)) : v;
    if (m.kind === 'stat') return `stat "${m.field}" ${m.delta >= 0 ? '+' : ''}${m.delta ?? 0}`;
    if (m.kind === 'title') return `title changed to "${val(m.newValue)}"`;
    if (m.kind === 'archetype') return `archetype changed to "${val(m.newValue)}"`;
    if (m.kind === 'lineage') return `lineage changed to "${val(m.newValue)}"`;
    if (m.kind === 'title_worse') return `title worsened to "${val(m.newValue)}"`;
    return JSON.stringify(m);
  }

  const resultDesc = success
    ? `The request succeeds. What changed: ${describeMechanical(mechanical)}.`
    : `The request fails. Michael alters ONE random line of their enrolment out of spite...  not necessarily the field they chose. What worsened: ${describeMechanical(mechanical)}.`;

  // Resolve multilingual fields to active language for the narrative prompt
  const rBefore = {
    archetype: resolveField(characterBefore.archetype, langCode),
    lineage:   resolveField(characterBefore.lineage, langCode),
    title:     resolveField(characterBefore.title, langCode),
  };
  const rAfter = {
    archetype: resolveField(characterAfter.archetype, langCode),
    lineage:   resolveField(characterAfter.lineage, langCode),
    title:     resolveField(characterAfter.title, langCode),
  };

  const response = await client.responses.create({
    model: 'gpt-4.1-mini',
    max_output_tokens: 300,
    input: `
${personaIntro(langCode)} A user is trying to negotiate about their cosmic enrolment in your field campaign.

User's request: "${verzoek}"
${negotiationKind ? `(Wizard: user locked negotiation to **${negotiationKind}** only.)` : ''}
Roll: ${rollLine}...  ${tierLabel}
${resultDesc}
Archetype was: ${rBefore.archetype}, lineage: ${rBefore.lineage}, title: "${rBefore.title}"
Archetype now: ${rAfter.archetype}, lineage: ${rAfter.lineage}, title: "${rAfter.title}"
Verdict now: ${judgementScore}

${success
  ? 'Michael accepts the request...  reluctantly, with little enthusiasm, but the register has been adjusted. He is not pleased about this.'
  : 'Michael rejects the request...  he is not impressed. The registers remain as they are or worsen. He may mock the attempt slightly.'}
${outputInstruction} Formal address (${formalAddress}). ${styleHint}. 2 to 4 sentences. Close with 2 to 4 dots followed by your sign-off name.
    `.trim(),
  });
  return applyChaoticFormatting(response.output[0].content[0].text);
}

/**
 * Michael's in-character narrative for /vergeefmij after the dice roll.
 */
export async function generateForgivenessRollNarrative({
  accepted,
  roll,
  need,
  currentMood,
  newMood,
  judgementScore,
  langCode = 'nl',
}) {
  const lang = getLang(langCode);
  const { outputInstruction, formalAddress, styleHint } = lang.helpers;
  const tierLabels = lang.rollTierLabels;

  const sign = roll.modifier >= 0 ? '+' : '−';
  const tierLabel = tierLabels[roll.tier.key] ?? roll.tier.label;
  const rollLine = `${roll.raw} ${sign}${Math.abs(roll.modifier)} → ${roll.total} (needed: ${need})`;

  const response = await client.responses.create({
    model: 'gpt-4.1-mini',
    max_output_tokens: 220,
    input: `
${personaIntro(langCode)} Someone asks for forgiveness. You have rolled in the higher register.

Roll: ${rollLine}...  ${tierLabel}
Outcome: ${accepted ? 'forgiven (reluctantly)' : 'rejected'}
Current mood: ${currentMood}
${accepted ? `New mood: ${newMood}` : ''}
Verdict after this interaction: ${judgementScore}

${accepted
  ? 'He accepts...  but not warmly. More like a cosmic obligation than grace. Subtly reference the roll.'
  : 'He refuses. The roll was insufficient. He references the failure without calling it a "dice roll" explicitly...  it sounds more like a cosmic verdict.'}
${outputInstruction} Formal address (${formalAddress}). ${styleHint}. 2 to 3 sentences. Close with 2 to 4 dots followed by your sign-off name.
    `.trim(),
  });
  return applyChaoticFormatting(response.output[0].content[0].text);
}

// ─── Feature 5...  Post-message revision ────────────────────────────────────────

export async function generatePostRevision(originalText, mood, langCode = 'nl') {
  const lang = getLang(langCode);
  const { outputInstruction, styleHint } = lang.helpers;

  // Full woedend/streng prompts make the model spam "MORTAL... YOU..." again; edits must be a quieter second beat.
  const revisionMoodDesc =
    mood === 'woedend' || mood === 'streng'
      ? (langCode === 'en'
        ? 'You were harsh in the original line. This add-on is a muttered second thought, second-guess, or softer sting...  NOT another full caps rant.'
        : 'Je was al hard in het origineel. Dit is een nagalm of twijfel, geen tweede volle tirade.')
      : (lang.moodDescriptions[mood] ?? 'Detached and vague.');

  const revisionAntiLoop = langCode === 'en'
    ? 'CRITICAL: Do NOT repeat stock epithets (mortal, dust, worm), ALL CAPS "YOU", or the same imperatives as the main text. Add new substance (doubt, detail, or a different angle).'
    : 'BELANGRIJK: herhaal geen vaste scheldaanhef (sterveling e.d.), dezelfde CAPS-bevelenreeks of het origineel. Voeg iets nieuws toe (twijfel, detail, andere kant).';

  const response = await client.responses.create({
    model: 'gpt-4.1-mini',
    max_output_tokens: 260,
    input: `
${personaIntro(langCode)} You just wrote this:
"${String(originalText).slice(0, 1400)}"

Write ONLY a short afterthought...  as if after sending you realise it wasn't quite right. Begin with "Edit:" then 1 to 2 short sentences (usually 1). Do NOT repeat or rewrite the original. Just the edit line.
${revisionAntiLoop}
Tone: ${mood}...  ${revisionMoodDesc}
${outputInstruction} ${styleHint}. Close with 2 to 4 dots followed by your sign-off name.
    `.trim(),
  });

  return applyChaoticFormatting(response.output[0].content[0].text);
}

function extractInlinePart(response) {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const inline = part.inlineData || part.inline_data;
    if (inline?.data) {
      return {
        buffer: Buffer.from(inline.data, 'base64'),
        mimeType: inline.mimeType || inline.mime_type || 'application/octet-stream',
      };
    }
  }
  if (response.data) {
    const buf = Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data, 'base64');
    return { buffer: buf, mimeType: 'image/png' };
  }
  return null;
}

function pcmToWav(pcmBuffer, { channels = 1, sampleRate = 24000, bitDepth = 16 } = {}) {
  const header = Buffer.alloc(44);
  const dataSize = pcmBuffer.length;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * (bitDepth / 8), 28);
  header.writeUInt16LE(channels * (bitDepth / 8), 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcmBuffer]);
}

/**
 * holy | hell | fart | snide — from mood + judgement toward this user.
 */
export function resolveImagineFlavor(mood, judgementLabel, score = 0) {
  const angry = score <= -2 || mood === 'woedend' || mood === 'passief-agressief' || judgementLabel === 'vermoeiend';
  const holy = score >= 3 || mood === 'kosmisch' || judgementLabel === 'ongewoon helder' || judgementLabel === 'draaglijk';
  if (angry && !holy) return Math.random() < 0.55 ? 'hell' : 'fart';
  if (holy && !angry) return 'holy';
  if (mood === 'streng') return 'snide';
  return 'snide';
}

const IMAGINE_FLAVOR_INSTRUCTIONS = {
  holy: `POSITIVE standing. Recast the request as sacred, biblical, high renaissance: halos, gold leaf, marble, seraphim wings, shafts of light, icons, Old Testament gravity. Keep the user's subject recognisable. Tasteful, not gore.`,
  hell: `ANGRY standing. Recast as infernal / satanic baroque: brimstone, cracked halos, sulphurous sky, grotesque cathedral, fallen angels, too many teeth. Keep the user's subject recognisable. Darkly funny, not pornographic.`,
  fart: `ANGRY / petty standing. Recast as undignified snide comedy: faint fart haze, stained robes, a cherub holding its nose, a trumpet of judgment that is clearly digestive. Keep the user's subject recognisable. Silly, not pornographic.`,
  snide: `LUKEWARM standing. Recast with petty celestial contempt: slightly wrong proportions, a disappointed saint, cheap plastic halo, the subject looking faintly foolish. Keep the user's subject recognisable.`,
};

/**
 * Builds a flavored image prompt, then generates a PNG via Gemini Flash Image.
 * Returns { buffer, mimeType, flavor, imagePrompt }.
 */
export async function generateMichaelImage(userPrompt, { username, mood, judgementLabel, score = 0 } = {}) {
  const flavor = resolveImagineFlavor(mood, judgementLabel, score);
  const flavorHint = IMAGINE_FLAVOR_INSTRUCTIONS[flavor] ?? IMAGINE_FLAVOR_INSTRUCTIONS.snide;
  const safe = String(userPrompt ?? '').replace(/"/g, "'").slice(0, 500);

  const imagePrompt = await geminiText(
    `
You rewrite image prompts for Archangel Michael. Output ONLY the image prompt in English. No quotes, no preamble, no sign-off.
User ${username || 'someone'} asked for: "${safe}"
Michael's current mood: ${mood ?? 'afwezig'}
Michael's verdict on them: ${judgementLabel ?? 'onbeslist'}
Flavor: ${flavor}
${flavorHint}
One dense paragraph, visual and specific, 40 to 90 words.
    `.trim(),
    { maxOutputTokens: 220, temperature: 0.9 },
  );

  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: imagePrompt,
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
    },
  });

  const media = extractInlinePart(response);
  if (!media?.buffer?.length) throw new Error('Gemini image generation returned no image');
  return { ...media, flavor, imagePrompt };
}

/**
 * Spoken advice as WAV (24 kHz PCM wrapped). Returns { wavBuffer, script, flavor }.
 * Gemini TTS accepts natural-language style in the prompt (no separate mood parameter).
 */
export async function generateMichaelVoiceAdvice(userInput, { username, mood, judgementLabel, score = 0, langCode = 'nl' } = {}) {
  const lang = getLang(langCode);
  const { formalAddress, outputInstruction } = lang.helpers;
  const flavor = resolveImagineFlavor(mood, judgementLabel, score);
  const safe = String(userInput ?? '').replace(/"/g, "'").slice(0, 400);
  const moodDesc = lang.moodDescriptions[mood] ?? '';
  const judgementDesc = lang.judgementDescriptions?.[judgementLabel] ?? '';
  const spokenLang = langCode === 'en' ? 'English' : 'Dutch';

  const script = await geminiText(
    `
${personaIntro(langCode)}
${username || 'Someone'} asked you for advice, to be spoken aloud as a voice message. Write ONLY the words you will speak. No stage directions, no asterisks, no "Edit:", no ellipsis spam.
Language: ${spokenLang}. Formal address (${formalAddress}).
User asked: "${safe}"
Your mood toward them now: ${mood ?? 'afwezig'}...  ${moodDesc}
Your standing verdict: ${judgementLabel ?? 'onbeslist'}...  ${judgementDesc}
Speak as a wrathful archangel even if they are tolerable — low, serious, angry undertone always.
${mood === 'woedend' || mood === 'streng' ? 'If furious (woedend): write the entire reply in ALL CAPS so it can be shouted aloud.' : ''}
2 to 4 short spoken sentences. End by saying your name once (${lang.signOff}).
${outputInstruction}
    `.trim(),
    { maxOutputTokens: 220, temperature: 0.8 },
  );

  const spoken = script.replace(/\s+/g, ' ').trim().slice(0, 700);
  const delivery = resolveTtsDelivery(spoken, mood);
  const capsRage = scriptIsCapsRage(spoken, mood);
  const ttsPayload = capsRage ? `${delivery} [shouting] ${spoken}` : `${delivery} ${spoken}`;

  const ttsResponse = await ai.models.generateContent({
    model: TTS_MODEL,
    contents: ttsPayload,
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        languageCode: ttsLanguageCode(langCode),
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: MICHAEL_TTS_VOICE },
        },
      },
    },
  });

  const audio = extractInlinePart(ttsResponse);
  if (!audio?.buffer?.length) throw new Error('Gemini TTS returned no audio');
  const wavBuffer = pcmToWav(audio.buffer);
  return { wavBuffer, script: spoken, flavor };
}
