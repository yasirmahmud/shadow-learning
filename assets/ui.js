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
export const VERCEL_BASE_URL = "";
export async function saveViaVercel(payload){
  const origin = VERCEL_BASE_URL || window.location.origin;
  const url = origin.replace(/\/$/, '') + '/api/save-answers';
  const sameOrigin = origin === window.location.origin;
  const res = await fetch(url, {
    method: 'POST',
    mode: sameOrigin ? 'same-origin' : 'cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const txt = await res.text().catch(()=>'');
    throw new Error(txt || ('HTTP '+res.status));
  }
  return await res.json();
}