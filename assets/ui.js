// ui.js — full helper set + laptop backend connector

// Tiny DOM helpers
export const qs = (s, r=document) => r.querySelector(s);
export const el = (t, a={}, ...c) => {
  const n = document.createElement(t);
  Object.entries(a).forEach(([k,v]) => {
    if (k === 'class') n.className = v;
    else if (k === 'style') n.style.cssText = v;
    else n.setAttribute(k, v);
  });
  c.forEach(x => n.append(x?.nodeType ? x : document.createTextNode(x ?? '')));
  return n;
};

// Local storage key for per-course answers
export const storageKey = (id) => `answers:${id}`;

// --- GitHub save via Vercel serverless endpoint (same-origin) ---
export const VERCEL_BASE_URL = ""; // leave empty to use current origin

export async function saveViaVercel(payload) {
  const origin = VERCEL_BASE_URL || window.location.origin;
  const url = origin.replace(/\/$/, '') + '/api/save-answers';
  const same = origin === window.location.origin;
  const res = await fetch(url, {
    method: 'POST',
    mode: same ? 'same-origin' : 'cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const txt = await res.text().catch(()=>'');
    throw new Error(txt || ('HTTP ' + res.status));
  }
  return res.json();
}

// --- Local laptop backend (ngrok / Cloudflare Tunnel) ---
export const LOCAL_BACKEND = "http://localhost:8787"; // <— replace with your URL
// export const BACKEND_SECRET = "some-long-random-string"; // optional

export async function askLaptop(payload) {
  const headers = { 'Content-Type': 'application/json' };
  // if (typeof BACKEND_SECRET === 'string') headers['x-backend-secret'] = BACKEND_SECRET;

  const res = await fetch(`${LOCAL_BACKEND}/api/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
