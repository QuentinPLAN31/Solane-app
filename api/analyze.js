// Serverless function (Vercel Node runtime) — this is the ONLY place your Anthropic API key
// should ever live. It is read from an environment variable, never from the front-end code,
// so it is never sent to the browser and never visible in the page source.
//
// Front-end calls: POST /api/analyze  { photo, lang, skin, concerns, since, goal }
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
 
  const { photo, lang, skin, concerns, since, goal } = req.body || {};
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
 
  const prompt = `You are the analysis engine behind a skincare self-assessment demo app (not a medical device, and not a substitute for seeing a real dermatologist). Look at the attached face photo together with this self-reported context from the user's quiz:
- Skin type: ${skin || 'unknown'}
- Reported concerns: ${(Array.isArray(concerns) && concerns.length ? concerns.join(', ') : 'none specified')}
- How long they've noticed this: ${since || 'unknown'}
- Their goal: ${goal || 'unknown'}
 
Give a realistic, varied assessment based on what is actually visible in the photo (texture, tone evenness, visible pores/blemishes, redness, signs of dryness or oiliness, etc.), combined with the self-reported context above.
 
Respond with ONLY a single JSON object, no markdown fences, no prose before or after, written entirely in ${languageName}, matching exactly this shape:
 
{
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
 
Every field must be genuinely specific to the exact concern(s), skin type and photo you were given — never generic, interchangeable text that could apply to any user. For every score, higher means healthier for that indicator (100 = excellent, 0 = very poor). Vary the numbers realistically based on the photo instead of defaulting to a fixed pattern. Output nothing outside that single JSON object.`;
 
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
        max_tokens: 3200,
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
      console.error('Failed to parse AI JSON:', jsonStr.slice(0, 500));
      return res.status(502).json({ error: 'Could not parse AI JSON response.' });
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
 


