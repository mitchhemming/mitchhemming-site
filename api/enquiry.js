// Work with me enquiries. Forwards each enquiry to Mitch's inbox through FormSubmit (formsubmit.co).
// Sent from the server so the inbox address never appears in the page.
// The first enquiry triggers a one-time FormSubmit activation email; click it and every enquiry after arrives normally.
// ENQUIRY_TO in Vercel overrides the default inbox.

const TO = process.env.ENQUIRY_TO || "mitch@aventusmedia.com.au";

const clip = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return {}; }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") { res.statusCode = 405; return res.end(); }
  const b = await readJson(req);

  // Bots fill the hidden field. Pretend it worked.
  if (b.company_site) { res.statusCode = 204; return res.end(); }

  const d = {
    name: clip(b.name, 100),
    email: clip(b.email, 200),
    business: clip(b.business, 150),
    link: clip(b.link, 200),
    message: clip(b.message, 4000),
    services: Array.isArray(b.services) ? b.services.slice(0, 12).map((s) => clip(s, 40)).filter(Boolean) : [],
  };
  if (!d.name || !d.business || !d.message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) {
    res.statusCode = 400; return res.end();
  }

  // Always lands in the Vercel function logs as a backup.
  console.log("enquiry", JSON.stringify(d));

  try {
    const r = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(TO)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Origin: "https://mitchhemming.com",
        Referer: "https://mitchhemming.com/work",
      },
      body: JSON.stringify({
        _subject: `Work with me enquiry: ${d.business} (${d.name})`,
        _replyto: d.email,
        _template: "table",
        _captcha: "false",
        Name: d.name,
        Email: d.email,
        Business: d.business,
        "Website / IG": d.link || "-",
        "Needs help with": d.services.join(", ") || "-",
        "What's taking up too much time": d.message,
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || String(j.success) === "false") {
      console.error("formsubmit", r.status, JSON.stringify(j).slice(0, 300));
      // Before activation FormSubmit replies that it needs confirming. The enquiry is still in the logs.
      if (/activat/i.test(JSON.stringify(j))) { res.statusCode = 204; return res.end(); }
      res.statusCode = 502; return res.end();
    }
    res.statusCode = 204; res.end();
  } catch (e) {
    console.error("formsubmit failed", e && e.message);
    res.statusCode = 502; res.end();
  }
};
