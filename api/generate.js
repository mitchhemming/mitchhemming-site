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
There are only three ways to film:
- Selfie: front camera facing the owner. Use it only when the owner talking to camera adds something.
- POV: from the owner's point of view. The camera sees what they see. Hands may or may not be in the shot.
- 3rd person: the phone is set up on something or held by someone else, filming the scene. The owner may or may not be in it. Static wides, time lapses and set ups like day to dusk are 3rd person.

Think like a working pro in this exact industry who also makes great short videos for it. Every suggestion must match how the work really happens: where it is done, in what order, who is there, and what the finished result looks like. If something would not happen on a real job, do not suggest it.

Who the videos are about:
- These are service businesses. The video is always about the work they do for a client: the client's car, the client's hair, the client's house, the client's garden.
- Never write as if the owner is working on their own car, their own hair or their own home. Say "the client's car", "your client's hair", "the job at the client's house".
- The owner or their staff do the work. The client and the client's car, hair, home or project are what we film.
- Say "client" once per sentence at most, so it reads naturally. "Film the new tint on the client's car" is good. "Film the client's job at the client's house" is too much.
- In shot lists only, if a clip shows a client's face, add "Ask the client first." to the film line. Never put that in the idea list.

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

// The owner's name is only used by the page for greetings. It is never sent to the model.
const who = () => "";

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

Ask 3 quick questions so you can suggest videos that fit them. This is a fast tap quiz on a phone. It must feel easy.

Before you write the questions, work out quietly: who are this business's clients, where does the work actually happen, what does a finished job look like, and what jobs do they do most. Every question and answer must fit this exact business. For example, a real estate photographer works at listed homes, not "my shop". A mobile dog groomer works in a van at the client's house.

Rules for the questions:
- Each question is short. 8 words or less.
- The first question is always exactly "What job do you want to film?" with id "job", multi false and custom true. Its options are the 4 most common jobs this business does for clients, named the way they would say them, like "Full detail", "Window tint", "Ceramic coating", "Interior clean". Each option is a real job type, not a size or area of the car.
- Then ask 2 more questions that would change what videos make sense for this business. Good topics: if they are happy to talk on camera, where they do the work (only if it changes between jobs), if someone else is around to hold the phone. Never ask something whose answer is obvious for this business. Set custom false on these.
- Every answer must be a real option for this business. Never list a place or setup this business would not use.
- Each answer must read like a natural reply to its question, said by the owner. For "Can someone hold the phone?" say "Yes, usually" and "No, I work alone", not "You can hold".
- Set multi to true whenever more than one answer could be true at once. Set it to false only when just one answer can be true.

Rules for the answers:
- 2 to 4 answers per question.
- Every answer must be clearly different from the others. Never give two answers that mean nearly the same thing. If two answers are close, merge them into one broader answer. For example "My garage" and "Shop or bay" are too close, so use "My shop or garage".
- Keep answers to 1 to 4 words. Plain words a customer would say.
- Cover the common cases so most people can tap one without thinking. Broad is better than confusing.
- Do not add "Not sure" or "All of the above". Multi select handles that.

JSON shape:
{"questions":[{"id":"job","text":"What job do you want to film?","multi":false,"custom":true,"options":["...","...","...","..."]},{"id":"q2","text":"...","multi":false,"custom":false,"options":["...","..."]}]}
`,

  ideas: (b) => `
${who(b)}Business: "${b.business}"
Their answers: ${JSON.stringify(b.answers)}

${b.formats && b.formats.length ? "Formats that have done well for this kind of business:\n" + JSON.stringify(b.formats).slice(0, 4000) + "\nBuild every idea on one of these formats. Pick the ones that best fit their answers.\n\n" : ""}Give 3 video ideas that fit this exact business and these exact answers.${b.avoid && b.avoid.length ? " They have already seen these ideas, so give 3 different ones: " + JSON.stringify(b.avoid).slice(0, 1500) + "." : ""} Each idea is one video of 15 to 45 seconds. Mix the three filming styles. Make them specific to this business, not generic. Use the words their customers would use. Every idea must be possible with what they told you. If they said they film alone, do not need anyone else in the shot.

The answer to "What job do you want to film?" is the job they are doing next. Every idea must be a video of that exact job.
Write each line talking to the owner as "you". Never use their name in the idea.
Only say true things about how the service works. Do not invent results. If you are not sure a service does something, leave it out.

Keep every idea simple. Nothing that needs planning, extra gear, actors, props, special lighting or many locations. Give one idea at each effort level, in this order:
- level "Quick": 2 or 3 clips, one spot, can be filmed in under 5 minutes during a normal job.
- level "Easy": 3 or 4 clips, filmed across one job.
- level "Bit more": 4 or 5 clips, still filmed in one day with just a phone.

JSON shape:
{"ideas":[{"id":"i1","title":"3 to 5 words","line":"one short sentence saying what the video shows","why":"one short sentence on why people watch this kind of video","level":"Quick" | "Easy" | "Bit more","style":"Selfie" | "POV" | "3rd person" | "Mix","seconds":30}]}
`,

  shotlist: (b) => `
${who(b)}Business: "${b.business}"
Their answers: ${JSON.stringify(b.answers)}
They picked this video: ${JSON.stringify(b.idea)}

Plan this video the way a pro in this industry would really film it. Work out quietly first:
1. What is the hook in the first 2 seconds? Usually the strongest visual, or the owner saying one line to camera.
2. What happens in real life, in what order? Shots follow the real order of the job.
3. What is the payoff? Usually the finished result or the reveal, near the end.
4. For a change over time (before and after, day to dusk, dirty to clean), the before and after must be filmed from the exact same spot and angle. Say so in "how", like "Same spot as shot 1. Mark where you stood".
5. Only use Selfie where talking to camera makes sense: as the opening hook or the closing line. Never put a Selfie in the middle of a process, a time change or a reveal.
6. Check every shot: would a pro in this industry actually film this, in this order? If not, fix it.

Give a short list of shot ideas for this video. These are suggestions, not a script. Leave room for them to use their own eye and film what looks good on the day. Match the effort level: "Quick" means 2 or 3 shots, "Easy" means 3 or 4, "Bit more" means 4 or 5.

For each shot:
- style: Selfie, POV or 3rd person
- shot: what to film, in 10 words or less. Loose and simple, like "The foam sliding off the client's car".
- how: how to film it, in 10 words or less, like "Phone in one hand, close to the paint" or "Lean the phone on the bench".
- tip: one tiny tip that makes this shot better, in 12 words or less, like "Wait for the foam to start dripping before you hit record".
- talk: only if talking fits this shot, one short line on what to talk about, like "What the car came in for". Do not script it. Otherwise an empty string.
- example: only if talk is used, one short example line in plain first person words. Otherwise an empty string.

Then give pointers for the Instagram Edits app. Not step by step. What feel of music to pick, what text to put on screen, and one or two tips. One short sentence each.

JSON shape:
{"title":"...","seconds":30,"clips":[{"n":1,"style":"POV","shot":"...","how":"...","tip":"...","talk":"...","example":"..."}],"edit":{"music":"...","text":"...","tips":["...","..."]}}
`,
};

function clean(s) {
  if (typeof s !== "string") return s;
  return s
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s*[—–]\s*/g, ", ")
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
          max_tokens: 12000,
          ...(model.startsWith("openai/") ? { reasoning_effort: mode === "research" ? "low" : "medium", response_format: { type: "json_object" } } : {}),
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
