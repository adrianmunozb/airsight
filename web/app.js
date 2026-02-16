// CRITICAL: Override Page Visibility API to prevent WebGazer from pausing
// when the tab loses focus. This is essential for Chrome extension mode.
// This MUST be at the top, before WebGazer loads its visibility handlers.
(function () {
  let keepaliveStarted = false;
  let keepaliveAudioCtx = null;
  let keepaliveWorker = null;
  let keepaliveWakeLock = null;
  const log = (emoji, ...args) => console.log(`${emoji} Eye Tracker:`, ...args);
  const warn = (emoji, ...args) => console.warn(`${emoji} Eye Tracker:`, ...args);
  const error = (emoji, ...args) => console.error(`${emoji} Eye Tracker:`, ...args);
  // Override hidden to always return false
  Object.defineProperty(document, 'hidden', {
    get: function () {
      return false;
    },
    configurable: true
  });

  // Override visibilityState to always return 'visible'
  Object.defineProperty(document, 'visibilityState', {
    get: function () {
      return 'visible';
    },
    configurable: true
  });
  log('🔆', 'Visibility override active');

  // NOTE: We do NOT override addEventListener as that breaks TensorFlow.js
  // The property overrides above are sufficient - any visibility listeners
  // will get 'visible' state when they check

  // ============================================
  // ANTI-THROTTLING: Keep tab active using multiple techniques
  // ============================================

  // 1. Web Audio API - Creates a silent audio context that keeps the tab active
  function startAudioKeepalive() {
    try {
      if (keepaliveAudioCtx) return keepaliveAudioCtx;
      log('🔊', 'Starting audio keepalive...');
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

      // Create a silent oscillator
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      // Set volume to 0 (completely silent)
      gainNode.gain.value = 0;

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start();

      log('🎧', 'Audio keepalive started');

      // Resume audio context on user interaction (required by browsers)
      document.addEventListener('click', () => {
        if (audioCtx.state === 'suspended') {
          log('🟢', 'Resuming AudioContext after user gesture');
          audioCtx.resume();
        }
      }, { once: true });

      keepaliveAudioCtx = audioCtx;
      return keepaliveAudioCtx;
    } catch (e) {
      warn('⚠️', 'Audio keepalive failed:', e);
      return null;
    }
  }

  // 2. Web Worker - Provides unthrottled timers
  function startWorkerKeepalive() {
    try {
      if (keepaliveWorker) return keepaliveWorker;
      log('🧵', 'Starting worker keepalive...');
      const workerCode = `
        // Worker runs at full speed even when tab is in background
        let count = 0;
        setInterval(() => {
          count++;
          postMessage({ type: 'tick', count: count });
        }, 250); // keepalive tick (4fps to reduce main-thread load)
      `;

      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const worker = new Worker(URL.createObjectURL(blob));

      worker.onmessage = function (e) {
        // Worker tick received - this keeps the main thread active
        if (e.data.count % 60 === 0) {
          log('⏱️', 'Worker keepalive tick', e.data.count);
        }
      };

      log('✅', 'Worker keepalive started');
      keepaliveWorker = worker;
      return keepaliveWorker;
    } catch (e) {
      warn('⚠️', 'Worker keepalive failed:', e);
      return null;
    }
  }

  // 3. Request lock to prevent tab from sleeping (if available)
  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        if (keepaliveWakeLock) return keepaliveWakeLock;
        log('🔒', 'Requesting wake lock...');
        const wakeLock = await navigator.wakeLock.request('screen');
        log('✅', 'Wake lock acquired');
        keepaliveWakeLock = wakeLock;
        return keepaliveWakeLock;
      }
    } catch (e) {
      warn('⚠️', 'Wake lock failed:', e);
    }
    return null;
  }

  // 4. MediaRecorder anti-throttle (PRIMARY - no user gesture needed)
  // Chrome won't throttle a tab that has an active MediaRecorder on a live stream
  // This is the most reliable technique because it doesn't depend on rAF or user gestures
  let mediaRecorderAntiThrottleActive = false;
  function startMediaRecorderAntiThrottle() {
    if (mediaRecorderAntiThrottleActive) return;
    try {
      const videoEl = document.getElementById('webgazerVideoFeed');
      if (!videoEl) {
        warn('⚠️', 'MediaRecorder anti-throttle: no video element, retrying in 1s...');
        setTimeout(startMediaRecorderAntiThrottle, 1000);
        return;
      }

      // Get the live webcam stream directly from the video element
      const stream = videoEl.srcObject;
      if (!stream || !(stream instanceof MediaStream)) {
        warn('⚠️', 'MediaRecorder anti-throttle: no srcObject stream, retrying in 1s...');
        setTimeout(startMediaRecorderAntiThrottle, 1000);
        return;
      }

      log('🎙️', 'Starting MediaRecorder anti-throttle on webcam stream...');

      // Record the live webcam stream — Chrome keeps the media pipeline fully active
      // when a MediaRecorder is consuming a live MediaStream
      const recorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp8',
        videoBitsPerSecond: 1000 // minimal bitrate, we just discard the data
      });
      recorder.ondataavailable = () => { }; // discard all recorded data
      recorder.onerror = (e) => {
        warn('⚠️', 'MediaRecorder error:', e);
        mediaRecorderAntiThrottleActive = false;
        // Retry after a short delay
        setTimeout(startMediaRecorderAntiThrottle, 3000);
      };
      recorder.start(5000); // request data every 5s to keep it active

      mediaRecorderAntiThrottleActive = true;
      log('✅', 'MediaRecorder anti-throttle active — tab will not be throttled');
    } catch (e) {
      warn('⚠️', 'MediaRecorder anti-throttle failed:', e);
    }
  }

  // 5. Picture-in-Picture anti-throttle (BONUS layer, requires user gesture)
  // Chrome does NOT throttle tabs that have an active PiP window
  let pipActive = false;
  async function startPiPAntiThrottle() {
    if (pipActive) return;
    try {
      const videoEl = document.getElementById('webgazerVideoFeed');
      if (!videoEl) return;

      // Try Document Picture-in-Picture API first (Chrome 116+)
      if ('documentPictureInPicture' in window) {
        log('🖼️', 'Using Document PiP API...');
        const pipWindow = await documentPictureInPicture.requestWindow({
          width: 1,
          height: 1
        });
        // Clone the video into the PiP window so Chrome keeps this tab alive
        const pipVideo = videoEl.cloneNode(true);
        pipVideo.srcObject = videoEl.srcObject;
        pipVideo.muted = true;
        pipVideo.style.cssText = 'width:1px;height:1px;opacity:0.01;';
        pipVideo.play().catch(() => { });
        pipWindow.document.body.style.cssText = 'margin:0;padding:0;overflow:hidden;background:#000;';
        pipWindow.document.body.appendChild(pipVideo);
        pipActive = true;
        log('✅', 'Document PiP anti-throttle active');
        pipWindow.addEventListener('pagehide', () => {
          pipActive = false;
          log('⚠️', 'PiP window closed by user');
        });
        return;
      }

      // Fallback: Video element PiP API
      if (videoEl.requestPictureInPicture && document.pictureInPictureEnabled) {
        log('🖼️', 'Using Video PiP fallback...');
        if (videoEl.readyState < 2) {
          await new Promise(r => { videoEl.addEventListener('loadeddata', r, { once: true }); });
        }
        await videoEl.requestPictureInPicture();
        pipActive = true;
        log('✅', 'Video PiP anti-throttle active');
        videoEl.addEventListener('leavepictureinpicture', () => {
          pipActive = false;
          log('⚠️', 'Video PiP closed by user');
        });
        return;
      }
    } catch (e) {
      warn('⚠️', 'PiP anti-throttle failed (non-critical):', e.message);
    }
  }

  // Expose for post-calibration startup
  window.__startAntiThrottle = function () {
    // Primary: MediaRecorder on live webcam stream (no gesture needed, fully reliable)
    startMediaRecorderAntiThrottle();
    // Bonus: try PiP if we're within a user gesture context
    startPiPAntiThrottle();
  };

  function startAllKeepalive() {
    if (keepaliveStarted) return;
    keepaliveStarted = true;
    log('🚀', 'Starting all keepalive mechanisms...');
    startAudioKeepalive();
    startWorkerKeepalive();
    requestWakeLock();
  }

  // Start all keepalive mechanisms when page loads
  window.addEventListener('load', startAllKeepalive);

  // Also start immediately if already loaded
  if (document.readyState === 'complete') {
    startAllKeepalive();
  }
})();

