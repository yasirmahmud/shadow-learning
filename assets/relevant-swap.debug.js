// assets/relevant-swap.debug.js
// Debug build with "once-only" guard to prevent re-trigger.

const LOG=(...a)=>console.log('[swap]',...a), WARN=(...a)=>console.warn('[swap]',...a);
const courseId = new URLSearchParams(location.search).get('id')||'';
const relevantUrl='./relevant_video.json';
function parseYouTubeId(u){try{const x=new URL(u);if(x.hostname.includes('youtu.be'))return x.pathname.replace(/^\//,'');if(x.hostname.includes('youtube.com'))return x.searchParams.get('v')}catch(e){WARN('parse fail',u,e)}return null}
async function chooseRelevant(){try{const r=await fetch(relevantUrl,{cache:'no-store'});LOG('fetch relevant',r.status,r.ok);if(!r.ok)return null;const d=await r.json();const arr=Array.isArray(d)?d:[d];LOG('entries',arr);let m=arr.find(x=>(x?.course_id||'').toLowerCase()===courseId.toLowerCase());if(!m){WARN('no course match; use first');m=arr[0];}if(!m||m.intime==null||m.start_time==null||m.end_time==null||!m.video_url){WARN('bad entry');return null;}return{intime:Number(m.intime),start:Number(m.start_time),end:Number(m.end_time),url:String(m.video_url)};}catch(e){WARN('load fail',e);return null}}
function waitFor(fn,{interval=150,timeout=2e4}={}){return new Promise(res=>{const t0=Date.now();const id=setInterval(()=>{if(fn()){clearInterval(id);res(true)}else if(Date.now()-t0>timeout){clearInterval(id);res(false)}},interval)})}
(function boot(){
  const start=async()=>{
    LOG('wait YT+player');
    const ready=await waitFor(()=>window.YT&&window.player&&typeof window.player.getPlayerState==='function',{timeout:2e4});
    if(!ready) return WARN('player not ready');
    const cfg=await chooseRelevant(); LOG('cfg',cfg); if(!cfg) return;
    const { intime, start, end, url } = cfg; const vid=parseYouTubeId(url); LOG('derived',{intime,start,end,vid}); if(!vid||!(end>start)||!(intime>=0)) return WARN('invalid derived');
    const mainWrap=document.getElementById('wrap')||document.getElementById('player')?.parentElement||null;
    const parent=mainWrap?.parentElement||document.body;
    const secondaryWrap=document.createElement('div'); secondaryWrap.id='secondary-wrap'; secondaryWrap.style.display='none'; secondaryWrap.className=mainWrap?.className||'yt-wrap yt-16x9';
    const secondaryDiv=document.createElement('div'); secondaryDiv.id='secondary-player'; secondaryWrap.appendChild(secondaryDiv);
    parent.insertBefore(secondaryWrap,(mainWrap?mainWrap.nextSibling:null));
    let primaryElapsed=0, primaryTimer=null, paused=false, segmentRunning=false, segmentDone=false, secondaryPlayer=null;
    function startPrimaryTimer(){ if(primaryTimer||segmentRunning) return; LOG('startPrimaryTimer'); primaryTimer=setInterval(()=>{ if(!paused){ primaryElapsed+=1; LOG('primary elapsed =',primaryElapsed,'intime =',intime,'segmentDone =',segmentDone); if(!segmentDone && primaryElapsed>=intime && !segmentRunning){ LOG('trigger swap'); runSegment(); } } },1000); }
    function stopPrimaryTimer(){ if(primaryTimer){ LOG('stopPrimaryTimer'); clearInterval(primaryTimer); primaryTimer=null; } }
    function onStateChange(e){ LOG('onStateChange:',e?.data); if(e.data===YT.PlayerState.PLAYING){ paused=false; startPrimaryTimer(); } else if(e.data===YT.PlayerState.PAUSED || e.data===YT.PlayerState.BUFFERING){ paused=true; } }
    try{ if(player&&player.addEventListener) player.addEventListener('onStateChange',onStateChange);}catch{}
    try{ const st=player.getPlayerState&&player.getPlayerState(); LOG('initial state',st); if(st===YT.PlayerState.PLAYING) startPrimaryTimer(); }catch{}
    function restorePrimary(resumeTime){
      LOG('restorePrimary at',resumeTime);
      segmentDone=true; // <-- prevent future triggers
      if(secondaryWrap) secondaryWrap.style.display='none';
      if(mainWrap) mainWrap.style.display='';
      try{ secondaryPlayer&&secondaryPlayer.stopVideo&&secondaryPlayer.stopVideo(); }catch{}
      try{ secondaryPlayer&&secondaryPlayer.destroy&&secondaryPlayer.destroy(); }catch{} secondaryPlayer=null;
      primaryElapsed = Math.min(primaryElapsed, Math.max(0, intime-1)); // keep below threshold
      let attempts=0; const max=20; const t=Math.max(0,resumeTime);
      const retry=setInterval(()=>{
        attempts++; 
        try{ player.seekTo(t,true);}catch{} 
        try{ player.playVideo(); }catch{} 
        try{ const st=player.getPlayerState&&player.getPlayerState(); LOG('resume attempt',attempts,'state',st); if(st===YT.PlayerState.PLAYING){ clearInterval(retry); startPrimaryTimer(); } }catch{} 
        if(attempts>=max){ clearInterval(retry); WARN('autoplay blocked; user interaction needed'); }
      },300);
    }
    function startSecondaryTimer(resumeTime){ const dur=Math.max(0,end-start); LOG('startSecondaryTimer for',dur); const t0=Date.now(); const id=setInterval(()=>{ const elapsed=Math.floor((Date.now()-t0)/1000); LOG('secondary elapsed =',elapsed); if(elapsed>=dur){ clearInterval(id); LOG('secondary finished; restoring main video at',resumeTime); restorePrimary(resumeTime); } },250); }
    function runSegment(){ segmentRunning=true; stopPrimaryTimer(); let resumeTime=0; try{ resumeTime=Math.floor(player.getCurrentTime()||0);}catch{} LOG('pausing main at',resumeTime); try{ player.pauseVideo(); }catch{} if(mainWrap) mainWrap.style.display='none'; secondaryWrap.style.display=''; if(secondaryPlayer&&secondaryPlayer.destroy){ try{ secondaryPlayer.destroy(); }catch{} secondaryPlayer=null; } LOG('create secondary vid',vid,'start',start); secondaryPlayer=new YT.Player('secondary-player',{ videoId:vid, playerVars:{ start:Math.max(0,start), rel:0, modestbranding:1, controls:1, iv_load_policy:3 }, events:{ onReady:(e)=>{ LOG('secondary onReady'); try{ e.target.seekTo(Math.max(0,start),true);}catch{} try{ e.target.playVideo(); }catch{} startSecondaryTimer(resumeTime); } } }); }
  };
  if(window.YT&&window.player) start(); else window.addEventListener('primary-player-ready',start,{once:true});
})();