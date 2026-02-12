// Content script - injected into every webpage
// Displays the gaze dot overlay OR captures gaze data from the eye tracker page

(function () {
  // Avoid duplicate injection
  if (window.__eyeTrackerInjected) return;
  window.__eyeTrackerInjected = true;

  const log = (emoji, ...args) => console.log(`${emoji} Eye Tracker:`, ...args);
  const warn = (emoji, ...args) => console.warn(`${emoji} Eye Tracker:`, ...args);
  const error = (emoji, ...args) => console.error(`${emoji} Eye Tracker:`, ...args);
  const scrollConfig = {
    dwellMs: 500,
    cooldownMs: 250,
    scrollAmount: 140,
    topZoneRatio: 0.26,
    bottomZoneRatio: 0.2,
    minZonePx: 140,
    maxZonePx: 320
  };
  const scrollState = { lastZone: null, zoneStart: 0, lastFire: 0 };
  let lastScrollTarget = null;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function getScrollZonePx() {
    const h = window.innerHeight;
    return {
      topPx: Math.round(clamp(h * scrollConfig.topZoneRatio, scrollConfig.minZonePx, scrollConfig.maxZonePx)),
      bottomPx: Math.round(clamp(h * scrollConfig.bottomZoneRatio, scrollConfig.minZonePx, scrollConfig.maxZonePx))
    };
  }

  function isScrollable(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const overflowY = style.overflowY;
    if (overflowY !== 'auto' && overflowY !== 'scroll' && overflowY !== 'overlay') return false;
    return el.scrollHeight - el.clientHeight > 1;
  }

  function getScrollTarget(x, y) {
    let el = document.elementFromPoint(x, y);
    while (el && el !== document.body && el !== document.documentElement) {
      if (isScrollable(el)) return el;
      el = el.parentElement;
    }
    const root = document.scrollingElement || document.documentElement;
    if (root && root.scrollHeight - root.clientHeight > 1) return root;
    return null;
  }

  function handleScrollZone(x, y, now) {
    let target = getScrollTarget(x, y);
    if (!target && lastScrollTarget && isScrollable(lastScrollTarget)) {
      target = lastScrollTarget;
    }
    if (!target) {
      const root = document.scrollingElement || document.documentElement;
      if (root && root.scrollHeight - root.clientHeight > 1) {
        target = root;
      }
    }
    if (!target) {
      scrollState.lastZone = null;
      return;
    }
    if (target !== lastScrollTarget) {
      lastScrollTarget = target;
    }

    const { topPx, bottomPx } = getScrollZonePx();
    let zone = null;
    if (y <= topPx) zone = 'up';
    else if (y >= window.innerHeight - bottomPx) zone = 'down';

    const canUp = target.scrollTop > 0;
    const canDown = target.scrollTop + target.clientHeight < target.scrollHeight - 1;
    if (zone === 'up' && !canUp) zone = null;
    if (zone === 'down' && !canDown) zone = null;

    if (zone !== scrollState.lastZone) {
      scrollState.lastZone = zone;
      scrollState.zoneStart = now;
      return;
    }
    if (!zone) return;
    if (now - scrollState.zoneStart < scrollConfig.dwellMs) return;
    if (now - scrollState.lastFire < scrollConfig.cooldownMs) return;

    scrollState.lastFire = now;
    const delta = zone === 'up' ? -scrollConfig.scrollAmount : scrollConfig.scrollAmount;
    if (typeof target.scrollBy === 'function') {
      target.scrollBy(0, delta);
    } else {
      target.scrollTop += delta;
    }
  }

  const isTrackerPage = window.location.hostname === 'localhost' &&
    (window.location.port === '8888' || window.location.port === '5500' || window.location.port === '3000');

  function setupTabVisibilityLogs(label) {
    const reportVisibility = () => {
      const state = document.visibilityState;
      if (state === 'hidden') {
        log('🙈', `${label} tab hidden (another tab active)`);
      } else {
        log('👀', `${label} tab visible`);
      }
    };

    document.addEventListener('visibilitychange', reportVisibility);
    window.addEventListener('focus', () => log('🟢', `${label} tab focused`));
    window.addEventListener('blur', () => log('🟡', `${label} tab blurred (other tab/window)`));
    reportVisibility();
  }

  // If we're on the eye tracker page, capture gaze data and send to extension
  if (isTrackerPage) {
    setupTabVisibilityLogs('Tracker');
    log('🔭', 'Monitoring gaze data on tracker page');

    let sentCount = 0;

    // Use BroadcastChannel for instant message delivery (not throttled)
    try {
      const gazeChannel = new BroadcastChannel('eyetracker_gaze');
      gazeChannel.onmessage = (event) => {
        const data = event.data;
        if (data && data.x !== undefined && data.y !== undefined) {
          sentCount++;
          if (sentCount % 60 === 0) {
            log('📡', 'Sending gaze position', data.x.toFixed(0), data.y.toFixed(0), 'total sent:', sentCount);
          }
          chrome.runtime.sendMessage({
            type: 'GAZE_POSITION',
            x: data.x,
            y: data.y,
            vw: data.vw,
            vh: data.vh
          }).catch((e) => {
            error('❌', 'Failed to send gaze:', e);
          });
        }
      };
      log('✅', 'BroadcastChannel listener active');
    } catch (e) {
      warn('⚠️', 'BroadcastChannel not supported, using localStorage fallback');
    }

    // Fallback: Monitor localStorage at lower frequency (for older browsers)
    let lastTs = 0;
    setInterval(() => {
      try {
        const gazeData = localStorage.getItem('eyetracker_gaze');
        if (gazeData) {
          const data = JSON.parse(gazeData);
          if (data.ts > lastTs) {
            lastTs = data.ts;
            // Only send via localStorage if BroadcastChannel didn't work
            // (checked by timestamp proximity)
            const now = Date.now();
            if (now - data.ts > 50) {
              // Data is old, BroadcastChannel probably not working
              sentCount++;
              chrome.runtime.sendMessage({
                type: 'GAZE_POSITION',
                x: data.x,
                y: data.y,
                vw: data.vw,
                vh: data.vh
              }).catch(() => { });
            }
          }
        }
      } catch (e) {
        // Ignore errors
        warn('⚠️', 'localStorage fallback error:', e);
      }
    }, 50); // Lower frequency fallback

    // Also notify that tracking is active
    chrome.runtime.sendMessage({ type: 'TRACKER_PAGE_ACTIVE' }).catch(() => { });
    log('📣', 'Tracker page active message sent');

    return; // Don't show gaze dot on the tracker page itself
  }

  // For all other pages, create and show the gaze dot
  setupTabVisibilityLogs('Overlay');

  // Create gaze dot element
  const gazeDot = document.createElement('div');
  gazeDot.id = 'eye-tracker-gaze-dot';
  gazeDot.style.cssText = `
    position: fixed;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #ff4f44;
    pointer-events: none;
    transform: translate(-50%, -50%);
    box-shadow:
      0 0 20px rgba(255, 79, 68, 0.6),
      0 0 40px rgba(255, 79, 68, 0.6),
      inset 0 0 8px rgba(255, 255, 255, 0.3);
    z-index: 2147483647;
    transition: left 0.03s ease-out, top 0.03s ease-out;
    display: none;
    left: 0;
    top: 0;
  `;

  // Pulse animation ring
  const pulseRing = document.createElement('div');
  pulseRing.style.cssText = `
    position: absolute;
    inset: -4px;
    border: 2px solid #ff4f44;
    border-radius: 50%;
    opacity: 0.4;
    animation: eyeTrackerGazePulse 1.5s ease-in-out infinite;
  `;
  gazeDot.appendChild(pulseRing);

  const scrollZoneUp = document.createElement('div');
  scrollZoneUp.id = 'eye-tracker-scroll-zone-up';
  scrollZoneUp.style.cssText = `
    position: fixed;
    left: 0;
    right: 0;
    top: 0;
    height: 0;
    background: rgba(0, 200, 0, 0.18);
    display: none;
    pointer-events: none;
    z-index: 2147483646;
  `;

  const scrollZoneDown = document.createElement('div');
  scrollZoneDown.id = 'eye-tracker-scroll-zone-down';
  scrollZoneDown.style.cssText = `
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    height: 0;
    background: rgba(0, 200, 0, 0.18);
    display: none;
    pointer-events: none;
    z-index: 2147483646;
  `;

  // Add keyframes animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes eyeTrackerGazePulse {
      0%, 100% {
        transform: scale(1);
        opacity: 0.4;
      }
      50% {
        transform: scale(1.3);
        opacity: 0.1;
      }
    }
  `;

  function updateScrollZoneOverlays() {
    const { topPx, bottomPx } = getScrollZonePx();
    scrollZoneUp.style.height = `${Math.round(topPx / 2)}px`;
    scrollZoneDown.style.height = `${bottomPx}px`;
  }

  // Wait for body to be available
  function init() {
    if (document.head) {
      document.head.appendChild(style);
    }
    if (document.body) {
      updateScrollZoneOverlays();
      document.body.appendChild(scrollZoneUp);
      document.body.appendChild(scrollZoneDown);
      document.body.appendChild(gazeDot);
    } else {
      // Wait for body
      const observer = new MutationObserver(() => {
        if (document.body) {
          updateScrollZoneOverlays();
          document.body.appendChild(scrollZoneUp);
          document.body.appendChild(scrollZoneDown);
          document.body.appendChild(gazeDot);
          observer.disconnect();
        }
      });
      observer.observe(document.documentElement, { childList: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('resize', updateScrollZoneOverlays);

  function setTrackingActive(active) {
    const display = active ? 'block' : 'none';
    scrollZoneUp.style.display = display;
    scrollZoneDown.style.display = display;
  }

  let isVisible = false;

  function mapGazeToViewport(message) {
    let x = message.x;
    let y = message.y;
    if (Number.isFinite(message.vw) && Number.isFinite(message.vh) && message.vw > 0 && message.vh > 0) {
      x = (x / message.vw) * window.innerWidth;
      y = (y / message.vh) * window.innerHeight;
    }
    x = clamp(x, 0, Math.max(0, window.innerWidth - 1));
    y = clamp(y, 0, Math.max(0, window.innerHeight - 1));
    return { x, y };
  }

  // Listen for gaze updates from background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GAZE_UPDATE') {
      const mapped = mapGazeToViewport(message);
      if (!isVisible) {
        gazeDot.style.display = 'block';
        isVisible = true;
        setTrackingActive(true);
        log('👀', 'Gaze dot visible');
      }
      gazeDot.style.left = `${mapped.x}px`;
      gazeDot.style.top = `${mapped.y}px`;
      handleScrollZone(mapped.x, mapped.y, performance.now());
    } else if (message.type === 'HIDE_GAZE') {
      gazeDot.style.display = 'none';
      isVisible = false;
      setTrackingActive(false);
      log('🙈', 'Gaze dot hidden');
    }
  });

  // Check initial tracking status and request current position
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
    if (chrome.runtime.lastError) {
      warn('⚠️', 'Extension context error, retrying...');
      return;
    }
    if (response && response.isTracking) {
      log('✅', 'Tracking is active, waiting for gaze updates');
      setTrackingActive(true);
      // Request an immediate position update
      chrome.runtime.sendMessage({ type: 'REQUEST_POSITION' }).catch(() => { });
    } else {
      setTrackingActive(false);
    }
  });

  // Heartbeat to maintain connection and ensure we receive updates
  setInterval(() => {
    chrome.runtime.sendMessage({ type: 'HEARTBEAT' }).catch(() => { });
  }, 1000);

  log('✅', 'Content script loaded');
})();