const gazeDot = document.getElementById('gaze-dot');
const menu = document.getElementById('menu');
const buttons = Array.from(document.querySelectorAll('.menu-ring button'));
const calibration = document.getElementById('calibration');
const calibrationDot = document.getElementById('calibration-dot');
const calibrationProgress = document.getElementById('calibration-progress');
const startOverlay = document.getElementById('start');
const startBtn = document.getElementById('start-btn');
const statusEl = document.getElementById('status');

const state = {
  enabled: true,
  lastZone: null,
  zoneStart: 0,
  lastFire: 0,
  menuHover: null,
  menuStart: 0,
  calibrating: false,
  calibrationIndex: 0,
  calibrationStart: 0,
  started: false,
  lastDataTs: 0,
  webgazerReady: false,
  lastPumpTs: 0,
  lastResumeTs: 0,
  gazeReady: false,
  pendingCalibration: false,
  calibrationForceTimer: null,
  faceReady: false,
};

const config = {
  dwellMs: 500,
  cooldownMs: 250,
  scrollAmount: 140,
  topZoneRatio: 0.26,
  bottomZoneRatio: 0.2,
  minZonePx: 140,
  maxZonePx: 320,
  rightZone: 140,
  calibrationDwellMs: 900,
  calibrationForceMs: 8000,
  calibrationPoints: [
    [0.5, 0.5],   // center
    [0.1, 0.1],   // top-left
    [0.9, 0.1],   // top-right
    [0.1, 0.9],   // bottom-left
    [0.9, 0.9],   // bottom-right
    [0.5, 0.1],   // top-center
    [0.5, 0.9],   // bottom-center
    [0.1, 0.5],   // left-center
    [0.9, 0.5],   // right-center
  ],
};

