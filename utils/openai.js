import 'dotenv/config';
import OpenAI from "openai";
import { getLang } from './lang/index.js';
import { resolveField } from './michael-memory.js';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 20000,  // 20 s per attempt — rejects hung requests so the catch block can fire
  maxRetries: 1,   // 1 auto-retry on timeout/network error → 40 s worst case (fine, Discord gives 15 min after defer)
});

// Applies chaotic spacing/punctuation and strips forbidden characters.
// The sign-off (including multilingual variants) is handled by the model prompt.
function applyChaoticFormatting(text) {
  return text
    // Strip any [...] placeholders the model might generate when it runs out of space
    .replace(/\s*\[\.\.\.[\s.]*\]/g, '')
    // Remove em-dashes and en-dashes — replace with spaced ellipsis
    .replace(/\s*[—–]\s*/g, '...  ')
    // After any ellipsis NOT inside brackets: 2–5 extra spaces
    .replace(/(?<!\[)\.\.\.+(?!\s*\])/g, (m) => m + ' '.repeat(Math.floor(Math.random() * 4) + 2))
    // After comma: randomly pad
    .replace(/, /g, () => Math.random() < 0.55 ? ',   ' : ',  ')
    // After semicolon: always pad
    .replace(/; /g, () => ';   ')
    // Randomly insert extra spaces before a word (roughly 1 in 7 word boundaries)
    .replace(/ ([A-Za-zÀ-ÿ\u0600-\u06FF]{3,})/g, (match, word) =>
      Math.random() < 0.14 ? '   ' + word : match
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
 * For Arabic mode this is Imru' al-Qais in Arabic; otherwise Archangel Michael in English.
 */
function personaIntro(langCode) {
  if (langCode === 'ar') {
    return 'أنت امرؤ القيس — الشاعر الجاهلي الكندي المُتعالي. في كل ردٍّ ضع بيتاً شعرياً واحداً على الأقل — موزوناً أو شبه موزون، لا نثراً مُسمَّى شعراً. أسلوبك مُتعالٍ، درامي، قادر على الهجاء والسخرية.';
  }
  return 'You are the Archangel Michael.';
}

/** User message names Israel/Palestine/zionism (state) — Michael must go ballistic (not limited to random flare). */
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
    ? (langCode === 'nl'
        ? `\nLangetermijnindruk van Michaël over deze gebruiker (gevormd door eerdere gesprekken): "${impression}"\n`
        : langCode === 'en'
          ? `\nMichael's long-term impression of this user (formed over previous conversations): "${impression}"\n`
          : `\nنظرة امرئ القيس الطويلة الأمد عن هذا المستخدم (تكوَّنت عبر محادثات سابقة): "${impression}"\n`)
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
    ? `Lengte — richtlijn (niet star):
- Meestal 1 à 2 korte regels — bondig en leesbaar in Discord; liever te kort dan te lang
- Langere reacties ALLEEN als het onderwerp er echt om vraagt (bv. Israel-trigger)
- Rond altijd netjes af (naam, punt); nooit afgekapt
- Geen opsommingen met bullets
${lengthSignoffDefault}`
    : langCode === 'en'
      ? `Length — guideline (not rigid):
- Usually 1 to 2 short lines — concise and readable in Discord; err on the side of brevity
- Longer only if the topic genuinely demands it (e.g. Israel-trigger)
- Always close neatly (name, period); never cut off mid-sentence
- No bullet point lists
${lengthSignoffDefault}`
      : `الطول — إرشاد (ليس صارماً):
- عادةً سطر إلى سطرَين — موجز وقابل للقراءة في Discord؛ الإيجاز أفضل من الإطالة
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

  // ── Arabic-only: mandatory poetry line + tone biases ─────────────────────────
  const poetryRequirementBlock = langCode === 'ar'
    ? `\nإلزام شعري: ضع في ردك بيتاً شعرياً واحداً على الأقل — قد يكون أصيلاً أو مستوحىً من الشعر الجاهلي. البيت يجب أن يكون موزوناً أو شبه موزون، لا نثراً مُسمَّى شعراً. يمكن أن يكون في صلب الرد أو في ختامه.\n`
    : '';

  // هجاء bias: when the user has a low judgement score, lean into satirical mockery
  const hijaBlock = langCode === 'ar' && (judgementLabel === 'vermoeiend' || judgementLabel === 'twijfelachtig')
    ? `\nميل: هذا الشخص يستحق الهجاء الشعري أكثر من المديح — دع القصيد يُعبِّر عن ازدرائك بأناقة جاهلية.\n`
    : '';

  // Lyrical bias: when the mood is calm or cosmic, lean melancholic and contemplative
  const lyricBlock = langCode === 'ar' && (mood === 'kosmisch' || mood === 'afwezig' || mood === 'loom')
    ? `\nميل: المزاج اليوم يميل إلى الغنائية والحنين — شعرٌ يبكي الأطلال أو يتأمل الليل الطويل.\n`
    : '';

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
        ? 'Je mag dit subtiel meenemen in je antwoord als het relevant aanvoelt (12% kans al getrokken door de caller) — noem de stats of titel nooit letterlijk tenzij het heel natuurlijk past.'
        : langCode === 'en'
          ? 'You may subtly include this in your response if it feels relevant (12% chance already drawn by the caller) — never name the stats or title literally unless it fits very naturally.'
          : 'يمكنك تضمين هذا بشكل خفي في ردك إن شعر بأنه مناسب (احتمال 12% تم السحب بالفعل) — لا تذكر الإحصائيات أو اللقب حرفياً إلا إن جاء بشكل طبيعي جداً.'
    }\n` : ''}${israelTopicBlock}${antiZionismFlareBlock}${poetryRequirementBlock}${hijaBlock}${lyricBlock}
${lang.userAttribution(username, userInput)}
    `.trim(),
  });

  const generated = applyChaoticFormatting(response.output[0].content[0].text);
  return israelTopicHit
    ? generated
    : clampToMaxSentences(generated, 2, lang.signOff);
}

// ─── Aura check ───────────────────────────────────────────────────────────────

export async function generateAuraCheck(targetUsername, judgementLabel, impression, currentMood, cosmicRole, langCode = 'nl') {
  const lang = getLang(langCode);
  const { outputInstruction, signOff, formalAddress, styleHint } = lang.helpers;

  const impressionBlock = impression
    ? `\nLong-term impression of Michael about this person: "${impression}"\n`
    : '\nMichael has little experience with this person.\n';

  const cosmicBlock = cosmicRoleBlock(lang, cosmicRole);

  const response = await client.responses.create({
    model: 'gpt-4.1-mini',
    max_output_tokens: 240,
    input: `
${personaIntro(langCode)} ${langCode === 'ar'
  ? `يُطلب منك قراءة هالة شخص آخر: ${targetUsername}. اكتب قراءةً قصيرة وشعرية — استخدم صور الأطلال والبرق والليل بدل الشاكرا.`
  : `Someone asks you to read the aura of another person: ${targetUsername}. Write a short, vague, slightly uncomfortable aura reading in your characteristic style. Use spiritual language: energy field, chakras, vibration, aura, colour, light, gaps, misalignment. Be subtly judgemental about what you "see" — as if you notice something but prefer not to say too much. The tone is typically Michael: formal address (${formalAddress}), strangely specific, mildly unsettling but not alarming, dry.`}
Usually 2 to 3 sentences; may be slightly longer to close neatly. No therapy-speak. No advice.${impressionBlock}${cosmicBlock}
Current judgement of ${targetUsername}: ${judgementLabel ?? 'onbeslist'}
Current mood: ${currentMood ?? 'afwezig'}
${outputInstruction}
${signOff} Close with 2 to 5 dots followed by your sign-off name.
${styleHint}
    `.trim(),
  });

  return applyChaoticFormatting(response.output[0].content[0].text);
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
${langCode === 'ar'
  ? 'لخِّص في جملتين قصيرتين ما يرى فيه امرؤ القيس هذا الشخص بناءً على رسائله. اكتب بضمير المتكلم بنبرة الشاعر الجاهلي المتعالي. كن محدداً في الأنماط التي تراها.'
  : 'Summarise in at most 2 short sentences what impression the Archangel Michael has formed of a person based on the messages below. Write in first person as Michael, in his characteristic vague spiritual style. Be specific about patterns you see in the questions.'}
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
+1 = friendly, compliment, love, praise, apology, gratitude — even if brief
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
    a: 'the user said nothing and simply left — Michael responded to the silence',
    b: 'the user sent a message back — Michael read it and responded',
    c: 'the user asked if Michael was okay — Michael does not know what to do with this',
  }[morningChoice] ?? 'the user did something unexpected';

  const response = await client.responses.create({
    model: 'gpt-4.1-mini',
    max_output_tokens: 180,
    input: `
${personaIntro(langCode)} ${langCode === 'ar'
  ? `في صباح ما بعد الموعد ترسل رسالة قصيرة إلى ${username}. الموعد انتهى على نحو أفضل مما كنت تتوقع — وهذا يُزعجك. السياق: ${choiceContext}. اكتب رسالة قصيرة شعرية. غامضة ولكن مُوجِعة. 1 إلى 2 جملة.`
  : `The morning after a date you send a short message to ${username}. The date ended well — perhaps too well. You are not used to this feeling. Context: ${choiceContext}. Write a short, cryptic message. Not too warm. Not too cold. Strangely specific. Formal but slightly different than usual. 1 to 2 sentences.`}
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
    ? `\nCosmic role: ${resolveField(character.archetype, langCode)} (${resolveField(character.lineage, langCode)}) — ${resolveField(character.title, langCode)}\nStats: aura ${character.stats?.aura ?? '?'}, discipline ${character.stats?.discipline ?? '?'}, chaos ${character.stats?.chaos ?? '?'}, insight ${character.stats?.inzicht ?? '?'}, perseverance ${character.stats?.volharding ?? '?'}`
    : '';

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    max_output_tokens: 80,
    input: `
${personaIntro(langCode)} ${langCode === 'ar'
  ? `أصدِر حكماً شعرياً موجزاً على ${username}. جملتان كحد أقصى، لا قوائم، لا نصائح. النبرة: متعالية، هجاء خفيف أو مديح محتشم حسب الحكم. ضع بيتاً أو شبه بيت.`
  : `Give a brief, personal verdict on ${username}. Maximum two sentences. No numbered list, no advice, no elaboration. Pure voice: formal address (${formalAddress}), strangely terse, mildly judgemental or uncomfortably appreciative depending on the verdict.`}
${outputInstruction}
Close with ....your-sign-off-name.${cosmicBlock}${characterBlock}
Verdict: ${judgementLabel}
Long-term impression: ${impressionText}
    `.trim(),
  });

  return applyChaoticFormatting(response.output[0].content[0].text);
}

