export const qs=(s,r=document)=>r.querySelector(s);
export const el=(t,a={},...c)=>{const n=document.createElement(t);Object.entries(a).forEach(([k,v])=>{if(k==='class')n.className=v;else if(k==='style')n.style.cssText=v;else n.setAttribute(k,v)});c.forEach(x=>n.append(x?.nodeType?x:document.createTextNode(x??'')));return n;};
export const storageKey=(id)=>`answers:${id}`;
// Same-origin Vercel API by default
export const VERCEL_BASE_URL="";
export async function saveViaVercel(payload){
  const origin=VERCEL_BASE_URL||window.location.origin;
  const url=origin.replace(/\/$/,'')+'/api/save-answers';
  const same=origin===window.location.origin;
  const res=await fetch(url,{method:'POST',mode:same?'same-origin':'cors',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(!res.ok){const txt=await res.text().catch(()=>'' );throw new Error(txt||('HTTP '+res.status));}
  return await res.json();
}