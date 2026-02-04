// Offscreen document script - runs WebGazer for eye tracking
// This document has access to camera and DOM

let webgazerStarted = false;
const log = (emoji, ...args) => console.log(`${emoji} Eye Tracker:`, ...args);
const warn = (emoji, ...args) => console.warn(`${emoji} Eye Tracker:`, ...args);
const error = (emoji, ...args) => console.error(`${emoji} Eye Tracker:`, ...args);

async function initWebgazer() {
    if (webgazerStarted) return;

    try {
        log('🧠', 'Initializing WebGazer in offscreen document...');

        // Configure WebGazer
        webgazer.setTracker('TFFacemesh');
        webgazer.setRegression('ridge');
        webgazer.saveDataAcrossSessions(true);

        // Set up gaze listener to send positions to background
        webgazer.setGazeListener((data, elapsedTime) => {
            if (data) {
                chrome.runtime.sendMessage({
                    type: 'GAZE_POSITION',
                    x: data.x,
                    y: data.y
                }).catch(() => { });
            }
        });

        // Hide video elements (we're in an offscreen document anyway)
        webgazer.showVideo(false);
        webgazer.showFaceOverlay(false);
        webgazer.showFaceFeedbackBox(false);

        // Start WebGazer
        await webgazer.begin();
        webgazerStarted = true;

        log('✅', 'WebGazer started successfully');

        // Notify that tracking is ready
        chrome.runtime.sendMessage({ type: 'TRACKING_READY' }).catch(() => { });

    } catch (error) {
        error('❌', 'WebGazer initialization error:', error);
        chrome.runtime.sendMessage({
            type: 'TRACKING_ERROR',
            error: error.message
        }).catch(() => { });
    }
}

function stopWebgazer() {
    if (webgazerStarted) {
        webgazer.end();
        webgazerStarted = false;
        log('⏹️', 'WebGazer stopped');
    }
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    log('📨', 'Offscreen received message:', message.type);

    switch (message.type) {
        case 'START_WEBGAZER':
            log('▶️', 'START_WEBGAZER');
            initWebgazer();
            sendResponse({ success: true });
            break;

        case 'STOP_WEBGAZER':
            log('⏹️', 'STOP_WEBGAZER');
            stopWebgazer();
            sendResponse({ success: true });
            break;

        case 'RECORD_CALIBRATION_POINT':
            if (webgazerStarted && webgazer.recordScreenPosition) {
                webgazer.recordScreenPosition(message.x, message.y, 'click');
                log('🎯', 'Recorded calibration point', message.x, message.y);
                sendResponse({ success: true });
            }
            break;

        case 'CLEAR_CALIBRATION':
            if (webgazerStarted) {
                webgazer.clearData();
                log('🧹', 'Calibration data cleared');
                sendResponse({ success: true });
            }
            break;
    }

    return true;
});

async function startIfEnabled() {
    try {
        const stored = await chrome.storage.local.get(['isTracking', 'isCalibrating']);
        if (stored.isTracking && !stored.isCalibrating) {
            initWebgazer();
        }
    } catch (err) {
        warn('WARN', 'Failed to read tracking state:', err);
    }
}

// Start only if tracking is enabled
startIfEnabled();