// ─── Feature 1 — Delayed consequence / unfinished business callback ───────────

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
${personaIntro(langCode)} ${langCode === 'ar'
  ? `لم تنتهِ من محادثة سابقة مع ${username}. تعود الآن إلى تلك اللحظة المُعلَّقة — شعرياً، بلا تهديد صريح، لكن بوجود يُزعج.`
  : `You have not let go of something from an earlier conversation with ${username}. You circle back to that unresolved moment now — not threatening, but present and slightly uncomfortable.`}
${cosmicBlock}
This lingered: "${item.prompt}"
Why it didn't sit right: ${item.reason}

Current tone: ${mood} — ${moodDesc}
Verdict on ${username}: ${judgementLabel} — ${judgementDesc}

Write 1 to 3 short sentences (usually 2). Refer fluidly to what was said earlier — paraphrase, never quote literally.
${langCode === 'ar' ? 'اجعله يشبه الهجاء المتأخر أو القلق المُعلَّق — غامض لكن محدَّد بما يكفي ليُزعج.' : 'Make it feel like delayed resentment or a lingering concern — vague but specific enough to feel uncomfortable.'}
${outputInstruction} Formal address (${formalAddress}). ${styleHint}. Close with 2 to 5 dots followed by your sign-off name.
    `.trim(),
  });

  return applyChaoticFormatting(response.output[0].content[0].text);
}

// ─── Kosmische rollenspel ─────────────────────────────────────────────────────

/**
 * Generate a new Michael-assigned character sheet for a user.
 * Returns a plain object — caller must normalize + persist.
 */
/**
 * Ask Michael to generate a new value for one character field (archetype, lineage, or title)
 * in all three languages based on what the user requested in their negotiation.
 * Returns { nl, en, ar }.
 */
export async function generateCharacterFieldChange(kind, { verzoek, characterBefore, langCode }) {
  const currentNl = resolveField(characterBefore[kind], 'nl');
  const currentEn = resolveField(characterBefore[kind], 'en') || currentNl;
  const currentAr = resolveField(characterBefore[kind], 'ar') || currentNl;

  const hints = {
    archetype: 'Archetypes are cosmic role labels e.g. "wandering monk", "shadow clerk", "mist bard", "hedge seer", "void practitioner". Keep them short (1–3 words).',
    lineage:   `Lineages are species or bloodlines. If the user NAMES a concrete RPG ancestry (tiefling, elf, dwarf, orc, halfling, dragonborn, etc.), you MUST use that exact ancestry in the English string (standard spelling). Do NOT replace it with a vague poetic label like "shadow-touched mortal" or "infernal-adjacent mortal" — the named species must appear. For vague requests only, you may invent a short poetic lineage (1–3 words each language).`,
    title:     'Titles are epithets appended to the name e.g. "of hesitant questions", "with the contested seal", "of the second act". Keep them under 10 words.',
  }[kind] ?? '';

  try {
    const response = await client.responses.create({
      model: 'gpt-4.1-mini',
      max_output_tokens: 130,
      input: `
