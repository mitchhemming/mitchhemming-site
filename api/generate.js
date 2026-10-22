// Serverless function: calls the model and returns strict JSON for the Content Made Simple page.
// Runs through Vercel AI Gateway. On Vercel it signs in with the project's OIDC token, so no key is needed.
// AI_GATEWAY_API_KEY is used instead if it is set.

// Tried in order. The first one the free tier allows is used.
const MODELS = [
  "openai/gpt-5-mini",
  "anthropic/claude-haiku-4.5",
  "google/gemini-3.5-flash-lite",
  "google/gemini-2.5-flash-lite",
  "minimax/minimax-m3.1-flash",
];

const RULES = `
You help a busy small business owner make short social media videos on their phone.
They film and edit everything in the Instagram Edits app. Videos are 15 to 45 seconds.
There are only three ways to film: Selfie (front camera, talking to the viewer), POV (phone in one hand, other hand doing the work), 3rd person (phone propped up or held by someone else, the owner is in the shot).

How you must write:
- Grade 5 reading level or simpler. Short words. Short sentences.
- Warm and friendly, like a mate who knows video helping them out. Never stiff, never salesy.
- Never use dashes of any kind. No em dashes, no en dashes, no hyphens between words. Write "3rd person" not "third-person". Use a full stop or a comma instead.
- Never use these words or phrases: no fluff, dive in, elevate, unlock, leverage, seamless, game changer, effortless, delve, showcase, captivate, engaging, compelling, journey, vibrant, dynamic, authentic, resonate, content creation, viewers.
- No emojis. No exclamation marks.
- Do not assume anything about the business. Do not assume they have a shop, staff, customers on site, special equipment, a tripod, or anything else. Only use what they told you.
- Every instruction must be something an 18 year old apprentice could do right now with a phone and nothing else.
- Always reply with valid JSON only. No text before or after the JSON. No markdown fences.
`;

const who = (b) => (b.name ? `The owner's first name is ${String(b.name).slice(0, 40)}.\n` : "");

const PROMPTS = {
  research: (b) => `
The owner said their business does this: "${b.business}"

You are researching short video formats that have done well on Instagram Reels and TikTok for this exact kind of business. Think about the videos in this category that got lots of views, saves and shares over the past few years. Not general tips. Real formats people in this industry use again and again because they work.

List 10 formats. Each one must be specific to this business, not something any business could post. Mix satisfying process videos, before and after, talking tips, behind the scenes, and customer moments.

For each format:
- name: 2 to 5 words
- what: what happens in the video, one short sentence
- why: why people stop and watch, one short sentence

JSON shape:
{"formats":[{"name":"...","what":"...","why":"..."}]}
`,

  questions: (b) => `
${who(b)}The owner said their business does this: "${b.business}"

Ask 3 or 4 quick questions so you can suggest videos that fit them. This is a fast tap quiz on a phone. It must feel easy.

Rules for the questions:
- Each question is short. 8 words or less.
- Ask about different things. Good topics: which of their services they want more of, where they do the work, if they are happy to talk on camera, if someone else is around to hold the phone.
- If the business offers several services, make the first question "Which jobs do you want more of?" with their services as options, and set multi to true.
- Set multi to true whenever more than one answer could be true at once. Set it to false only when just one answer can be true.

Rules for the answers:
- 2 to 4 answers per question.
- Every answer must be clearly different from the others. Never give two answers that mean nearly the same thing. If two answers are close, merge them into one broader answer. For example "My garage" and "Shop or bay" are too close, so use "My shop or garage".
- Keep answers to 1 to 4 words. Plain words a customer would say.
- Cover the common cases so most people can tap one without thinking. Broad is better than confusing.
- Do not add "Not sure" or "All of the above". Multi select handles that.

JSON shape:
{"questions":[{"id":"q1","text":"...","multi":true,"options":["...","..."]}]}
`,

  ideas: (b) => `
${who(b)}Business: "${b.business}"
Their answers: ${JSON.stringify(b.answers)}

${b.formats && b.formats.length ? "Formats that have done well for this kind of business:\n" + JSON.stringify(b.formats).slice(0, 4000) + "\nBuild every idea on one of these formats. Pick the 6 that best fit their answers.\n\n" : ""}Give 6 video ideas that fit this exact business and these exact answers. Each idea is one video of 15 to 45 seconds. Mix the three filming styles. Make them specific to this business, not generic. Use the words their customers would use. Every idea must be possible with what they told you. If they said they film alone, do not need anyone else in the shot.

JSON shape:
{"ideas":[{"id":"i1","title":"3 to 5 words","line":"one short sentence saying what the video shows","why":"one short sentence on why people watch this kind of video","style":"Selfie" | "POV" | "3rd person" | "Mix","seconds":30}]}
`,

  shotlist: (b) => `
${who(b)}Business: "${b.business}"
Their answers: ${JSON.stringify(b.answers)}
They picked this video: ${JSON.stringify(b.idea)}

Write the shot list. 3 to 6 clips, in the order they film them. For each clip:
- style: Selfie, POV or 3rd person
- film: what to point the phone at. One or two short sentences.
- hold: how to hold the phone and for how long. Say to hold it still. Say to film with the phone upright.
- say: if they talk in this clip, the exact words to say. Short, natural, first person, like they would really talk. If they do not talk, use an empty string.
- seconds: how long this clip is in the final video

Then give pointers for the Instagram Edits app. Not step by step. What feel of music to pick, what text to put on screen, and one or two tips. One short sentence each.

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
          max_tokens: 8000,
          ...(model.startsWith("openai/") ? { reasoning_effort: "low", response_format: { type: "json_object" } } : {}),
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
