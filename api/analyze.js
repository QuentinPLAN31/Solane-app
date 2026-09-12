// Serverless function (Vercel Node runtime) — this is the ONLY place your Anthropic API key
// should ever live. It is read from an environment variable, never from the front-end code,
// so it is never sent to the browser and never visible in the page source.
//
// Front-end calls: POST /api/analyze  { photo, lang, skin, concerns, since, goal, habits }
// This function calls the Anthropic Messages API (Claude, with vision) and returns a JSON
// report matching the shape the front-end (index.html) expects.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server misconfigured: ANTHROPIC_API_KEY is not set.' });
  }

  const { photo, lang, skin, concerns, since, goal, habits } = req.body || {};
  if (!photo || typeof photo !== 'string') {
    return res.status(400).json({ error: 'Missing "photo" (data URL) in request body.' });
  }

  const match = /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i.exec(photo);
  if (!match) {
    return res.status(400).json({ error: 'photo must be a base64 data URL (image/png, jpeg or webp).' });
  }
  let mediaType = match[1].toLowerCase();
  if (mediaType === 'image/jpg') mediaType = 'image/jpeg';
  const base64Data = match[2];

  const LANG_NAMES = { fr: 'French', en: 'English', de: 'German', it: 'Italian' };
  const languageName = LANG_NAMES[lang] || 'French';

  const prompt = `You are the analysis engine behind a skincare self-assessment demo app (not a medical device, and not a substitute for seeing a real dermatologist). Look CAREFULLY at the attached face photo. You are also given this self-reported context from the user's quiz:
- Skin type: ${skin || 'unknown'}
- Reported concerns: ${(Array.isArray(concerns) && concerns.length ? concerns.join(', ') : 'none specified')}
- How long they've noticed this: ${since || 'unknown'}
- Their goal: ${goal || 'unknown'}
- Reported lifestyle habits: ${(Array.isArray(habits) && habits.length ? habits.join(', ') : 'none specified')}

CRITICAL RULE — the photo is the source of truth, the quiz answers are only context: base concernName, causes, sevKey, scores and "observed" on what is ACTUALLY VISIBLE in the photo. The self-reported concerns and habits above exist to help you explain likely CAUSES of what you see and to write more relevant routine/lifestyle/nutrition advice — they are NOT a checklist to confirm. If the user reported a concern (e.g. "acne") that you do NOT actually see in the photo, do NOT mention it as observed, do NOT make it the concernName, and do NOT describe it as present anywhere in your answer — describe only what is genuinely visible. Conversely, if you see something in the photo the user did not report, you may still mention it — real observation always wins over self-report. Never pad the analysis with a symptom just because it was selected in the quiz.

Give a realistic, varied assessment based on what is actually visible in the photo (texture, tone evenness, visible pores/blemishes, redness, signs of dryness or oiliness, etc.), using the self-reported context only to explain causes and personalize advice.

Respond with ONLY a single JSON object, no markdown fences, no prose before or after, written entirely in ${languageName}, matching exactly this shape:

{
  "observed": "<a single flowing paragraph (3-5 sentences, plain personal language, no medical jargon, no markdown, no bullet points, in ${languageName}) that EXPLICITLY connects the self-reported quiz answers (reported concerns and lifestyle habits) with what you genuinely see in THIS photo, states this with full confidence (you HAVE already looked at the photo — never say or imply that a photo analysis is still needed, that you 'would need to see' something, or any other hedge along those lines; you are looking at it right now), and explicitly names the probable cause(s) of what you see (e.g. lack of sleep, stress, sun exposure, diet, dehydration — pick from the reported habits when relevant, otherwise the most plausible general cause). Confirm what matches (e.g. 'you mentioned X, and indeed the photo shows...'), and just as importantly, point out any mismatch — a concern the user reported that is NOT actually visible in the photo, or something visible that they didn't mention. This must read like someone who actually looked carefully at both the person's answers and their face and is telling them honestly and confidently what they found and why — never a generic skincare paragraph that could apply to anyone, and never a paragraph that hedges or defers to a future analysis.>",
  "scores": {"hydratation": <integer 0-100>, "uv": <integer 0-100>, "inflammation": <integer 0-100>, "vieillissement": <integer 0-100>, "imperfections": <integer 0-100>},
  "globalScore": <integer 0-100>,
  "sevKey": "sevLow" | "sevMed" | "sevHigh",
  "concernName": "<short name (2-4 words) of the main concern observed, in ${languageName}>",
  "causes": "<2-3 sentences explaining likely causes, referencing both the photo and the reported context, in ${languageName}>",
  "routineAM": ["<short step>", "<short step>", "<short step>"],
  "routineAMWhy": ["<1 sentence explaining why this exact morning step helps, in ${languageName}>", "<...>", "<...>"],
  "routinePM": ["<short step>", "<short step>", "<short step>", "<short step>"],
  "routinePMWhy": ["<1 sentence explaining why this exact evening step helps, in ${languageName}>", "<...>", "<...>", "<...>"],
  "products": [
    {"type": "cleanser|serum|cream|sunscreen|gel|oil|mask", "moment": "<morning or evening label in ${languageName}>", "brand": "<a real, widely-available skincare brand, e.g. La Roche-Posay, CeraVe, Bioderma, Avène, The Ordinary, L'Oréal Paris, Paula's Choice>", "name": "<the real product line/name from that brand>", "ref": "<key active ingredient or product type, in ${languageName}>", "price": "<realistic price in euros, formatted like '16,50 €'>", "desc": "<one short sentence in ${languageName}>", "effect": "<1-2 sentences on how it actually acts on this specific concern and when to expect results, in ${languageName}>"}
  ],
  "lifestyle": ["<short tip>", "<short tip>", "<short tip>"],
  "lifestyleWhy": ["<1 sentence explaining why this tip matters, in ${languageName}>", "<...>", "<...>"],
  "mistakes": ["<short common mistake>", "<short common mistake>", "<short common mistake>"],
  "mistakesWhy": [
    {"why": "<1 sentence: why this mistake makes things worse, in ${languageName}>", "fix": "<1 sentence: what to do instead, in ${languageName}>"},
    {"why": "<...>", "fix": "<...>"},
    {"why": "<...>", "fix": "<...>"}
  ],
  "nutritionPlan": {
    "intro": "<1-2 sentences on how diet relates to this specific concern, in ${languageName}>",
    "favor": ["<food/nutrient to favour>", "<food/nutrient to favour>", "<food/nutrient to favour>", "<food/nutrient to favour>"],
    "favorWhy": ["<1 short sentence explaining why, in ${languageName}>", "<...>", "<...>", "<...>"],
    "avoid": ["<food/habit to limit>", "<food/habit to limit>", "<food/habit to limit>"],
    "avoidWhy": ["<1 short sentence explaining why, in ${languageName}>", "<...>", "<...>"],
    "day": {"breakfast": "<example breakfast>", "lunch": "<example lunch>", "snack": "<example snack>", "dinner": "<example dinner>"}
  },
  "evolution": ["<what to expect in weeks 1-2, in ${languageName}>", "<what to expect around week 4, in ${languageName}>", "<what to expect after 8-12 weeks, in ${languageName}>"],
  "evolutionWhy": ["<1 sentence on why this timeline is realistic for this concern, in ${languageName}>", "<...>", "<...>"]
}

IMPORTANT — products must be exactly 4 items (not 2, not 3 — exactly 4), and every one of them must be a gentle, widely-tolerated, over-the-counter product that is safe for general home use without a prescription or medical supervision (no prescription-strength retinoids, no strong chemical peels, no products requiring a dermatologist to dispense). Every single product MUST include a non-empty "effect" field — a product without one will be rejected entirely. If an active is potent (e.g. retinol, AHA/BHA), pick a low, beginner-friendly concentration and mention the gentler framing in "desc" or "effect". Use only real, existing skincare products and brands you actually know (do not invent fictitious brand names), and give realistic, currently-plausible euro prices — this is informational, not a live store.

Every "*Why" array (routineAMWhy, routinePMWhy, lifestyleWhy, mistakesWhy, favorWhy, avoidWhy, evolutionWhy) is REQUIRED and MUST have exactly the same number of items, in the same order, as the array it explains — a response missing any of these, or with a mismatched length, will have that entire section discarded and replaced by a generic fallback, which produces a worse result for the user. Double-check every array length before responding.

"observed" is REQUIRED and must be a single paragraph (not a list, not separate bullet-style sentences glued together) that explicitly ties the quiz answers to the real photo evidence — it is not enough to just restate what the user reported, and not enough to just describe the photo in isolation; the value is in the CONNECTION between the two ("you said X — the photo confirms/doesn't show that, and also shows Y"). This is the very first thing shown to the user (even those who haven't paid), so it must feel immediately accurate, personal and honest, like someone really compared their answers against their actual face. It must ALWAYS state the probable cause(s) of what is observed, and it must NEVER say or imply that a photo analysis is still needed, still to come, or would help confirm anything — you already have the photo and are analyzing it right now, so speak with full confidence about what you see.

Every field must be genuinely specific to the exact concern(s), skin type and photo you were given — never generic, interchangeable text that could apply to any user. For every score, higher means healthier for that indicator (100 = excellent, 0 = very poor). Vary the numbers realistically based on the photo instead of defaulting to a fixed pattern. Remember the CRITICAL RULE above: the photo overrides the quiz whenever they disagree. Output nothing outside that single JSON object.`;

  try {
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
        max_tokens: 4600,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
              { type: 'text', text: prompt }
            ]
          }
        ]
      })
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('Anthropic API error', apiRes.status, errText);
      return res.status(502).json({ error: 'AI provider returned an error.' });
    }

    const data = await apiRes.json();
    const textBlock = (data.content || []).find((b) => b.type === 'text');
    if (!textBlock || !textBlock.text) {
      return res.status(502).json({ error: 'AI response had no text content.' });
    }

    let jsonStr = textBlock.text.trim();
    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      console.error('AI response was not JSON:', jsonStr.slice(0, 500));
      return res.status(502).json({ error: 'AI response was not valid JSON.' });
    }
    jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      /* Long prose fields (like the "observed" paragraph) sometimes come back
         with literal raw newlines/tabs inside a JSON string value instead of
         escaped "\n" — strictly invalid JSON, but trivially fixable: any raw
         control character (0x00-0x1F) simply becomes a plain space, which
         never changes the meaning of prose text. Retry once with that fix
         before giving up. */
      try {
        const sanitized = jsonStr.replace(/[\x00-\x1F]+/g, ' ');
        parsed = JSON.parse(sanitized);
        console.error('AI JSON needed control-character sanitization to parse (recovered).');
      } catch (e2) {
        console.error('Failed to parse AI JSON:', e2.message, '| raw (first 800 chars):', jsonStr.slice(0, 800));
        return res.status(502).json({ error: 'Could not parse AI JSON response.' });
      }
    }

    if (!parsed.scores) {
      return res.status(502).json({ error: 'AI JSON was missing "scores".' });
    }

    return res.status(200).json(parsed);
  } catch (e) {
    console.error('analyze.js error:', e);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
