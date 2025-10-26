// assets/relevant-swap.js
// Auto-swaps to a relevant YouTube clip based on relevant_video.json
// Chooses the entry whose course_id matches ?id=<course> from the URL.

const courseId = new URLSearchParams(location.search).get('id') || '';
const relevantUrl = './relevant_video.json';

function parseYouTubeId(u) {
  try {
    const url = new URL(u);
    if (url.hostname.includes('youtu.be')) return url.pathname.replace(/^\//, '');
    if (url.hostname.includes('youtube.com')) return url.searchParams.get('v');
  } catch {}
  return null;
}

async function chooseRelevant() {
  try {
    const res = await fetch(relevantUrl, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    const arr = Array.isArray(data) ? data : [data];
    let match = arr.find(x => (x?.course_id || '').toLowerCase() === courseId.toLowerCase());
    if (!match) match = arr[0]; // fallback to first if nothing matches
    // Validate required fields
    if (!match || match.intime == null || match.start_time == null || match.end_time == null || !match.video_url) return null;
    return {
      intime: Number(match.intime),
      start: Number(match.start_time),
      end: Number(match.end_time),
      url: String(match.video_url)
    };
  } catch (e) {
    console.warn('relevant-swap: failed to load relevant_video.json', e);
    return null;
  }
}

function waitFor(conditionFn, { interval = 150, timeout = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const id = setInterval(() => {
      if (conditionFn()) { clearInterval(id); resolve(true); }
      else if (Date.now() - t0 > timeout) { clearInterval(id); resolve(false); }
    }, interval);
  });
}

(async function main(){
  // Ensure YT API + player exist
  const ok = await waitFor(() => window.YT && window.player && typeof window.player.getPlayerState === 'function', { timeout: 20000 });
  if (!ok) return console.warn('relevant-swap: YT player not ready');

  const cfg = await chooseRelevant();
  if (!cfg) return; // nothing to do for this course

  const { intime, start, end, url } = cfg;
  const vid = parseYouTubeId(url);
  if (!vid || !(end > start) || !(intime >= 0)) return;

  // Containers
  const mainWrap = document.getElementById('wrap') || document.getElementById('player')?.parentElement || null;
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
    primaryTimer = setInterval(() => {
      if (!paused) {
        primaryElapsed += 1;
        if (primaryElapsed >= intime && !segmentRunning) {
          runSegment();
        }
      }
    }, 1000);
  }
  function stopPrimaryTimer(){
    if (primaryTimer) { clearInterval(primaryTimer); primaryTimer = null; }
  }

  function onStateChange(evt) {
    if (evt.data === YT.PlayerState.PLAYING) {
      paused = false;
      startPrimaryTimer();
    } else if (evt.data === YT.PlayerState.PAUSED || evt.data === YT.PlayerState.BUFFERING) {
      paused = true;
    }
  }

  try {
    if (player && player.addEventListener) player.addEventListener('onStateChange', onStateChange);
  } catch {}
  try {
    const st = player.getPlayerState && player.getPlayerState();
    if (st === YT.PlayerState.PLAYING) startPrimaryTimer();
  } catch {}

  async function runSegment(){
    segmentRunning = true;
    stopPrimaryTimer();
    let resumeTime = 0;
    try { resumeTime = Math.floor(player.getCurrentTime() || 0); } catch {}

    try { player.pauseVideo(); } catch {}
    if (mainWrap) mainWrap.style.display = 'none';

    secondaryWrap.style.display = '';
    if (secondaryPlayer && secondaryPlayer.destroy) {
      try { secondaryPlayer.destroy(); } catch {}
      secondaryPlayer = null;
    }
    secondaryPlayer = new YT.Player('secondary-player', {
      videoId: vid,
      playerVars: { start: Math.max(0, start), rel: 0, modestbranding: 1, controls: 1, iv_load_policy: 3 },
      events: {
        onReady: (e) => {
          try { e.target.seekTo(Math.max(0, start), true); } catch {}
          try { e.target.playVideo(); } catch {}
          startSecondaryTimer(resumeTime);
        }
      }
    });
  }

  function startSecondaryTimer(resumeTime){
    const duration = Math.max(0, end - start);
    const t0 = Date.now();
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - t0) / 1000);
      if (elapsed >= duration) {
        clearInterval(id);
        try { secondaryPlayer && secondaryPlayer.pauseVideo && secondaryPlayer.pauseVideo(); } catch {}
        if (secondaryWrap) secondaryWrap.style.display = 'none';
        if (mainWrap) mainWrap.style.display = '';
        try { player.seekTo(resumeTime, true); player.playVideo(); } catch {}
        segmentRunning = false;
        startPrimaryTimer();
      }
    }, 1000);
  }
})();