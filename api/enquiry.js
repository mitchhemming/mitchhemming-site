// Work with me enquiries. Emails each enquiry through Resend.
// Needs these Vercel environment variables:
//   RESEND_API_KEY  the Resend API key
//   ENQUIRY_TO      where enquiries are sent (your inbox)
//   ENQUIRY_FROM    optional sender, e.g. "Mitch Hemming <hello@mhemming.com>" once the domain is verified in Resend.
//                   Until then Resend's test sender is used, which can only send to the Resend account owner's email.

const clip = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

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

  const key = process.env.RESEND_API_KEY, to = process.env.ENQUIRY_TO;
  if (!key || !to) { console.error("enquiry email not configured"); res.statusCode = 503; return res.end(); }

  const rows = [
    ["Name", d.name], ["Email", d.email], ["Business", d.business],
    ["Website / IG", d.link || "-"], ["Needs", d.services.join(", ") || "-"],
  ];
  const html =
    `<h2>New work with me enquiry</h2><table cellpadding="6">` +
    rows.map(([k, v]) => `<tr><td><b>${k}</b></td><td>${esc(v)}</td></tr>`).join("") +
    `</table><p><b>What's taking up too much time</b></p><p>${esc(d.message).replace(/\n/g, "<br>")}</p>`;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.ENQUIRY_FROM || "Work with me <onboarding@resend.dev>",
        to: to.split(",").map((s) => s.trim()),
        reply_to: d.email,
        subject: `Enquiry: ${d.business} (${d.name})`,
        html,
      }),
    });
    if (!r.ok) { console.error("resend", r.status, (await r.text()).slice(0, 300)); res.statusCode = 502; return res.end(); }
    res.statusCode = 204; res.end();
  } catch (e) {
    console.error("resend failed", e && e.message);
    res.statusCode = 502; res.end();
  }
};
