export const qs = (s, r=document) => r.querySelector(s);
export const el = (tag, attrs={}, ...children) => {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k,v]) => node.setAttribute(k, v));
  children.forEach(c => node.append(c.nodeType ? c : document.createTextNode(c)));
  return node;
};
export const toBlobDownload = (text, filename, type='text/plain') => {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
};