const log = (emoji, ...args) => console.log(`${emoji} Eye Tracker:`, ...args);
const warn = (emoji, ...args) => console.warn(`${emoji} Eye Tracker:`, ...args);
const error = (emoji, ...args) => console.error(`${emoji} Eye Tracker:`, ...args);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getScrollZonePx() {
  const h = window.innerHeight;
  return {
    topPx: Math.round(clamp(h * config.topZoneRatio, config.minZonePx, config.maxZonePx)),
    bottomPx: Math.round(clamp(h * config.bottomZoneRatio, config.minZonePx, config.maxZonePx)),
  };
}

function inMenuCircle(x, y) {
  const rect = menu.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const r = rect.width / 2;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2;
}

function hoverAction(x, y) {
  let action = null;
  buttons.forEach((btn) => {
    const rect = btn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const r = rect.width / 2;
    const inside = (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2;
    btn.classList.toggle('active', inside);
    if (inside) action = btn.dataset.action;
  });
  return action;
}

function handleMenu(action) {
  log('🧭', 'Menu action:', action);
  if (action === 'pause') state.enabled = false;
  if (action === 'resume') state.enabled = true;
  if (action === 'recalibrate') startCalibration();
  if (action === 'exit') window.close();
}

function handleScrollZone(x, y, now) {
  const { topPx, bottomPx } = getScrollZonePx();
  let zone = null;
  if (y <= topPx) zone = 'up';
  else if (y >= window.innerHeight - bottomPx) zone = 'down';
  else if (x >= window.innerWidth - config.rightZone) zone = 'right';

  if (zone !== state.lastZone) {
    state.lastZone = zone;
    state.zoneStart = now;
    return;
  }
  if (!zone) return;
  if (now - state.zoneStart < config.dwellMs) return;
  if (now - state.lastFire < config.cooldownMs) return;

  state.lastFire = now;
  log('🧭', 'Scroll zone fired:', zone);
  if (zone === 'up') window.scrollBy(0, -config.scrollAmount);
  if (zone === 'down') window.scrollBy(0, config.scrollAmount);
  if (zone === 'right') window.scrollBy(config.scrollAmount, 0);
}

function handleMenuDwell(action, now) {
  if (action !== state.menuHover) {
    state.menuHover = action;
    state.menuStart = now;
    return false;
  }
  if (!action) return false;
  if (now - state.menuStart >= config.dwellMs) {
    state.menuHover = null;
    return true;
  }
  return false;
}

function createCalibrationProgress() {
  calibrationProgress.innerHTML = '';
  log('🎯', 'Creating calibration progress dots');
  config.calibrationPoints.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.className = 'calibration-progress-dot';
    dot.dataset.index = i;
    calibrationProgress.appendChild(dot);
  });
}

