// ui.js (updated to include laptop backend connector)

export const VERCEL_BASE_URL = ""; // keep this for your GitHub saving API

// === Local laptop backend (ngrok / Cloudflare Tunnel) ===
export const LOCAL_BACKEND = "https://saunciest-unethereal-clora.ngrok-free.dev";

// Optional: if you set BACKEND_SECRET in your local .env, put the same value here.
// export const BACKEND_SECRET = "some-long-random-string";

export async function askLaptop(payload) {
  const headers = { "Content-Type": "application/json" };
  // if (typeof BACKEND_SECRET === "string") headers["x-backend-secret"] = BACKEND_SECRET;

  const res = await fetch(`${LOCAL_BACKEND}/api/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json(); // { ok: true, reply: "..." }
}

// --- other existing functions like qs, el, saveViaVercel stay unchanged ---
