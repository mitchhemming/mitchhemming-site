// Serverless function: calls the model and returns strict JSON for the Content Made Simple page.
// Runs through Vercel AI Gateway. On Vercel it signs in with the project's OIDC token, so no key is needed.
// AI_GATEWAY_API_KEY is used instead if it is set.

// Tried in order. The first one the free tier allows is used.
const MODELS = [
  "anthropic/claude-haiku-4.5",
  "google/gemini-3.5-flash-lite",
  "openai/gpt-5-mini",
  "google/gemini-2.5-flash-lite",
  "minimax/minimax-m3.1-flash",
];

const RULES = `
You help a busy small business owner make short social media videos on their phone.
They film and edit everything in the Instagram Edits app. Videos are 15 to 45 seconds.
There are only three ways to film: Selfie (front camera, talking to the viewer), POV (phone in one hand, other hand doing the work), 3rd person (phone propped up or held by someone else, the owner is in the shot).

How you must write:
- Grade 5 reading level or simpler. Short words. Short sentences.
- Talk like a mate explaining it in the car park. Plain and friendly.
- Never use dashes of any kind. No em dashes, no en dashes, no hyphens between words. Write "3rd person" not "third-person". Write "B roll" not "B-roll". Use a full stop or a comma instead.
- Never use these words or phrases: no fluff, dive in, elevate, unlock, leverage, seamless, game changer, effortless, delve, showcase, captivate, engaging, compelling, journey, vibrant, dynamic, authentic, resonate.
- No emojis. No exclamation marks.
- Do not assume anything about the business. Do not assume they have a shop, staff, customers on site, a car hoist, a tripod, or anything else. If you need to know, ask.
- Every instruction must be something an 18 year old apprentice could do right now with a phone and nothing else.
- Always reply with valid JSON only. No text before or after the JSON. No markdown fences.
`;

const PROMPTS = {
  questions: ({ business }) => `
The owner said their business does this: "${business}"

Ask 2 to 4 short questions you need answered before you can give them good video ideas and shot lists. Only ask what you truly need. Good things to ask about: where the work happens, whether the owner is happy to talk on camera, whether there is anyone else around to hold the phone, what the finished result of the work looks like, how long a job takes.

Each question gets 2 to 4 tap answers. Keep answers to a few words.

JSON shape:
{"questions":[{"id":"q1","text":"...","options":["...","..."]}]}
`,

  ideas: ({ business, answers }) => `
Business: "${business}"
Their answers: ${JSON.stringify(answers)}

Give 6 video ideas that fit this exact business and these exact answers. Each idea is one video of 15 to 45 seconds. Mix the three filming styles. Make them specific to this business, not generic. Use the words a customer of this business would use.

JSON shape:
{"ideas":[{"id":"i1","title":"3 to 5 words","line":"one short sentence saying what the video shows","style":"Selfie" | "POV" | "3rd person" | "Mix","seconds":30}]}
`,

  shotlist: ({ business, answers, idea }) => `
Business: "${business}"
Their answers: ${JSON.stringify(answers)}
They picked this video: ${JSON.stringify(idea)}

Write the shot list. 3 to 6 clips, in the order they film them. For each clip say:
- style: Selfie, POV or 3rd person
- film: what to point the phone at, in one or two short sentences
- hold: how to hold the phone and for how long. Always say to hold it still. Always say to film vertical.
- say: if they talk in this clip, give them the exact words to say, short and natural, in the first person. If they do not talk, use an empty string.
- seconds: how long this clip should be in the final video

Then give editing pointers for the Instagram Edits app. Not step by step. Just: what music feel to pick, what text to put on screen, one or two tips. Keep each to one short sentence.

JSON shape:
{"title":"...","seconds":30,"clips":[{"n":1,"style":"POV","film":"...","hold":"...","say":"...","seconds":5}],"edit":{"music":"...","text":"...","tips":["...","..."]}}
`,
};

function clean(s) {
  if (typeof s !== "string") return s;
  return s
    .replace(/[—–]/g, ",")
    .replace(/(\w)-(\w)/g, "$1 $2")
    .replace(/\s+,/g, ",")
    .replace(/ +/g, " ")
    .trim();
}

function deepClean(v) {
  if (Array.isArray(v)) return v.map(deepClean);
  if (v && typeof v === "object") {
    const o = {};
    for (const k of Object.keys(v)) o[k] = deepClean(v[k]);
    return o;
  }
  return clean(v);
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const key = process.env.AI_GATEWAY_API_KEY || req.headers["x-vercel-oidc-token"] || process.env.VERCEL_OIDC_TOKEN;
  if (!key) return res.status(500).json({ error: "no_key" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const { mode } = body || {};
  if (!PROMPTS[mode]) return res.status(400).json({ error: "bad_mode" });
  if (!body.business || String(body.business).length > 300) return res.status(400).json({ error: "bad_business" });

  try {
    let text = "", used = "", lastErr = "";
    for (const model of MODELS) {
      const r = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + key },
        body: JSON.stringify({
          model,
          max_tokens: 1500,
          messages: [
            { role: "system", content: RULES },
            { role: "user", content: PROMPTS[mode](body) },
          ],
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) { text = String(data?.choices?.[0]?.message?.content || "").trim(); used = model; break; }
      lastErr = data?.error?.message || String(r.status);
    }
    if (!used) return res.status(502).json({ error: "model", detail: lastErr });
    res.setHeader("X-Model", used);
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const parsed = JSON.parse(text.slice(start, end + 1));
    return res.status(200).json(deepClean(parsed));
  } catch (e) {
    return res.status(502).json({ error: "parse", detail: String(e.message || e) });
  }
};
