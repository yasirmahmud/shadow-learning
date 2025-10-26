// Timed swap to a relevant YouTube clip shown in a popup modal, then restore.
// - Picks entry from relevant_video.json matching ?id=<course_id>
// - Fires ONCE per page load
// - Handles autoplay restrictions with gentle retries

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
    let m = arr.find(x => (x?.course_id || '').toLowerCase() === courseId.toLowerCase());
    if (!m) m = arr[0];
    if (!m || m.intime == null || m.start_time == null || m.end_time == null || !m.video_url) return null;
    return { intime: +m.intime, start: +m.start_time, end: +m.end_time, url: String(m.video_url) };
  } catch { return null; }
}

function waitFor(fn, { interval = 150, timeout = 20000 } = {}) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const id = setInterval(() => {
      if (fn()) { clearInterval(id); resolve(true); }
      else if (Date.now() - t0 > timeout) { clearInterval(id); resolve(false); }
    }, interval);
  });
}

// --- Popup modal (created on demand) ---
function ensureModal() {
  if (document.getElementById('rs-modal')) return document.getElementById('rs-modal');

  // Style (scoped, injected once)
  if (!document.getElementById('rs-modal-style')) {
    const css =  `
#rs-modal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.6);z-index:9999}
#rs-modal .rs-panel{background:#fff;border-radius:14px;box-shadow:0 12px 28px rgba(0,0,0,.24);width:min(1100px,96vw);padding:16px 16px 20px;display:flex;flex-direction:column;gap:12px}
#rs-modal .rs-head{display:flex;align-items:center;justify-content:space-between}
#rs-modal .rs-title{margin:0;font:600 18px/1.3 system-ui,Segoe UI,Roboto;color:#0021A5}
#rs-modal .rs-close{appearance:none;border:0;background:transparent;font-size:22px;line-height:1;cursor:pointer;color:#444;padding:4px}
#rs-modal .rs-player{position:relative;width:100%;max-width:100%;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:#000}
#rs-modal .rs-player iframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:block}
@media (max-width:640px){
  #rs-modal .rs-panel{padding:12px}
  #rs-modal .rs-title{font-size:16px}
}
`.trim();
    const style = document.createElement('style');
    style.id = 'rs-modal-style';
    style.textContent = css;
    document.head.appendChild(style);
  }

  const modal = document.createElement('div');
  modal.id = 'rs-modal';
  modal.innerHTML = `
    <div class="rs-panel" role="dialog" aria-modal="true" aria-label="Helpful video">
      <div class="rs-head">
        <h3 class="rs-title">Videos you might find helpful</h3>
        <button class="rs-close" type="button" aria-label="Close">✕</button>
      </div>
      <div class="rs-player"><div id="secondary-player"></div></div>
    </div>`;
  document.body.appendChild(modal);
  return modal;
}