function updateCalibrationProgress() {
  const dots = calibrationProgress.querySelectorAll('.calibration-progress-dot');
  dots.forEach((dot, i) => {
    dot.classList.remove('done', 'current');
    if (i < state.calibrationIndex) dot.classList.add('done');
    else if (i === state.calibrationIndex) dot.classList.add('current');
  });
}

function beginCalibration() {
  log('🎯', 'Calibration started');
  state.calibrating = true;
  state.calibrationIndex = 0;
  state.calibrationStart = 0;
  // Don't clear data - we want to accumulate training
  // webgazer.clearData();
  calibration.classList.add('active');
  createCalibrationProgress();
  updateCalibrationProgress();
  moveCalibrationDot();
  statusEl.textContent = `Calibration 1/${config.calibrationPoints.length} - HOLD the dot while looking at it`;
}

function startCalibration(force = false) {
  if (state.calibrating) return;
  if (!force && !state.faceReady) {
    state.pendingCalibration = true;
    statusEl.textContent = 'Waiting for gaze tracking to start... keep your face visible';
    log('?', 'Calibration deferred until gaze is ready');
    if (!state.calibrationForceTimer) {
      state.calibrationForceTimer = setTimeout(() => {
        state.calibrationForceTimer = null;
        if (state.pendingCalibration && !state.calibrating) {
          log('??', 'Forcing calibration start without gaze data');
          startCalibration(true);
        }
      }, config.calibrationForceMs);
    }
    return;
  }
  state.pendingCalibration = false;
  if (state.calibrationForceTimer) {
    clearTimeout(state.calibrationForceTimer);
    state.calibrationForceTimer = null;
  }
  beginCalibration();
  if (!state.gazeReady) {
    statusEl.textContent = 'Calibration started (no gaze yet). Hold/click the dot to collect samples.';
  }
}

function moveCalibrationDot() {
  const [nx, ny] = config.calibrationPoints[state.calibrationIndex];
  const x = nx * window.innerWidth;
  const y = ny * window.innerHeight;
  log('🎯', `Move calibration dot to index ${state.calibrationIndex}`, x, y);
  calibrationDot.style.left = `${x}px`;
  calibrationDot.style.top = `${y}px`;
  calibrationDot.classList.remove('ready');
}

function handleCalibration(x, y, now) {
  const [nx, ny] = config.calibrationPoints[state.calibrationIndex];
  const tx = nx * window.innerWidth;
  const ty = ny * window.innerHeight;
  const dx = x - tx;
  const dy = y - ty;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 40) {
    if (!state.calibrationStart) {
      state.calibrationStart = now;
    }
    if (now - state.calibrationStart >= config.calibrationDwellMs) {
      calibrationDot.classList.add('ready');
      log('✅', 'Calibration point captured', state.calibrationIndex);
      webgazer.recordScreenPosition(tx, ty, 'click');
      state.calibrationIndex += 1;
      state.calibrationStart = 0;
      updateCalibrationProgress();
      if (state.calibrationIndex >= config.calibrationPoints.length) {
        log('✅', 'Calibration complete');
        state.calibrating = false;
        calibration.classList.remove('active');
        return;
      }
      moveCalibrationDot();
    }
  } else {
    state.calibrationStart = 0;
    calibrationDot.classList.remove('ready');
  }
}

