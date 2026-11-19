// PWA glue: service worker, "Install app" button (Android), one-time Add to Home Screen tip (iOS), and fullscreen +
// landscape lock when launched installed. All URLs are relative so it works under /<repo>/melbourne3d/.
const standalone = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const seen = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const mark = (k) => { try { localStorage.setItem(k, '1'); } catch { /* storage unavailable */ } };

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {}));
}

function pill(text, onclick, id) {
  const b = document.createElement('button');
  b.type = 'button'; b.id = id; b.textContent = text;
  b.style.cssText = 'position:fixed;right:max(10px,env(safe-area-inset-right));bottom:max(10px,env(safe-area-inset-bottom));z-index:130;font:600 13px system-ui,sans-serif;color:#111;background:#f5c518;border:0;border-radius:8px;padding:9px 14px';
  b.addEventListener('click', onclick);
  return b;
}

// Android / Chrome: capture the install prompt and offer a small button in the toolbar
let deferred = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e;
  if (document.getElementById('btn-install')) return;
  const btn = document.createElement('button');
  btn.id = 'btn-install'; btn.type = 'button'; btn.className = 'tool-btn'; btn.title = 'Install app'; btn.setAttribute('aria-label', 'Install app');
  btn.innerHTML = '<span class="gfx-label">Install app</span>';
  btn.addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice.catch(() => {});
    deferred = null; btn.remove();
  });
  const anchor = document.getElementById('btn-quality');
  if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(btn, anchor.nextSibling);
  else document.body.appendChild(pill('Install app', () => btn.click(), 'btn-install-fallback'));
});
window.addEventListener('appinstalled', () => { document.getElementById('btn-install')?.remove(); deferred = null; });

// iOS Safari: no install prompt exists, so show the tip once
if (isIOS && !standalone && !seen('gta-melb-ios-tip')) {
  window.addEventListener('load', () => setTimeout(() => {
    const tip = pill('Install: tap Share → Add to Home Screen (tap to dismiss)', () => { mark('gta-melb-ios-tip'); tip.remove(); }, 'ios-install-tip');
    tip.style.left = '10px'; tip.style.textAlign = 'center';
    document.body.appendChild(tip);
    setTimeout(() => { mark('gta-melb-ios-tip'); tip.remove(); }, 15000);
  }, 3000));
}

// Installed launch: fullscreen + landscape where supported (both need a gesture on some browsers, so retry on first tap)
if (standalone) {
  const go = () => {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
  };
  go();
  window.addEventListener('pointerdown', go, { once: true });
}
