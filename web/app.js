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
};

const config = {
  dwellMs: 500,
  cooldownMs: 250,
  scrollAmount: 140,
  topZone: 120,
  bottomZone: 120,
  rightZone: 140,
  calibrationDwellMs: 900,
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
  if (action === 'pause') state.enabled = false;
  if (action === 'resume') state.enabled = true;
  if (action === 'recalibrate') startCalibration();
  if (action === 'exit') window.close();
}

function handleScrollZone(x, y, now) {
  let zone = null;
  if (y <= config.topZone) zone = 'up';
  else if (y >= window.innerHeight - config.bottomZone) zone = 'down';
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

function startCalibration() {
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

function moveCalibrationDot() {
  const [nx, ny] = config.calibrationPoints[state.calibrationIndex];
  const x = nx * window.innerWidth;
  const y = ny * window.innerHeight;
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
      webgazer.recordScreenPosition(tx, ty, 'click');
      state.calibrationIndex += 1;
      state.calibrationStart = 0;
      updateCalibrationProgress();
      if (state.calibrationIndex >= config.calibrationPoints.length) {
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

  let nullCount = 0;

  webgazer
    .setGazeListener((data) => {
      if (!data) {
        nullCount++;
        if (nullCount % 30 === 0) {
          console.log('WebGazer returning null predictions:', nullCount, 'times');
          // Debug: check if tracker is detecting features
          try {
            const tracker = webgazer.getTracker();
            const videoElement = document.getElementById('webgazerVideoFeed');
            if (videoElement) {
              console.log('Video element exists, dimensions:', videoElement.videoWidth, 'x', videoElement.videoHeight);
              console.log('Video ready state:', videoElement.readyState);
            } else {
              console.log('Video element NOT found');
            }
            if (tracker && tracker.getCurrentPosition) {
              const pos = tracker.getCurrentPosition();
              console.log('Tracker position:', pos);
            }
          } catch (e) {
            console.log('Debug error:', e);
          }
        }
        return;
      }

      nullCount = 0; // Reset on valid data

      const x = data.x;
      const y = data.y;
      gazeDot.style.left = `${x}px`;
      gazeDot.style.top = `${y}px`;
      state.lastDataTs = performance.now();
      statusEl.textContent = `Status: tracking (${Math.round(x)}, ${Math.round(y)})`;

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
}

async function startTracking(e) {
  if (e) e.stopPropagation();
  console.log('startTracking called');

  if (state.started) {
    console.log('Already started');
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
    return;
  }

  setupWebgazer();
  state.started = true;
  statusEl.textContent = 'Starting camera...';

  try {
    // Explicitly set the tracker to TensorFaceMesh
    if (webgazer.setTracker) {
      webgazer.setTracker('TFFacemesh');
      console.log('Set tracker to TFFacemesh');
    }

    // Use ridge regression (more reliable than threadedRidge)
    webgazer.setRegression('ridge');
    // Clear old data to start fresh
    webgazer.clearData();
    webgazer.saveDataAcrossSessions(false); // Don't use potentially corrupted old data

    statusEl.textContent = 'Requesting camera...';
    await webgazer.begin();

    // Show video feedback for calibration
    webgazer.showVideo(true);
    webgazer.showFaceOverlay(true);
    webgazer.showFaceFeedbackBox(true);

    // Wait for TensorFlow model to fully load (it's a large model)
    statusEl.textContent = 'Loading face detection model...';
    console.log('Waiting for TensorFlow FaceMesh model to load...');

    // Wait up to 10 seconds for face detection to start working
    let faceDetected = false;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));

      // Check if we're getting valid predictions yet
      const prediction = webgazer.getCurrentPrediction();
      if (prediction) {
        console.log('Face detection working! Got prediction:', prediction);
        faceDetected = true;
        break;
      }

      // Also check the tracker directly
      const tracker = webgazer.getTracker();
      if (tracker && tracker.getPositions) {
        const positions = tracker.getPositions();
        if (positions && positions.length > 0) {
          console.log('Face mesh detected:', positions.length, 'points');
          faceDetected = true;
          break;
        }
      }

      statusEl.textContent = `Loading face detection... (${i + 1}/20)`;
      console.log('Waiting for face detection...', i + 1);
    }

    if (!faceDetected) {
      console.warn('Face detection not confirmed, but continuing anyway...');
      statusEl.textContent = 'Warning: Face not detected - make sure your face is visible';
      await new Promise(r => setTimeout(r, 2000));
    }

    // Check if we can detect a face before calibration
    const videoEl = document.getElementById('webgazerVideoFeed');
    if (videoEl) {
      console.log('Video feed ready:', videoEl.videoWidth, 'x', videoEl.videoHeight);
    }

    statusEl.textContent = 'Starting calibration...';
    startCalibration();
  } catch (err) {
    console.error('WebGazer error:', err);
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
    console.log('Start button listeners attached');
  } else {
    console.error('Start button not found!');
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
  }
}, 1000);

// Hold-to-calibrate: user must hold mouse on dot for 1 second
let calibrationHoldTimer = null;
let calibrationRecordInterval = null;

calibrationDot.addEventListener('mousedown', (ev) => {
  if (!state.calibrating) return;
  ev.preventDefault();

  const rect = calibrationDot.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  calibrationDot.classList.add('holding');
  statusEl.textContent = 'Hold and look at the dot...';

  // Track sample recording
  let sampleCount = 0;

  // Record samples continuously while holding - record more frequently for better training
  calibrationRecordInterval = setInterval(() => {
    // Check if WebGazer has eye features before recording
    try {
      const tracker = webgazer.getTracker();
      if (tracker && tracker.getPositions) {
        const positions = tracker.getPositions();
        if (positions && positions.length > 0) {
          webgazer.recordScreenPosition(cx, cy, 'click');
          sampleCount++;
          if (sampleCount % 10 === 0) {
            console.log(`Recorded ${sampleCount} samples at (${cx}, ${cy}) with face mesh active`);
          }
        } else {
          console.log('No face mesh positions - sample skipped');
        }
      } else {
        // Still try to record - internal eye feature detection may work
        webgazer.recordScreenPosition(cx, cy, 'click');
        sampleCount++;
      }
    } catch (e) {
      webgazer.recordScreenPosition(cx, cy, 'click');
      sampleCount++;
    }
  }, 30);

  // After 1.5 seconds of holding, complete this point (more time = more samples)
  calibrationHoldTimer = setTimeout(() => {
    clearInterval(calibrationRecordInterval);
    calibrationDot.classList.remove('holding');
    calibrationDot.classList.add('ready');

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
          console.log('Calibration complete! Regression data:', data);
          if (data && data.length !== undefined) {
            console.log('Training samples collected:', data.length);
            statusEl.textContent = `Tracking active (${data.length} samples) - look around!`;
          } else {
            console.log('Data structure:', typeof data, data);
            statusEl.textContent = 'Tracking active - look around!';
          }
        } else {
          console.log('Could not get regression data');
          statusEl.textContent = 'Tracking active - look around!';
        }
      } catch (e) {
        console.log('Error checking regression data:', e);
        statusEl.textContent = 'Tracking active - look around!';
      }

      webgazer.showVideo(false);
      webgazer.showFaceOverlay(false);
      webgazer.showFaceFeedbackBox(false);
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
});
