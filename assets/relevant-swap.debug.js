// assets/relevant-swap.debug.js
// Debug-enhanced version of the timed relevant video swapper.
// Logs every step so you can see what's happening in DevTools.

const DBG = (...args) => console.log("[swap]", ...args);
const WARN = (...args) => console.warn("[swap]", ...args);
const ERR = (...args) => console.error("[swap]", ...args);

const courseId = new URLSearchParams(location.search).get('id') || '';
DBG("current courseId:", courseId);

const relevantUrl = './relevant_video.json';

function parseYouTubeId(u) {
  try {
    const url = new URL(u);
    if (url.hostname.includes('youtu.be')) return url.pathname.replace(/^\//, '');
    if (url.hostname.includes('youtube.com')) return url.searchParams.get('v');
  } catch (e) {
    WARN("parseYouTubeId failed for", u, e);
  }
  return null;
}

async function chooseRelevant() {
  try {
    const res = await fetch(relevantUrl, { cache: 'no-store' });
    DBG("fetch relevant_video.json:", res.status, res.ok);
    if (!res.ok) return null;
    const data = await res.json();
    const arr = Array.isArray(data) ? data : [data];
    DBG("relevant entries:", arr.length, arr);

    let match = arr.find(x => (x?.course_id || '').toLowerCase() === courseId.toLowerCase());
    if (!match) {
      WARN("no course_id match; falling back to first entry");
      match = arr[0];
    }
    if (!match) {
      WARN("no entries found");
      return null;
    }

    DBG("chosen entry:", match);

    if (match.intime == null || match.start_time == null || match.end_time == null || !match.video_url) {
      WARN("entry missing required fields (intime/start_time/end_time/video_url). Skipping.");
      return null;
    }
    return {
      intime: Number(match.intime),
      start: Number(match.start_time),
      end: Number(match.end_time),
      url: String(match.video_url)
    };
  } catch (e) {
    ERR("failed to load/parse relevant_video.json", e);
    return null;
  }
}

function waitFor(conditionFn, { interval = 150, timeout = 15000 } = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const id = setInterval(() => {
      if (conditionFn()) { clearInterval(id); resolve(true); }
      else if (Date.now() - t0 > timeout) { clearInterval(id); resolve(false); }
    }, interval);
  });
}

(async function main(){
  DBG("waiting for YT and player...");
  const ok = await waitFor(() => window.YT && window.player && typeof window.player.getPlayerState === 'function', { timeout: 20000 });
  if (!ok) return WARN("YT/player not ready; aborting.");

  const cfg = await chooseRelevant();
  if (!cfg) return WARN("no valid relevant config; nothing to do.");

  const { intime, start, end, url } = cfg;
  const vid = parseYouTubeId(url);
  DBG("config:", { intime, start, end, url, vid });
  if (!vid || !(end > start) || !(intime >= 0)) {
    WARN("invalid config derived:", { vid, intime, start, end });
    return;
  }

  // Containers
  const mainWrap = document.getElementById('wrap') || document.getElementById('player')?.parentElement || null;
  if (!mainWrap) WARN("could not find main wrap (#wrap). Using player parent.");
  const parent = mainWrap?.parentElement || document.body;
  const secondaryWrap = document.createElement('div');
  secondaryWrap.id = 'secondary-wrap';
  secondaryWrap.style.display = 'none';
  secondaryWrap.className = mainWrap?.className || 'yt-wrap yt-16x9';
  const secondaryDiv = document.createElement('div');
  secondaryDiv.id = 'secondary-player';
  secondaryWrap.appendChild(secondaryDiv);
  parent.insertBefore(secondaryWrap, (mainWrap ? mainWrap.nextSibling : null));

  let primaryElapsed = 0;
  let primaryTimer = null;
  let paused = false;
  let segmentRunning = false;
  let secondaryPlayer = null;

  function startPrimaryTimer(){
    if (primaryTimer || segmentRunning) return;
    DBG("startPrimaryTimer");
    primaryTimer = setInterval(() => {
      if (!paused) {
        primaryElapsed += 1;
        DBG("primary elapsed =", primaryElapsed, "intime =", intime);
        if (primaryElapsed >= intime && !segmentRunning) {
          DBG("reached intime; swapping to secondary video");
          runSegment();
        }
      }
    }, 1000);
  }
  function stopPrimaryTimer(){
    if (primaryTimer) { DBG("stopPrimaryTimer"); clearInterval(primaryTimer); primaryTimer = null; }
  }

  function onStateChange(evt) {
    DBG("onStateChange:", evt?.data);
    if (evt.data === YT.PlayerState.PLAYING) {
      paused = false;
      startPrimaryTimer();
    } else if (evt.data === YT.PlayerState.PAUSED || evt.data === YT.PlayerState.BUFFERING) {
      paused = true;
    }
  }

  try {
    if (player && player.addEventListener) {
      DBG("attaching YT onStateChange listener");
      player.addEventListener('onStateChange', onStateChange);
    } else {
      WARN("player.addEventListener not available; primary timer may not start automatically.");
    }
  } catch (e) { WARN("failed to attach onStateChange", e); }

  try {
    const st = player.getPlayerState && player.getPlayerState();
    DBG("initial player state:", st);
    if (st === YT.PlayerState.PLAYING) startPrimaryTimer();
  } catch (e) { WARN("getPlayerState failed", e); }

  async function runSegment(){
    segmentRunning = true;
    stopPrimaryTimer();

    let resumeTime = 0;
    try { resumeTime = Math.floor(player.getCurrentTime() || 0); } catch(e){ WARN("getCurrentTime failed", e); }

    DBG("pausing main at", resumeTime);
    try { player.pauseVideo(); } catch(e){ WARN("pauseVideo failed", e); }
    if (mainWrap) mainWrap.style.display = 'none';

    secondaryWrap.style.display = '';
    if (secondaryPlayer && secondaryPlayer.destroy) {
      try { secondaryPlayer.destroy(); } catch(e){ WARN("secondary destroy failed", e); }
      secondaryPlayer = null;
    }

    DBG("creating secondary player", { vid, start });
    secondaryPlayer = new YT.Player('secondary-player', {
      videoId: vid,
      playerVars: { start: Math.max(0, start), rel: 0, modestbranding: 1, controls: 1, iv_load_policy: 3 },
      events: {
        onReady: (e) => {
          DBG("secondary onReady");
          try { e.target.seekTo(Math.max(0, start), true); } catch(e){ WARN("secondary seekTo failed", e); }
          try { e.target.playVideo(); } catch(e){ WARN("secondary playVideo failed", e); }
          startSecondaryTimer(resumeTime);
        }
      }
    });
  }

  function startSecondaryTimer(resumeTime){
    const duration = Math.max(0, end - start);
    DBG("startSecondaryTimer for", duration, "seconds");
    const t0 = Date.now();
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - t0) / 1000);
      DBG("secondary elapsed =", elapsed);
      if (elapsed >= duration) {
        DBG("secondary finished; restoring main video at", resumeTime);
        clearInterval(id);
        try { secondaryPlayer && secondaryPlayer.pauseVideo && secondaryPlayer.pauseVideo(); } catch(e){}
        if (secondaryWrap) secondaryWrap.style.display = 'none';
        if (mainWrap) mainWrap.style.display = '';
        try { player.seekTo(resumeTime, true); player.playVideo(); } catch(e){ WARN("resume main failed", e); }
        segmentRunning = false;
        startPrimaryTimer();
      }
    }, 1000);
  }

  // Optional: expose for manual testing
  window._swapDebug = { startPrimaryTimer, stopPrimaryTimer };
})();