function setupWebgazer() {
  if (state.webgazerReady) return;
  if (!window.webgazer) return;
  state.webgazerReady = true;
  log('🧠', 'Setting up WebGazer');

  let nullCount = 0;
  let gazeCount = 0;

  webgazer
    .setGazeListener((data) => {
      if (!data) {
        nullCount++;
        if (nullCount % 30 === 0) {
          warn('⚠️', 'WebGazer returning null predictions:', nullCount, 'times');
          // Debug: check if tracker is detecting features
          try {
            const tracker = webgazer.getTracker();
            const videoElement = document.getElementById('webgazerVideoFeed');
            if (videoElement) {
              log('??', 'Video element exists, dimensions:', videoElement.videoWidth, 'x', videoElement.videoHeight);
              log('???', 'Video ready state:', videoElement.readyState);
            } else {
              warn('??', 'Video element NOT found');
            }

            if (tracker && tracker.getPositions) {
              const positions = tracker.getPositions();
              if (positions && positions.length > 0 && !state.faceReady) {
                state.faceReady = true;
                log('?', 'Face mesh detected (no gaze yet)');
                if (state.pendingCalibration) {
                  startCalibration();
                }
              }
            }

            if (tracker && tracker.getCurrentPosition) {
              const pos = tracker.getCurrentPosition();
              log('??', 'Tracker position:', pos);
            }
          } catch (e) {
            error('❌', 'Debug error:', e);
          }
        }
        return;
      }

      nullCount = 0; // Reset on valid data

      if (!state.gazeReady) {
        state.gazeReady = true;
        log('\u2705', 'Gaze predictions ready');
        if (state.pendingCalibration) {
          startCalibration();
        }
      }

      const x = data.x;
      const y = data.y;
      gazeDot.style.left = `${x}px`;
      gazeDot.style.top = `${y}px`;
      state.lastDataTs = performance.now();
      statusEl.textContent = `Status: tracking (${Math.round(x)}, ${Math.round(y)})`;
      gazeCount += 1;
      if (gazeCount % 60 === 0) {
        log('👀', 'Gaze data', Math.round(x), Math.round(y), 'count', gazeCount);
      }

      // Broadcast gaze position for Chrome extension to pick up
      // Use both BroadcastChannel (fast) and localStorage (fallback)
      try {
        // BroadcastChannel is not throttled like timers
        if (!window.__gazeChannel) {
          window.__gazeChannel = new BroadcastChannel('eyetracker_gaze');
          log('📡', 'BroadcastChannel created');
        }
        window.__gazeChannel.postMessage({ x, y, vw: window.innerWidth, vh: window.innerHeight, ts: Date.now() });
        // Also update localStorage as fallback
        localStorage.setItem('eyetracker_gaze', JSON.stringify({
          x,
          y,
          vw: window.innerWidth,
          vh: window.innerHeight,
          ts: Date.now()
        }));
      } catch (e) {
        // Ignore errors
        warn('⚠️', 'Broadcast/localStorage failed:', e);
      }

      const now = performance.now();

      if (state.calibrating) {
        handleCalibration(x, y, now);
        return;
      }

      if (inMenuCircle(x, y)) {
        menu.classList.add('expand');
      } else {
        menu.classList.remove('expand');
      }

      const action = hoverAction(x, y);
      if (handleMenuDwell(action, now)) {
        handleMenu(action);
      }

      if (state.enabled) {
        handleScrollZone(x, y, now);
      }
    })
    ;

  webgazer.showVideo(false);
  webgazer.showFaceOverlay(false);
  webgazer.showFaceFeedbackBox(false);
  webgazer.showPredictionPoints(false);
  log('🙈', 'WebGazer video/overlays hidden');
}

