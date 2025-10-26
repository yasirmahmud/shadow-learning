// assets/relevant-swap.js
// Plays a relevant YouTube segment ONCE per page load, then restores the main player.
// Prevents re-triggering even if primaryElapsed > intime after restore.

const courseId = new URLSearchParams(location.search).get('id') || '';
const relevantUrl = './relevant_video.json';

function parseYouTubeId(u){try{const x=new URL(u);if(x.hostname.includes('youtu.be'))return x.pathname.replace(/^\//,'');if(x.hostname.includes('youtube.com'))return x.searchParams.get('v')}catch{}return null}

async function chooseRelevant(){
  try{
    const r = await fetch(relevantUrl,{cache:'no-store'}); if(!r.ok) return null;
    const data = await r.json(); const arr = Array.isArray(data)?data:[data];
    let m = arr.find(x => (x?.course_id||'').toLowerCase()===courseId.toLowerCase()); if(!m) m = arr[0];
    if(!m || m.intime==null || m.start_time==null || m.end_time==null || !m.video_url) return null;
    return { intime:Number(m.intime), start:Number(m.start_time), end:Number(m.end_time), url:String(m.video_url) };
  }catch{return null}
}

function waitFor(fn,{interval=150,timeout=20000}={}){return new Promise(res=>{const t0=Date.now();const id=setInterval(()=>{if(fn()){clearInterval(id);res(true)}else if(Date.now()-t0>timeout){clearInterval(id);res(false)}},interval)})}

(function boot(){
  const start = async ()=>{
    const ready = await waitFor(()=>window.YT && window.player && typeof window.player.getPlayerState==='function',{timeout:20000});
    if(!ready) return;
    const cfg = await chooseRelevant(); if(!cfg) return;
    const { intime, start, end, url } = cfg;
    const vid = parseYouTubeId(url); if(!vid || !(end>start) || !(intime>=0)) return;

    const mainWrap = document.getElementById('wrap') || document.getElementById('player')?.parentElement || null;
    const parent = mainWrap?.parentElement || document.body;
    const secondaryWrap = document.createElement('div'); secondaryWrap.id='secondary-wrap'; secondaryWrap.style.display='none'; secondaryWrap.className = mainWrap?.className || 'yt-wrap yt-16x9';
    const secondaryDiv = document.createElement('div'); secondaryDiv.id='secondary-player'; secondaryWrap.appendChild(secondaryDiv);
    parent.insertBefore(secondaryWrap,(mainWrap?mainWrap.nextSibling:null));

    let primaryElapsed = 0;
    let primaryTimer = null;
    let paused = false;
    let segmentRunning = false;
    let segmentDone = false; // <-- prevents re-trigger
    let secondaryPlayer = null;

    function startPrimaryTimer(){
      if(primaryTimer || segmentRunning) return;
      primaryTimer = setInterval(()=>{
        if(!paused){
          primaryElapsed += 1;
          if(!segmentDone && primaryElapsed >= intime && !segmentRunning){
            runSegment();
          }
        }
      },1000);
    }
    function stopPrimaryTimer(){ if(primaryTimer){ clearInterval(primaryTimer); primaryTimer=null; } }

    function onStateChange(e){
      if(e.data === YT.PlayerState.PLAYING){ paused=false; startPrimaryTimer(); }
      else if(e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.BUFFERING){ paused=true; }
    }
    try{ if(player && player.addEventListener) player.addEventListener('onStateChange', onStateChange);}catch{}
    try{ const st = player.getPlayerState && player.getPlayerState(); if(st===YT.PlayerState.PLAYING) startPrimaryTimer(); }catch{}

    function restorePrimary(resumeTime){
      // Mark segment complete BEFORE timers resume
      segmentDone = true;

      if(secondaryWrap) secondaryWrap.style.display='none';
      if(mainWrap) mainWrap.style.display='';

      try{ secondaryPlayer && secondaryPlayer.stopVideo && secondaryPlayer.stopVideo(); }catch{}
      try{ secondaryPlayer && secondaryPlayer.destroy && secondaryPlayer.destroy(); }catch{}
      secondaryPlayer = null;

      // Keep primaryElapsed capped at intime-1 to avoid any >= checks elsewhere
      primaryElapsed = Math.min(primaryElapsed, Math.max(0, intime-1));

      let attempts=0; const max=20; const t=Math.max(0,resumeTime);
      const retry=setInterval(()=>{
        attempts++;
        try{ player.seekTo(t,true);}catch{}
        try{ player.playVideo(); }catch{}
        try{
          const st = player.getPlayerState && player.getPlayerState();
          if(st===YT.PlayerState.PLAYING){ clearInterval(retry); startPrimaryTimer(); }
        }catch{}
        if(attempts>=max){ clearInterval(retry); }
      },300);
    }

    function startSecondaryTimer(resumeTime){
      const dur = Math.max(0, end-start);
      const t0 = Date.now();
      const id = setInterval(()=>{
        const elapsed = Math.floor((Date.now()-t0)/1000);
        if(elapsed >= dur){
          clearInterval(id);
          restorePrimary(resumeTime);
        }
      },250);
    }

    function runSegment(){
      segmentRunning = true;
      stopPrimaryTimer();
      let resumeTime=0; try{ resumeTime = Math.floor(player.getCurrentTime()||0);}catch{}
      try{ player.pauseVideo(); }catch{}
      if(mainWrap) mainWrap.style.display='none';

      secondaryWrap.style.display='';
      if(secondaryPlayer && secondaryPlayer.destroy){ try{ secondaryPlayer.destroy(); }catch{} secondaryPlayer=null; }
      secondaryPlayer = new YT.Player('secondary-player',{
        videoId: vid,
        playerVars:{ start: Math.max(0,start), rel:0, modestbranding:1, controls:1, iv_load_policy:3 },
        events:{
          onReady:(e)=>{
            try{ e.target.seekTo(Math.max(0,start),true);}catch{}
            try{ e.target.playVideo(); }catch{}
            startSecondaryTimer(resumeTime);
          }
        }
      });
    }
  };

  if(window.YT && window.player) start();
  else window.addEventListener('primary-player-ready', start, { once:true });
})();