You are Michael (Archangel in Dutch/English, Imru' al-Qais the classical Arabic poet in Arabic), maintaining a cosmic RPG register.

A user's negotiation succeeded. Their request: "${verzoek}"

Current ${kind}:
- Dutch: "${currentNl}"
- English: "${currentEn}"
- Arabic: "${currentAr}"

Generate a new ${kind} that honors the request. ${hints}
Keep Arabic in the style of Imru' al-Qais — poetic, ancient, weighty epithets.
Keep Dutch/English in Michael's cosmic bureaucratic register.

Return ONLY a JSON object (no markdown, no extra text):
{"nl": "...", "en": "...", "ar": "..."}
      `.trim(),
    });
    const raw = response.output[0].content[0].text.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    // Ensure all three languages are present; fall back to source lang if missing
    return {
      nl: parsed.nl || currentNl,
      en: parsed.en || currentEn,
      ar: parsed.ar || currentAr,
    };
  } catch {
    return { nl: currentNl, en: currentEn, ar: currentAr };
  }
}

/**
 * After a failed negotiation: rewrite one field to something worse / petty / embarrassing (not the user's wish).
 * Returns { nl, en, ar }.
 */
export async function generateCharacterFieldPunishment(kind, { verzoek, characterBefore, langCode, wishedField = null }) {
  const currentNl = resolveField(characterBefore[kind], 'nl');
  const currentEn = resolveField(characterBefore[kind], 'en') || currentNl;
  const currentAr = resolveField(characterBefore[kind], 'ar') || currentNl;

  const hints = {
    archetype: 'Short cosmic role labels (1–3 words). Make it diminished, ridiculous, or a bureaucratic downgrade — not cool, not what they asked.',
    lineage:   'Short species or bloodline (1–3 words each language). Invent something petty or awkward — not a power fantasy. Vague poetic is fine; do not grant a “premium” ancestry.',
    title:     'Epithets under 10 words. Something the register would add as a snub — whining, provisional, “of the refiled seal”, etc.',
  }[kind] ?? '';

  const fieldHint = wishedField
    ? (langCode === 'ar'
      ? `(كانوا يطمحون لتغيير **${wishedField}**؛ عاقبهم في حقل **${kind}**.)`
      : `(They were bargaining over **${wishedField}**; punish them by twisting **${kind}** instead.)`)
    : '';

  try {
    const response = await client.responses.create({
      model: 'gpt-4.1-mini',
      max_output_tokens: 130,
      input: `
You are Michael (Archangel in Dutch/English, Imru' al-Qais in Arabic), maintaining a cosmic RPG register.

The user's negotiation FAILED. Their plea was: "${verzoek}"
${fieldHint}

Rewrite ONLY their ${kind} to something worse — petty, embarrassing, bureaucratically belittling, or cosmically inconvenient. It must NOT grant what they wanted. Keep it PG. ${hints}
Keep Arabic in Imru' al-Qais style — sharp, ancient, a little cruel.
Keep Dutch/English in Michael's cold cosmic register.

Current ${kind}:
- Dutch: "${currentNl}"
- English: "${currentEn}"
- Arabic: "${currentAr}"

Return ONLY a JSON object (no markdown, no extra text):
{"nl": "...", "en": "...", "ar": "..."}
      `.trim(),
    });
    const raw = response.output[0].content[0].text.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    return {
      nl: parsed.nl || currentNl,
      en: parsed.en || currentEn,
      ar: parsed.ar || currentAr,
    };
  } catch {
    return { nl: currentNl, en: currentEn, ar: currentAr };
  }
}

/**
 * Translate archetype, lineage and title from one language to the other two.
 * Returns a partial {nl?, en?, ar?} object for each field.
 */
async function translateCharacterFields({ archetype, lineage, title }, fromLang) {
  const others = ['nl', 'en', 'ar'].filter(l => l !== fromLang);
  const langNames = { nl: 'Dutch', en: 'English', ar: 'Arabic' };
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

Translate to ${others.map(l => langNames[l]).join(' and ')}.
For Arabic keep the style of Imru' al-Qais — poetic, ancient, weighty epithets.
For Dutch/English keep the cosmic bureaucratic angelic register.

Return ONLY a JSON object (no markdown):
{
  "${others[0]}": { "archetype": "...", "lineage": "...", "title": "..." },
  "${others[1]}": { "archetype": "...", "lineage": "...", "title": "..." }
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
${langCode === 'ar' ? 'ملاحظة: الألقاب واللقب يجب أن تكون بنبرة الشاعر الجاهلي — فيها ازدراء أنيق أو ثقل ملحمي.' : ''}

Generate one JSON object with EXACTLY these fields:
{
  "archetype": "<choice from the list above or small variation>",
  "lineage": "<choice from the list above or small variation>",
  "title": "<epithet in Michael's style>",
  "stats": {
    "aura": <integer 3–18>,
    "discipline": <integer 3–18>,
    "chaos": <integer 3–18>,
    "inzicht": <integer 3–18>,
    "volharding": <integer 3–18>
  }
}

${cs.schemaInstruction}
    `.trim(),
  });

  const fallback = {
    archetype: { nl: 'zwerfmonnik', en: 'wandering monk', ar: 'الراهب التائه' },
    lineage:   { nl: 'sterveling', en: 'mortal', ar: 'فانٍ' },
    title:     { nl: 'van de onduidelijke afstemming', en: 'of unclear attunement', ar: 'ذو الانسجام الغامض' },
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

  // Translate archetype, lineage, title to the other two languages
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
${personaIntro(langCode)} ${langCode === 'ar'
  ? `تُراجع تسجيل ${username} في ديوانك الكوني:`
  : `You review the cosmic enrolment of ${username} in your field campaign:`}
- ${langCode === 'ar' ? 'النمط' : 'Archetype'}: ${archetype}
- ${langCode === 'ar' ? 'السلالة' : 'Lineage'}: ${lineage}
- ${langCode === 'ar' ? 'اللقب' : 'Title'}: ${title}
- ${langCode === 'ar' ? 'الإحصائيات' : 'Stats'}: ${statNames.aura ?? 'aura'} ${stats.aura}, ${statNames.discipline ?? 'discipline'} ${stats.discipline}, ${statNames.chaos ?? 'chaos'} ${stats.chaos}, ${statNames.inzicht ?? 'inzicht'} ${stats.inzicht}, ${statNames.volharding ?? 'volharding'} ${stats.volharding}
- ${langCode === 'ar' ? 'حكمك عليه' : 'Your verdict on them'}: ${judgementLabel ?? 'onbeslist'}
- ${langCode === 'ar' ? 'مزاجك' : 'Your mood'}: ${currentMood ?? 'afwezig'}

${langCode === 'ar'
  ? 'اكتب جملةً أو جملتين شعريتين كردِّ فعل على هذا الملف — كأنك تقرأ الديوان وتلاحظ شيئاً. نبرة: متعالية، مُستعلية خفيفاً، جادة. المستخدم لم يختر هذا التسجيل.'
  : 'Write one to two short sentences of reaction on this profile — as if you are checking the register and noticing something. Tone: distant, mildly condescending, serious. The user had no say in their assignment.'}
${outputInstruction} Formal address (${formalAddress}). ${styleHint}. Close with 2–4 dots followed by your sign-off name.
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
    : `The request fails. Michael alters ONE random line of their enrolment out of spite — not necessarily the field they chose. What worsened: ${describeMechanical(mechanical)}.`;

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
${personaIntro(langCode)} ${langCode === 'ar'
  ? `يحاول مستخدم التفاوض على تسجيله في ديوانك الكوني.`
  : `A user is trying to negotiate about their cosmic enrolment in your field campaign.`}

${langCode === 'ar' ? 'طلب المستخدم' : "User's request"}: "${verzoek}"
${negotiationKind ? (langCode === 'ar' ? `(المستخدم حدَّد الحقل: **${negotiationKind}** — معالج التفاوض.)` : `(Wizard: user locked negotiation to **${negotiationKind}** only.)`) : ''}
${langCode === 'ar' ? 'الرمية' : 'Roll'}: ${rollLine} — ${tierLabel}
${resultDesc}
${langCode === 'ar' ? 'النمط كان' : 'Archetype was'}: ${rBefore.archetype}, ${langCode === 'ar' ? 'السلالة' : 'lineage'}: ${rBefore.lineage}, ${langCode === 'ar' ? 'اللقب' : 'title'}: "${rBefore.title}"
${langCode === 'ar' ? 'النمط الآن' : 'Archetype now'}: ${rAfter.archetype}, ${langCode === 'ar' ? 'السلالة' : 'lineage'}: ${rAfter.lineage}, ${langCode === 'ar' ? 'اللقب' : 'title'}: "${rAfter.title}"
${langCode === 'ar' ? 'الحكم الآن' : 'Verdict now'}: ${judgementScore}

${langCode === 'ar'
  ? (success
    ? 'قبِلتَ الطلب — مُرغَماً، بلا حماس، لكن الديوان تعدَّل. لست مسروراً بهذا.'
    : 'رفضتَ الطلب — غير مُبهَر. الديوان يبقى كما هو أو يسوء. يمكنك السخرية الشعرية من المحاولة.')
  : (success
    ? 'Michael accepts the request — reluctantly, with little enthusiasm, but the register has been adjusted. He is not pleased about this.'
    : 'Michael rejects the request — he is not impressed. The registers remain as they are or worsen. He may mock the attempt slightly.')}
${outputInstruction} Formal address (${formalAddress}). ${styleHint}. 2–4 sentences. Close with 2–4 dots followed by your sign-off name.
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
${personaIntro(langCode)} ${langCode === 'ar'
  ? 'يطلب منك شخص العفو. أُلقيت القرعة في الديوان الأعلى.'
  : 'Someone asks for forgiveness. You have rolled in the higher register.'}

${langCode === 'ar' ? 'الرمية' : 'Roll'}: ${rollLine} — ${tierLabel}
${langCode === 'ar' ? 'النتيجة' : 'Outcome'}: ${accepted ? (langCode === 'ar' ? 'مغفور (مُرغَماً)' : 'forgiven (reluctantly)') : (langCode === 'ar' ? 'مرفوض' : 'rejected')}
${langCode === 'ar' ? 'المزاج الحالي' : 'Current mood'}: ${currentMood}
${accepted ? `${langCode === 'ar' ? 'المزاج الجديد' : 'New mood'}: ${newMood}` : ''}
${langCode === 'ar' ? 'الحكم بعد هذه اللحظة' : 'Verdict after this interaction'}: ${judgementScore}

${langCode === 'ar'
  ? (accepted
    ? 'تقبَل العفو — لكن بدون دفء. كأنه التزام شعري لا رحمة. أشِر خفيةً إلى القرعة.'
    : 'ترفض العفو. الرمية كانت قاصرة. أشِر إلى الفشل دون تسميته "نرداً" — يبدو كحكم شعري كوني.')
  : (accepted
    ? 'He accepts — but not warmly. More like a cosmic obligation than grace. Subtly reference the roll.'
    : 'He refuses. The roll was insufficient. He references the failure without calling it a "dice roll" explicitly — it sounds more like a cosmic verdict.')}
${outputInstruction} Formal address (${formalAddress}). ${styleHint}. 2–3 sentences. Close with 2–4 dots followed by your sign-off name.
    `.trim(),
  });
  return applyChaoticFormatting(response.output[0].content[0].text);
}

// ─── Feature 5 — Post-message revision ────────────────────────────────────────

export async function generatePostRevision(originalText, mood, langCode = 'nl') {
  const lang = getLang(langCode);
  const { outputInstruction, styleHint } = lang.helpers;

  const moodDesc = lang.moodDescriptions[mood] ?? 'Detached and vague.';

  const response = await client.responses.create({
    model: 'gpt-4.1-mini',
    max_output_tokens: 260,
    input: `
${personaIntro(langCode)} ${langCode === 'ar'
  ? 'كتبتَ للتو هذا:'
  : 'You just wrote this:'}
"${String(originalText).slice(0, 1400)}"

${langCode === 'ar'
  ? 'اكتب فقط تعقيباً قصيراً — كأنك بعد الإرسال أدركتَ أن البيت لم يكن مكتملاً. ابدأ بـ"تعقيب:" ثم جملة أو اثنتان (عادةً جملة واحدة). لا تُعد كتابة الرد الأصلي كاملاً.'
  : 'Write ONLY a short afterthought — as if after sending you realise it wasn\'t quite right. Begin with "Edit:" then 1 to 2 short sentences (usually 1). Do NOT repeat or rewrite the original. Just the edit line.'}
Tone: ${mood} — ${moodDesc}
${outputInstruction} ${styleHint}. Close with 2 to 4 dots followed by your sign-off name.
    `.trim(),
  });

  return applyChaoticFormatting(response.output[0].content[0].text);
}
