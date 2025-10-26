// --- relevant-swap.js ---
// Displays a YouTube popup ("Videos you might find helpful") at specified times
// Uses backend /api/relevant-video -> final_merged_output.json (slide-based)

// Helper to extract YouTube video ID
function parseYouTubeId(u) {
  try {
    const url = new URL(u);
    if (url.hostname.includes('youtu.be')) return url.pathname.replace(/^\//, '');
    if (url.hostname.includes('youtube.com')) return url.searchParams.get('v');
  } catch {}
  return null;
}

// Backend endpoint
const BACKEND_URL = 'https://saunciest-unethereal-clora.ngrok-free.dev';

// Wait for a condition
function waitFor(fn, { interval = 150, timeout = 20000 } = {}) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const id = setInterval(() => {
      if (fn()) { clearInterval(id); resolve(true); }
      else if (Date.now() - t0 > timeout) { clearInterval(id); resolve(false); }
    }, interval);
  });
}

// Modal builder
function ensureModal() {
  if (document.getElementById('rs-modal')) return document.getElementById('rs-modal');

  if (!document.getElementById('rs-modal-style')) {
    const css = `
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

// Load relevant info for current course
async function loadRelevant() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/relevant-video`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Invalid response');

    const arr = Array.isArray(json.data) ? json.data : [];
    if (!arr.length) throw new Error('No relevant slides found');
    return arr;
  } catch (err) {
    console.error('⚠️ Failed to fetch relevant video info:', err);
    return [];
  }
}

(function boot() {
  const start = async () => {
    const ready = await waitFor(() => window.YT && window.player && typeof window.player.getPlayerState === 'function', { timeout: 20000 });
    if (!ready) return;

    const slides = await loadRelevant();
    if (!slides.length) return;

    // Pick the first valid slide that includes video_start, yt_video_link_start, etc.
    const m = slides.find(s => s.video_start != null && s.yt_video_link_start && s.yt_start_time != null && s.yt_end_time != null);
    if (!m) return;

    const popupAt = Number(m.video_start);
    const segStart = Number(m.yt_start_time);
    const segEnd = Number(m.yt_end_time);
    const ytLink = String(m.yt_video_link_start);
    const duration = Math.max(0, segEnd - segStart);
    const vidId = parseYouTubeId(ytLink);

    if (!vidId || !(segEnd > segStart) || !(popupAt >= 0)) return;

    let primaryElapsed = 0;
    let primaryTimer = null;
    let paused = false;
    let segmentRunning = false;
    let segmentDone = false;
    let secondaryPlayer = null;
    let lastResumeTime = 0;

    function startPrimaryTimer() {
      if (primaryTimer || segmentRunning) return;
      primaryTimer = setInterval(() => {
        if (!paused) {
          primaryElapsed += 1;
          if (!segmentDone && primaryElapsed >= popupAt && !segmentRunning) {
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

    function showModal(titleText) {
      const modal = ensureModal();
      modal.style.display = 'flex';
      if (titleText) {
        const t = modal.querySelector('.rs-title');
        if (t) t.textContent = titleText;
      }
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
      const escHandler = (ev) => { if (ev.key === 'Escape') restorePrimary(resumeTime); };
      document.addEventListener('keydown', escHandler, { once: true });
    }

    function restorePrimary(resumeTime) {
      segmentDone = true;
      hideModal();

      try { secondaryPlayer && secondaryPlayer.stopVideo && secondaryPlayer.stopVideo(); } catch {}
      try { secondaryPlayer && secondaryPlayer.destroy && secondaryPlayer.destroy(); } catch {}
      secondaryPlayer = null;

      primaryElapsed = Math.min(primaryElapsed, Math.max(0, popupAt - 1));

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
        if (attempts >= 20) { clearInterval(retry); }
      }, 300);
    }

    function startSecondaryTimer(resumeTime) {
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

      const modal = showModal(m.video_title || 'Videos you might find helpful');
      attachCloseHandler(lastResumeTime);

      const container = modal.querySelector('#secondary-player');
      if (secondaryPlayer && secondaryPlayer.destroy) { try { secondaryPlayer.destroy(); } catch {} secondaryPlayer = null; }

      secondaryPlayer = new YT.Player('secondary-player', {
        videoId: vidId,
        width: '100%', height: '100%',
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
