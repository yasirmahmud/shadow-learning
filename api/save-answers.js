// /api/save-answers.js (Vercel Serverless Function)
// Commits answers JSON into your GitHub repo using the REST API.
// Required env vars in Vercel Project Settings -> Environment Variables:
//   GITHUB_TOKEN (fine-grained PAT with contents:write to the target repo)
//   REPO_OWNER   (e.g., "your-username")
//   REPO_NAME    (repo that will store answers)
//   REPO_BRANCH  (optional, default "main")
//
// CORS: allow requests from anywhere or set a specific origin below.

export default async function handler(req, res) {
  const allowOrigin = process.env.CORS_ALLOW_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  try {
    const body = req.body || {};
    if (!body.course || !body.answers) {
      return res.status(400).send("Invalid payload. Expect {course, savedAt?, answers}");
    }

    const owner  = process.env.REPO_OWNER;
    const repo   = process.env.REPO_NAME;
    const branch = process.env.REPO_BRANCH || "main";
    const token  = process.env.GITHUB_TOKEN;

    if (!owner || !repo || !token) {
      return res.status(500).send("Server not configured. Missing env vars.");
    }

    const ts = (body.savedAt ? new Date(body.savedAt) : new Date()).toISOString().replace(/[:.]/g,"-");
    const path = `answers/${body.course}/${ts}.json`;
    const contentStr = JSON.stringify(body, null, 2);
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;

    const ghRes = await fetch(apiUrl, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      body: JSON.stringify({
        message: `Save answers for ${body.course} at ${ts}`,
        content: Buffer.from(contentStr, "utf8").toString("base64"),
        branch
      })
    });

    if (!ghRes.ok) {
      const txt = await ghRes.text();
      return res.status(502).send(`GitHub error: ${txt}`);
    }
    const data = await ghRes.json();
    return res.status(200).json({ ok: true, path, commit: data.commit?.sha });
  } catch (err) {
    return res.status(500).send(err?.message || "Unknown error");
  }
}
