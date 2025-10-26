// Debug build of the responsive popup swapper with detailed logs.

const LOG=(...a)=>console.log('[swap]',...a), WARN=(...a)=>console.warn('[swap]',...a);
const courseId = new URLSearchParams(location.search).get('id')||'';
const relevantUrl='./relevant_video.json';

function parseYouTubeId(u){try{const x=new URL(u);if(x.hostname.includes('youtu.be'))return x.pathname.replace(/^\//,'');if(x.hostname.includes('youtube.com'))return x.searchParams.get('v')}catch(e){WARN('parse fail',u,e)}return null}
async function chooseRelevant(){try{const r=await fetch(relevantUrl,{cache:'no-store'});LOG('fetch relevant',r.status,r.ok);if(!r.ok)return null;const d=await r.json();const arr=Array.isArray(d)?d:[d];LOG('entries',arr);let m=arr.find(x=>(x?.course_id||'').toLowerCase()===courseId.toLowerCase());if(!m){WARN('no course match; using first');m=arr[0];}if(!m||m.intime==null||m.start_time==null||m.end_time==null||!m.video_url){WARN('bad entry');return null;}return{intime:+m.intime,start:+m.start_time,end:+m.end_time,url:String(m.video_url)} }catch(e){WARN('load fail',e);return null} }
function waitFor(fn,{interval=150,timeout=2e4}={}){return new Promise(res=>{const t0=Date.now();const id=setInterval(()=>{if(fn()){clearInterval(id);res(true)}else if(Date.now()-t0>timeout){clearInterval(id);res(false)}},interval)})}

function ensureModal(){
  if(document.getElementById('rs-modal')) return document.getElementById('rs-modal');
  if(!document.getElementById('rs-modal-style')){
    const css=`#rs-modal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.6);z-index:9999}
#rs-modal .rs-panel{background:#fff;border-radius:14px;box-shadow:0 12px 28px rgba(0,0,0,.24);width:min(1100px,96vw);padding:16px 16px 20px;display:flex;flex-direction:column;gap:12px}
#rs-modal .rs-head{display:flex;align-items:center;justify-content:space-between}
#rs-modal .rs-title{margin:0;font:600 18px/1.3 system-ui,Segoe UI,Roboto;color:#0021A5}
#rs-modal .rs-close{appearance:none;border:0;background:transparent;font-size:22px;line-height:1;cursor:pointer;color:#444;padding:4px}
#rs-modal .rs-player{position:relative;width:100%;max-width:100%;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:#000}
#rs-modal .rs-player iframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:block}`.trim();
    const style=document.createElement('style'); style.id='rs-modal-style'; style.textContent=css; document.head.appendChild(style);
  }
  const modal=document.createElement('div'); modal.id='rs-modal';
  modal.innerHTML=`<div class="rs-panel" role="dialog" aria-modal="true" aria-label="Helpful video">
    <div class="rs-head"><h3 class="rs-title">Videos you might find helpful</h3><button class="rs-close" type="button" aria-label="Close">✕</button></div>
    <div class="rs-player"><div id="secondary-player"></div></div>
  </div>`;
  document.body.appendChild(modal);
  return modal;
}

(function boot(){
  const start=async()=>{
    LOG('wait YT+player');
    const ready=await waitFor(()=>window.YT&&window.player&&typeof window.player.getPlayerState==='function',{timeout:2e4});
    if(!ready) return WARN('player not ready');
    const cfg=await chooseRelevant(); LOG('cfg',cfg); if(!cfg) return;
    const { intime, start:segStart, end:segEnd, url } = cfg; const vid=parseYouTubeId(url);
    LOG('derived',{intime: intime, segStart, segEnd, vid});
    if(!vid||!(segEnd>segStart)||!(intime>=0)) return WARN('invalid segment');

    let primaryElapsed=0, primaryTimer=null, paused=false, segmentRunning=false, segmentDone=false, secondaryPlayer=null, lastResumeTime=0;

    function startPrimaryTimer(){ if(primaryTimer||segmentRunning) return; LOG('startPrimaryTimer'); primaryTimer=setInterval(()=>{ if(!paused){ primaryElapsed+=1; LOG('primary elapsed =',primaryElapsed,'target =',intime,'done =',segmentDone); if(!segmentDone && primaryElapsed>=intime && !segmentRunning){ LOG('trigger swap'); runSegment(); } } },1000); }
    function stopPrimaryTimer(){ if(primaryTimer){ LOG('stopPrimaryTimer'); clearInterval(primaryTimer); primaryTimer=null; } }
    function onStateChange(e){ LOG('onStateChange',e?.data); if(e.data===YT.PlayerState.PLAYING){ paused=false; startPrimaryTimer(); } else if(e.data===YT.PlayerState.PAUSED||e.data===YT.PlayerState.BUFFERING){ paused=true; } }
    try{ if(player&&player.addEventListener) player.addEventListener('onStateChange',onStateChange);}catch{}
    try{ const st=player.getPlayerState&&player.getPlayerState(); LOG('initial state',st); if(st===YT.PlayerState.PLAYING) startPrimaryTimer(); }catch{}

    function showModal(){ const m=ensureModal(); m.style.display='flex'; return m; }
    function hideModal(){ const m=document.getElementById('rs-modal'); if(m) m.style.display='none'; }
    function attachClose(resume){ const m=document.getElementById('rs-modal'), btn=m?.querySelector('.rs-close'); if(btn) btn.onclick=()=>restorePrimary(resume); const esc=(ev)=>{ if(ev.key==='Escape') restorePrimary(resume); }; document.addEventListener('keydown',esc,{once:true}); }

    function fitToContainer(instance){
      const container=document.querySelector('#rs-modal .rs-player');
      if(!container||!instance||!instance.setSize) return;
      try{ instance.setSize(container.clientWidth, container.clientHeight); }catch{}
    }

    function restorePrimary(resume){
      LOG('restorePrimary at',resume);
      segmentDone=true;
      hideModal();
      try{ secondaryPlayer&&secondaryPlayer.stopVideo&&secondaryPlayer.stopVideo(); }catch{}
      try{ secondaryPlayer&&secondaryPlayer.destroy&&secondaryPlayer.destroy(); }catch{} secondaryPlayer=null;
      primaryElapsed=Math.min(primaryElapsed,Math.max(0,intime-1));
      let attempts=0; const max=20; const t=Math.max(0,resume);
      const retry=setInterval(()=>{ attempts++; try{ player.seekTo(t,true);}catch{} try{ player.playVideo(); }catch{} try{ const st=player.getPlayerState&&player.getPlayerState(); LOG('resume attempt',attempts,'state',st); if(st===YT.PlayerState.PLAYING){ clearInterval(retry); startPrimaryTimer(); } }catch{} if(attempts>=max){ clearInterval(retry); WARN('autoplay blocked; user action may be required'); } },300);
    }

    function startSecondaryTimer(resume){ const dur=Math.max(0,segEnd-segStart); LOG('startSecondaryTimer',dur); const t0=Date.now(); const id=setInterval(()=>{ const el=Math.floor((Date.now()-t0)/1000); LOG('secondary elapsed =',el); if(el>=dur){ clearInterval(id); LOG('secondary finished'); restorePrimary(resume); } },250); }

    function runSegment(){
      segmentRunning=true; stopPrimaryTimer();
      try{ lastResumeTime=Math.floor(player.getCurrentTime()||0);}catch{ lastResumeTime=0; }
      LOG('pause main at',lastResumeTime); try{ player.pauseVideo(); }catch{}
      const modal=showModal(); attachClose(lastResumeTime);
      if(secondaryPlayer&&secondaryPlayer.destroy){ try{ secondaryPlayer.destroy(); }catch{} secondaryPlayer=null; }

      LOG('create secondary',vid,'start',segStart);
      secondaryPlayer=new YT.Player('secondary-player',{
        videoId:vid,
        width:'100%',
        height:'100%',
        playerVars:{ start:Math.max(0,segStart), rel:0, modestbranding:1, controls:1, iv_load_policy:3 },
        events:{ onReady:(e)=>{ LOG('secondary onReady'); try{ e.target.seekTo(Math.max(0,segStart),true);}catch{} try{ e.target.playVideo(); }catch{} const container=document.querySelector('#rs-modal .rs-player'); const ro=new ResizeObserver(()=>fitToContainer(secondaryPlayer)); if(container) ro.observe(container); setTimeout(()=>fitToContainer(secondaryPlayer),0); setTimeout(()=>fitToContainer(secondaryPlayer),200); startSecondaryTimer(lastResumeTime); } }
      });
    }
  };

  if(window.YT&&window.player) start();
  else window.addEventListener('primary-player-ready', start, { once:true });
})();
