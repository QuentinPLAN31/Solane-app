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
  "routinePM": ["<short step>", "<short step>", "<short step>", "<short step>"],
  "products": [
    {"name": "<product type and key ingredient>", "desc": "<one short sentence>", "moment": "<morning label in ${languageName}>"},
    {"name": "<product type and key ingredient>", "desc": "<one short sentence>", "moment": "<evening label in ${languageName}>"}
  ],
  "lifestyle": ["<short tip>", "<short tip>", "<short tip>"],
  "mistakes": ["<short common mistake>", "<short common mistake>", "<short common mistake>"]
}

For every score, higher means healthier for that indicator (100 = excellent, 0 = very poor). Vary the numbers realistically based on the photo instead of defaulting to a fixed pattern. Output nothing outside that single JSON object.`;

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
        max_tokens: 1400,
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