async function startTracking(e) {
  if (e) e.stopPropagation();
  log('▶️', 'startTracking called');

  if (state.started) {
    warn('⚠️', 'Already started');
    return;
  }

  // Immediately hide overlay and show feedback
  startOverlay.classList.remove('active');
  statusEl.textContent = 'Loading WebGazer...';

  // Wait for WebGazer to be available (retry for 3 seconds)
  let attempts = 0;
  while (!window.webgazer && attempts < 30) {
    await new Promise(r => setTimeout(r, 100));
    attempts++;
  }

  if (!window.webgazer) {
    statusEl.textContent = 'Error: WebGazer failed to load';
    startOverlay.classList.add('active');
    error('❌', 'WebGazer failed to load');
    return;
  }

  setupWebgazer();
  state.started = true;
  statusEl.textContent = 'Starting camera...';
  log('📷', 'Requesting camera access...');

  try {
    // Explicitly set the tracker to TensorFaceMesh
    if (webgazer.setTracker) {
      webgazer.setTracker('TFFacemesh');
      log('✅', 'Tracker set to TFFacemesh');
    }

    // Use ridge regression (more reliable than threadedRidge)
    webgazer.setRegression('ridge');
    // Clear old data to start fresh
    webgazer.clearData();
    webgazer.saveDataAcrossSessions(false); // Don't use potentially corrupted old data
    log('🧹', 'Cleared WebGazer data for fresh session');

    statusEl.textContent = 'Requesting camera...';
    await webgazer.begin();
    log('✅', 'WebGazer begin complete');

    // CRITICAL: Prevent WebGazer from pausing when tab loses focus
    // This is essential for the Chrome extension to work across tabs
    if (webgazer.pause && webgazer.resume) {
      // Override visibility change behavior
      document.removeEventListener('visibilitychange', webgazer._onVisibilityChange);
      // Ensure tracking continues even when tab is hidden
      webgazer.resume();
      log('🔁', 'WebGazer resume forced');
    }

    // CRITICAL: Store the pump function to start AFTER calibration completes
    // Starting it during calibration interferes with the gaze listener
    window.__startBackgroundPump = function () {
      if (window.__pumpStarted) return;
      window.__pumpStarted = true;
      log('🔄', 'Starting background pump worker');

      // Create a worker that sends ticks at full speed
      const pumpWorkerCode = `
        setInterval(() => postMessage('tick'), 50);
      `;
      const pumpBlob = new Blob([pumpWorkerCode], { type: 'application/javascript' });
      const pumpWorker = new Worker(URL.createObjectURL(pumpBlob));

      pumpWorker.onmessage = () => {
        // SMART PUMP: Only force prediction if the main loop isn't running fast enough
        // This prevents double-calculation when the tab is active
        const now = performance.now();
        const timeSinceLastUpdate = now - state.lastDataTs;
        if (now - state.lastPumpTs < 100) return;
        state.lastPumpTs = now;

        if (state.started && !state.calibrating && timeSinceLastUpdate > 100) {
          // It's been >200ms since last update, so the main loop is likely throttled/paused
          // Force a frame processing
          if (webgazer.getCurrentPrediction) {
            try {
              // Ensure video is playing (Chrome pauses background video)
              const videoEl = document.getElementById('webgazerVideoFeed');
              if (videoEl && videoEl.paused) {
                videoEl.play().catch(() => { });
              }

              // CRITICAL: Draw fresh video frame onto WebGazer's internal canvas
              // WebGazer's main rAF loop (Z) does this but getCurrentPrediction (K) does NOT.
              // Without this, background predictions use stale canvas frames = bad accuracy.
              const wgCanvas = webgazer.getVideoElementCanvas ? webgazer.getVideoElementCanvas() : null;
              if (wgCanvas && videoEl && videoEl.readyState >= 2) {
                const ctx = wgCanvas.getContext('2d');
                if (ctx) {
                  // Match canvas size to video (same as WebGazer's main loop)
                  if (wgCanvas.width !== videoEl.videoWidth) wgCanvas.width = videoEl.videoWidth;
                  if (wgCanvas.height !== videoEl.videoHeight) wgCanvas.height = videoEl.videoHeight;
                  ctx.drawImage(videoEl, 0, 0, wgCanvas.width, wgCanvas.height);
                }
              }

              // Now get a prediction using the fresh frame we just drew
              const prediction = webgazer.getCurrentPrediction();

              // If we get a prediction, broadcast it
              if (prediction && prediction.x !== undefined) {
                if (!window.__pumpLogCount) window.__pumpLogCount = 0;
                window.__pumpLogCount += 1;
                if (window.__pumpLogCount % 30 === 0) {
                  log('📡', 'Background prediction', Math.round(prediction.x), Math.round(prediction.y), 'count', window.__pumpLogCount);
                }
                // Manually update gaze position and broadcast
                gazeDot.style.left = `${prediction.x}px`;
                gazeDot.style.top = `${prediction.y}px`;
                state.lastDataTs = now; // Update timestamp so we don't pump again too soon

                // Broadcast for extension
                try {
                  if (!window.__gazeChannel) {
                    window.__gazeChannel = new BroadcastChannel('eyetracker_gaze');
                    log('📡', 'BroadcastChannel created (pump)');
                  }
                  window.__gazeChannel.postMessage({
                    x: prediction.x,
                    y: prediction.y,
                    vw: window.innerWidth,
                    vh: window.innerHeight,
                    ts: Date.now()
                  });
                  localStorage.setItem('eyetracker_gaze', JSON.stringify({
                    x: prediction.x,
                    y: prediction.y,
                    vw: window.innerWidth,
                    vh: window.innerHeight,
                    ts: Date.now()
                  }));
                } catch (e) { }
              }
            } catch (e) {
              // Ignore errors during background processing
            }
          }
        }

        // Also ensure WebGazer stays resumed
        if (now - state.lastResumeTs > 1000) {
          state.lastResumeTs = now;
          webgazer.resume?.();
        }
      };

      log('✅', 'Worker-based WebGazer pump started');
    };

    log('🧪', 'Background pump ready (will start after calibration)');

    // Show video feedback for calibration
    webgazer.showVideo(true);
    webgazer.showFaceOverlay(true);
    webgazer.showFaceFeedbackBox(true);
    log('🎥', 'WebGazer video/overlays shown for calibration');

    // Wait for TensorFlow model to fully load (it's a large model)
    statusEl.textContent = 'Loading face detection model...';
    console.log('Waiting for TensorFlow FaceMesh model to load...');
    log('⏳', 'Waiting for face detection model');

    // Wait up to 10 seconds for face detection to start working
    let faceDetected = false;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));

      // Check if we're getting valid predictions yet
      const prediction = webgazer.getCurrentPrediction();
      if (prediction) {
        log('✅', 'Face detection working! Got prediction:', prediction);
        faceDetected = true;
        state.faceReady = true;
        if (state.pendingCalibration) {
          startCalibration();
        }
        break;
      }

      // Also check the tracker directly
      const tracker = webgazer.getTracker();
      if (tracker && tracker.getPositions) {
        const positions = tracker.getPositions();
        if (positions && positions.length > 0) {
          log('✅', 'Face mesh detected:', positions.length, 'points');
          faceDetected = true;
          state.faceReady = true;
          if (state.pendingCalibration) {
            startCalibration();
          }
          break;
        }
      }

      statusEl.textContent = `Loading face detection... (${i + 1}/20)`;
      log('⏳', 'Waiting for face detection...', i + 1);
    }

    if (!faceDetected) {
      warn('⚠️', 'Face detection not confirmed, but continuing anyway...');
      statusEl.textContent = 'Warning: Face not detected - make sure your face is visible';
      await new Promise(r => setTimeout(r, 2000));
    }

    // Check if we can detect a face before calibration
    const videoEl = document.getElementById('webgazerVideoFeed');
    if (videoEl) {
      log('🎥', 'Video feed ready:', videoEl.videoWidth, 'x', videoEl.videoHeight);
    }

    statusEl.textContent = 'Starting calibration...';
    log('🎯', 'Starting calibration flow');
    startCalibration();
  } catch (err) {
    error('❌', 'WebGazer error:', err);
    statusEl.textContent = 'Error: ' + err.message;
    state.started = false;
    startOverlay.classList.add('active');
  }
}