(function boot() {
  const start = async () => {
    const ready = await waitFor(() => window.YT && window.player && typeof window.player.getPlayerState === 'function', { timeout: 20000 });
    if (!ready) return;

    const cfg = await chooseRelevant();
    if (!cfg) return;
    const { intime, start: segStart, end: segEnd, url } = cfg;

    const vid = parseYouTubeId(url);
    if (!vid || !(segEnd > segStart) || !(intime >= 0)) return;

    let primaryElapsed = 0;
    let primaryTimer = null;
    let paused = false;
    let segmentRunning = false;
    let segmentDone = false; // prevent re-trigger
    let secondaryPlayer = null;
    let lastResumeTime = 0;

    function startPrimaryTimer() {
      if (primaryTimer || segmentRunning) return;
      primaryTimer = setInterval(() => {
        if (!paused) {
          primaryElapsed += 1;
          if (!segmentDone && primaryElapsed >= intime && !segmentRunning) {
            runSegment();
          }
        }
      }, 1000);
    }
    function stopPrimaryTimer() {
      if (primaryTimer) { clearInterval(primaryTimer); primaryTimer = null; }
    }

    function onStateChange(e) {
      if (e.data === YT.PlayerState.PLAYING) { paused = false; startPrimaryTimer(); }
      else if (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.BUFFERING) { paused = true; }
    }
    try { if (player && player.addEventListener) player.addEventListener('onStateChange', onStateChange); } catch {}
    try { const st = player.getPlayerState && player.getPlayerState(); if (st === YT.PlayerState.PLAYING) startPrimaryTimer(); } catch {}

    function showModal() {
      const modal = ensureModal();
      modal.style.display = 'flex';
      return modal;
    }
    function hideModal() {
      const modal = document.getElementById('rs-modal');
      if (modal) modal.style.display = 'none';
    }

    function attachCloseHandler(resumeTime) {
      const modal = document.getElementById('rs-modal');
      const btn = modal?.querySelector('.rs-close');
      if (btn) btn.onclick = () => restorePrimary(resumeTime);
      // Allow Esc to close
      const escHandler = (ev) => { if (ev.key === 'Escape') { restorePrimary(resumeTime); } };
      document.addEventListener('keydown', escHandler, { once: true });
    }

    function restorePrimary(resumeTime) {
      segmentDone = true; // ensure we never re-fire
      hideModal();

      try { secondaryPlayer && secondaryPlayer.stopVideo && secondaryPlayer.stopVideo(); } catch {}
      try { secondaryPlayer && secondaryPlayer.destroy && secondaryPlayer.destroy(); } catch {}
      secondaryPlayer = null;

      // cap elapsed below threshold to avoid >= checks elsewhere
      primaryElapsed = Math.min(primaryElapsed, Math.max(0, intime - 1));

      // gentle retry to resume (for autoplay restrictions)
      const t = Math.max(0, resumeTime);
      let attempts = 0;
      const retry = setInterval(() => {
        attempts++;
        try { player.seekTo(t, true); } catch {}
        try { player.playVideo(); } catch {}
        try {
          const st = player.getPlayerState && player.getPlayerState();
          if (st === YT.PlayerState.PLAYING) { clearInterval(retry); startPrimaryTimer(); }
        } catch {}
        if (attempts >= 20) { clearInterval(retry); } // ~6s max
      }, 300);
    }

    function startSecondaryTimer(resumeTime) {
      const duration = Math.max(0, segEnd - segStart);
      const t0 = Date.now();
      const id = setInterval(() => {
        const elapsed = Math.floor((Date.now() - t0) / 1000);
        if (elapsed >= duration) {
          clearInterval(id);
          restorePrimary(resumeTime);
        }
      }, 250);
    }

    function runSegment() {
      segmentRunning = true;
      stopPrimaryTimer();

      try { lastResumeTime = Math.floor(player.getCurrentTime() || 0); } catch { lastResumeTime = 0; }
      try { player.pauseVideo(); } catch {}

      const modal = showModal();
      attachCloseHandler(lastResumeTime);

      // make sure container exists (modal creates #secondary-player)
      const container = modal.querySelector('#secondary-player');
      // destroy old if any
      if (secondaryPlayer && secondaryPlayer.destroy) { try { secondaryPlayer.destroy(); } catch {} secondaryPlayer = null; }

      secondaryPlayer = new YT.Player('secondary-player', {
        videoId: vid, width: '100%', height: '100%',
        playerVars: { start: Math.max(0, segStart), rel: 0, modestbranding: 1, controls: 1, iv_load_policy: 3 },
        events: {
          onReady: (e) => {
            try { e.target.seekTo(Math.max(0, segStart), true); } catch {}
            try { e.target.playVideo(); } catch {}
            startSecondaryTimer(lastResumeTime);
          }
        }
      });
    }
  };

  if (window.YT && window.player) start();
  else window.addEventListener('primary-player-ready', start, { once: true });
})();
