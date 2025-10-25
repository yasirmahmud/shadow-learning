export const qs = (s, r=document) => r.querySelector(s);
export const el = (tag, attrs={}, ...children) => {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k,v]) => {
    if (k === 'class') node.className = v;
    else if (k === 'style') node.style.cssText = v;
    else node.setAttribute(k, v);
  });
  children.forEach(c => node.append(c?.nodeType ? c : document.createTextNode(c ?? '')));
  return node;
};
export const storageKey = (courseId) => `answers:${courseId}`;

// ====== SAVE TO GITHUB VIA VERCEL FUNCTION ======
// Set your deployed Vercel base URL (no trailing slash), e.g. "https://your-app.vercel.app"
export const VERCEL_BASE_URL = "https://shadow-learning-git-main-yasirmahmuds-projects.vercel.app";

export async function saveViaVercel(payload){
  if (!VERCEL_BASE_URL || VERCEL_BASE_URL.includes('YOUR-APP')) {
    throw new Error('VERCEL_BASE_URL not configured. Edit assets/ui.js.');
  }
  const res = await fetch(VERCEL_BASE_URL + "/api/save-answers", {
    method: "POST",
    mode: "cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || ('HTTP ' + res.status));
  }
  return await res.json();
}