// Wait for DOM to be ready before attaching listeners
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', attachStartListeners);
} else {
  attachStartListeners();
}

function attachStartListeners() {
  const btn = document.getElementById('start-btn');
  const overlay = document.getElementById('start');

  if (btn) {
    btn.addEventListener('click', startTracking);
    btn.addEventListener('pointerdown', startTracking);
    log('🔌', 'Start button listeners attached');
  } else {
    error('❌', 'Start button not found!');
  }

  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) startTracking(e);
    });
  }
}

setInterval(() => {
  if (!state.started) return;
  const now = performance.now();
  if (now - state.lastDataTs > 3000) {
    statusEl.textContent = 'Status: no gaze data (check camera permission)';
    warn('⚠️', 'No gaze data for >3s');
  }
}, 1000);

// Hold-to-calibrate: user must hold mouse on dot for 1 second
let calibrationHoldTimer = null;
let calibrationRecordInterval = null;

calibrationDot.addEventListener('mousedown', (ev) => {
  if (!state.calibrating) return;
  ev.preventDefault();
  log('🖱️', 'Calibration dot mousedown');

  const rect = calibrationDot.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  calibrationDot.classList.add('holding');
  statusEl.textContent = 'Hold and look at the dot...';

  // Track sample recording
  let sampleCount = 0;
  let missingPositions = 0;

  // Record samples continuously while holding - record more frequently for better training
  calibrationRecordInterval = setInterval(() => {
    let hasPositions = true;
    try {
      const tracker = webgazer.getTracker();
      if (tracker && tracker.getPositions) {
        const positions = tracker.getPositions();
        hasPositions = !!(positions && positions.length > 0);
      }
    } catch (e) {
      // If tracker access fails, still try to record
      hasPositions = true;
    }

    try {
      webgazer.recordScreenPosition(cx, cy, 'click');
      sampleCount++;
    } catch (e) {
      // Ignore record errors
    }

    if (!hasPositions) {
      missingPositions++;
      if (missingPositions % 20 === 0) {
        warn('??', 'No face mesh positions during calibration samples:', missingPositions);
      }
    } else if (sampleCount % 10 === 0) {
      log('??', `Recorded ${sampleCount} samples at (${cx}, ${cy})`);
    }
  }, 30);

  // After 1.5 seconds of holding, complete this point (more time = more samples)
  calibrationHoldTimer = setTimeout(() => {
    clearInterval(calibrationRecordInterval);
    calibrationDot.classList.remove('holding');
    calibrationDot.classList.add('ready');
    log('✅', 'Calibration point completed', state.calibrationIndex);
    if (missingPositions >= sampleCount && sampleCount > 0) {
      warn('??', 'No face mesh data captured for this point');
      statusEl.textContent = 'No face mesh data captured. Adjust lighting or camera angle.';
    }

    state.calibrationIndex += 1;
    updateCalibrationProgress();

    if (state.calibrationIndex >= config.calibrationPoints.length) {
      state.calibrating = false;
      calibration.classList.remove('active');

      // Debug: Check regression model data
      try {
        const regs = webgazer.getRegression();
        if (regs && regs[0] && regs[0].getData) {
          const data = regs[0].getData();
          log('✅', 'Calibration complete! Regression data:', data);
          if (data && data.length !== undefined) {
            log('📊', 'Training samples collected:', data.length);
            statusEl.textContent = `Tracking active (${data.length} samples) - look around!`;
          } else {
            log('📦', 'Data structure:', typeof data, data);
            statusEl.textContent = 'Tracking active - look around!';
          }
        } else {
          warn('⚠️', 'Could not get regression data');
          statusEl.textContent = 'Tracking active - look around!';
        }
      } catch (e) {
        error('❌', 'Error checking regression data:', e);
        statusEl.textContent = 'Tracking active - look around!';
      }

      webgazer.showVideo(false);
      webgazer.showFaceOverlay(false);
      webgazer.showFaceFeedbackBox(false);

      // Start the background pump now that calibration is complete
      if (window.__startBackgroundPump) {
        window.__startBackgroundPump();
      }

      // Start PiP anti-throttle to prevent Chrome from freezing this tab
      if (window.__startAntiThrottle) {
        // Small delay to let WebGazer stabilize before opening PiP
        setTimeout(() => window.__startAntiThrottle(), 1000);
      }
      return;
    }
    moveCalibrationDot();
    statusEl.textContent = `Calibration ${state.calibrationIndex + 1}/${config.calibrationPoints.length} - hold the dot`;
  }, 1500);
});

calibrationDot.addEventListener('mouseup', () => {
  if (calibrationHoldTimer) {
    clearTimeout(calibrationHoldTimer);
    calibrationHoldTimer = null;
  }
  if (calibrationRecordInterval) {
    clearInterval(calibrationRecordInterval);
    calibrationRecordInterval = null;
  }
  calibrationDot.classList.remove('holding');
  log('🖱️', 'Calibration dot mouseup');
});

calibrationDot.addEventListener('mouseleave', () => {
  if (calibrationHoldTimer) {
    clearTimeout(calibrationHoldTimer);
    calibrationHoldTimer = null;
  }
  if (calibrationRecordInterval) {
    clearInterval(calibrationRecordInterval);
    calibrationRecordInterval = null;
  }
  calibrationDot.classList.remove('holding');
  log('🖱️', 'Calibration dot mouseleave');
});
