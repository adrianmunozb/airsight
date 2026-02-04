// Calibration page script
// This page runs WebGazer locally for calibration, then notifies the extension

const gazeDot = document.getElementById('gaze-dot');
const calibration = document.getElementById('calibration');
const calibrationDot = document.getElementById('calibration-dot');
const calibrationProgress = document.getElementById('calibration-progress');
const startOverlay = document.getElementById('start');
const startBtn = document.getElementById('start-btn');
const completeOverlay = document.getElementById('complete');
const doneBtn = document.getElementById('done-btn');
const statusEl = document.getElementById('status');

const log = (emoji, ...args) => console.log(`${emoji} Eye Tracker:`, ...args);
const warn = (emoji, ...args) => console.warn(`${emoji} Eye Tracker:`, ...args);
const error = (emoji, ...args) => console.error(`${emoji} Eye Tracker:`, ...args);

const state = {
    calibrating: false,
    calibrationIndex: 0,
    started: false,
    webgazerReady: false,
    gazeCount: 0,
    gazeReady: false,
    pendingCalibration: false,
    calibrationForceTimer: null,
    faceReady: false,
};

const config = {
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

function moveCalibrationDot() {
    const [nx, ny] = config.calibrationPoints[state.calibrationIndex];
    const x = nx * window.innerWidth;
    const y = ny * window.innerHeight;
    log('🎯', `Move calibration dot to index ${state.calibrationIndex}`, x, y);
    calibrationDot.style.left = `${x}px`;
    calibrationDot.style.top = `${y}px`;
    calibrationDot.classList.remove('ready');
}

function beginCalibration() {
    log('🎯', 'Calibration started');
    state.calibrating = true;
    state.calibrationIndex = 0;
    webgazer.clearData();
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

function completeCalibration() {
    state.calibrating = false;
    calibration.classList.remove('active');
    log('✅', 'Calibration complete');

    // Show the gaze dot
    gazeDot.classList.add('active');

    // Notify background that calibration is complete
    chrome.runtime.sendMessage({ type: 'CALIBRATION_COMPLETE' });

    // Show completion overlay
    completeOverlay.classList.add('active');
    statusEl.textContent = 'Calibration complete!';
}

async function initWebgazer() {
    if (state.webgazerReady) return;
    if (!window.webgazer) {
        statusEl.textContent = 'Error: WebGazer not loaded';
        error('❌', 'WebGazer not loaded');
        return;
    }

    state.webgazerReady = true;
    log('🧠', 'Setting up WebGazer');

    webgazer
        .setGazeListener((data) => {
            if (!data) return;

            if (!state.gazeReady) {
                state.gazeReady = true;
                log('\u2705', 'Gaze predictions ready');
                if (state.pendingCalibration) {
                    startCalibration();
                }
            }

            // Update local gaze dot for testing
            gazeDot.style.left = `${data.x}px`;
            gazeDot.style.top = `${data.y}px`;
            state.gazeCount += 1;
            if (state.gazeCount % 60 === 0) {
                log('👀', 'Gaze data', Math.round(data.x), Math.round(data.y), 'count', state.gazeCount);
            }

            // Send to background for distribution to other tabs
            chrome.runtime.sendMessage({
                type: 'GAZE_POSITION',
                x: data.x,
                y: data.y
            }).catch(() => { });
        });

    webgazer.showVideo(false);
    webgazer.showFaceOverlay(false);
    webgazer.showFaceFeedbackBox(false);
    webgazer.showPredictionPoints(false);
    log('🙈', 'WebGazer video/overlays hidden');
}

async function startTracking(e) {
    if (e) e.stopPropagation();
    if (state.started) return;

    chrome.runtime.sendMessage({ type: 'STOP_TRACKING' }).catch(() => { });
    chrome.runtime.sendMessage({ type: 'CALIBRATION_START' }).catch(() => { });

    startOverlay.classList.remove('active');
    statusEl.textContent = 'Loading WebGazer...';
    log('▶️', 'startTracking called');

    // Wait for WebGazer
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

    await initWebgazer();
    state.started = true;
    statusEl.textContent = 'Starting camera...';

    try {
        webgazer.setTracker('TFFacemesh');
        webgazer.setRegression('ridge');
        webgazer.clearData();
        webgazer.saveDataAcrossSessions(true); // Save for extension use
        log('✅', 'WebGazer configured');

        statusEl.textContent = 'Requesting camera...';
        await webgazer.begin();
        log('📷', 'Camera started');

        webgazer.showVideo(true);
        webgazer.showFaceOverlay(true);
        webgazer.showFaceFeedbackBox(true);
        log('🎥', 'WebGazer video/overlays shown');

        // Poll for face mesh so calibration can start even if gaze is null
        if (!state.faceReady) {
            const facePoll = setInterval(() => {
                const tracker = webgazer.getTracker();
                if (tracker && tracker.getPositions) {
                    const positions = tracker.getPositions();
                    if (positions && positions.length > 0) {
                        state.faceReady = true;
                        log('?', 'Face mesh detected (poll):', positions.length, 'points');
                        if (state.pendingCalibration) {
                            startCalibration();
                        }
                        clearInterval(facePoll);
                    }
                }
            }, 200);
        }

        statusEl.textContent = 'Loading face detection model...';

        // Wait for face detection
        let faceDetected = false;
        for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 500));
            const prediction = webgazer.getCurrentPrediction();
            if (prediction) {
                log('✅', 'Face detection working');
                faceDetected = true;
                state.faceReady = true;
                if (state.pendingCalibration) {
                    startCalibration();
                }
                break;
            }

            const tracker = webgazer.getTracker();
            if (tracker && tracker.getPositions) {
                const positions = tracker.getPositions();
                if (positions && positions.length > 0) {
                    log('?', 'Face mesh detected:', positions.length, 'points');
                    faceDetected = true;
                    state.faceReady = true;
                    if (state.pendingCalibration) {
                        startCalibration();
                    }
                    break;
                }
            }

            statusEl.textContent = `Loading face detection... (${i + 1}/20)`;
        }

        if (!faceDetected) {
            warn('⚠️', 'Face not detected after waiting');
            statusEl.textContent = 'Warning: Face not detected - make sure your face is visible';
            await new Promise(r => setTimeout(r, 2000));
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

// Start button listener
startBtn.addEventListener('click', startTracking);
log('🔌', 'Start button listener attached');

// Done button - start tracking and close
doneBtn.addEventListener('click', async () => {
    try {
        if (window.webgazer && webgazer.end) {
            webgazer.end();
        }
    } catch (e) {
        // Ignore cleanup errors
    }
    // Tell background to start tracking
    await chrome.runtime.sendMessage({ type: 'START_TRACKING' });
    log('✅', 'Start tracking message sent, closing calibration tab');

    // Keep WebGazer running in this tab, or close it
    // For now, we'll close it and rely on the offscreen document
    window.close();
});

// Hold-to-calibrate logic
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

    let sampleCount = 0;
    let missingPositions = 0;

    calibrationRecordInterval = setInterval(() => {
        let hasPositions = true;
        try {
            const tracker = webgazer.getTracker();
            if (tracker && tracker.getPositions) {
                const positions = tracker.getPositions();
                hasPositions = !!(positions && positions.length > 0);
            }
        } catch (e) {
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
        }
    }, 30);

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
            webgazer.showVideo(false);
            webgazer.showFaceOverlay(false);
            webgazer.showFaceFeedbackBox(false);
            completeCalibration();
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
