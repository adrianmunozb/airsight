// Content script - injected into every webpage
// Displays the gaze dot overlay OR captures gaze data from the eye tracker page

(function () {
  // Avoid duplicate injection
  if (window.__eyeTrackerInjected) return;
  window.__eyeTrackerInjected = true;

  const log = (emoji, ...args) => console.log(`${emoji} Eye Tracker:`, ...args);
  const warn = (emoji, ...args) => console.warn(`${emoji} Eye Tracker:`, ...args);
  const error = (emoji, ...args) => console.error(`${emoji} Eye Tracker:`, ...args);

  const isTrackerPage = window.location.hostname === 'localhost' &&
    (window.location.port === '8888' || window.location.port === '5500' || window.location.port === '3000');

  // If we're on the eye tracker page, capture gaze data and send to extension
  if (isTrackerPage) {
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
            y: data.y
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
                y: data.y
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

  // Wait for body to be available
  function init() {
    if (document.head) {
      document.head.appendChild(style);
    }
    if (document.body) {
      document.body.appendChild(gazeDot);
    } else {
      // Wait for body
      const observer = new MutationObserver(() => {
        if (document.body) {
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

  let isVisible = false;

  // Listen for gaze updates from background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GAZE_UPDATE') {
      if (!isVisible) {
        gazeDot.style.display = 'block';
        isVisible = true;
        log('👀', 'Gaze dot visible');
      }
      gazeDot.style.left = `${message.x}px`;
      gazeDot.style.top = `${message.y}px`;
    } else if (message.type === 'HIDE_GAZE') {
      gazeDot.style.display = 'none';
      isVisible = false;
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
      // Request an immediate position update
      chrome.runtime.sendMessage({ type: 'REQUEST_POSITION' }).catch(() => { });
    }
  });

  // Heartbeat to maintain connection and ensure we receive updates
  setInterval(() => {
    chrome.runtime.sendMessage({ type: 'HEARTBEAT' }).catch(() => { });
  }, 1000);

  log('✅', 'Content script loaded');
})();
