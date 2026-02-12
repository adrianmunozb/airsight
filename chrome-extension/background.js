// Background service worker for Eye Tracker extension
// Relays gaze data from the web app to all other tabs

let isTracking = false;
let lastGazePosition = { x: 0, y: 0, vw: 0, vh: 0 }; // Store last position for new tab connections
let userStopped = false;
const NATIVE_HOST_NAME = 'com.eyetracker.server';
const log = (emoji, ...args) => console.log(`${emoji} Eye Tracker:`, ...args);
const warn = (emoji, ...args) => console.warn(`${emoji} Eye Tracker:`, ...args);
const error = (emoji, ...args) => console.error(`${emoji} Eye Tracker:`, ...args);
let heartbeatCount = 0;
let trackerTabId = null;
let keepAwakeRequested = false;

// Log when the active tab changes to debug "other tab" behavior
chrome.tabs.onActivated.addListener((activeInfo) => {
    chrome.tabs.get(activeInfo.tabId).then((tab) => {
        if (!tab || !tab.id) return;
        if (trackerTabId && tab.id === trackerTabId) {
            log('🟢', 'Tracker tab activated', tab.id);
        } else if (trackerTabId) {
            log('🟡', 'Other tab activated', tab.id, tab.url);
        } else {
            log('🧭', 'Tab activated (tracker tab not set)', tab.id, tab.url);
        }
    }).catch((e) => {
        warn('⚠️', 'Active tab lookup failed', e);
    });
});

chrome.tabs.onRemoved.addListener((tabId) => {
    if (trackerTabId === tabId) {
        log('🧹', 'Tracker tab closed', tabId);
        trackerTabId = null;
    }
});

function requestKeepAwake() {
    if (!chrome.power || keepAwakeRequested) return;
    chrome.power.requestKeepAwake('display');
    keepAwakeRequested = true;
}

function releaseKeepAwake() {
    if (!chrome.power || !keepAwakeRequested) return;
    chrome.power.releaseKeepAwake();
    keepAwakeRequested = false;
}

async function startLocalServer() {
    return new Promise((resolve) => {
        log('🚀', 'Starting native server...');
        chrome.runtime.sendNativeMessage(
            NATIVE_HOST_NAME,
            { command: 'startServer', port: 8888 },
            (response) => {
                if (chrome.runtime.lastError) {
                    error('❌', 'Native server error:', chrome.runtime.lastError.message);
                    resolve({ ok: false, error: chrome.runtime.lastError.message });
                    return;
                }
                log('✅', 'Native server response:', response || { ok: true });
                resolve(response || { ok: true });
            }
        );
    });
}

// Broadcast gaze position to all tabs (except the tracker page)
async function broadcastGaze(x, y, vw, vh) {
    try {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
            // Skip chrome:// pages and the tracker page itself
            if (tab.id && tab.url &&
                !tab.url.startsWith('chrome://') &&
                !tab.url.startsWith('chrome-extension://') &&
                !tab.url.includes('localhost:8888') &&
                !tab.url.includes('localhost:5500') &&
                !tab.url.includes('localhost:3000')) {
                try {
                    await chrome.tabs.sendMessage(tab.id, {
                        type: 'GAZE_UPDATE',
                        x: x,
                        y: y,
                        vw: vw,
                        vh: vh
                    });
                } catch (e) {
                    // Tab might not have content script loaded yet
                }
            }
        }
    } catch (error) {
        error('❌', 'Error broadcasting gaze:', error);
    }
}

// Handle messages from popup, content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case 'START_TRACKING':
            isTracking = true;
            userStopped = false;
            chrome.storage.local.set({ isTracking: true });
            requestKeepAwake();
            log('START', 'Tracking started');
            startLocalServer().catch(() => { });
            sendResponse({ success: true });
            break;

        case 'STOP_TRACKING':
            isTracking = false;
            userStopped = true;
            chrome.storage.local.set({ isTracking: false });
            releaseKeepAwake();
            log('STOP', 'Tracking stopped');
            // Tell all tabs to hide gaze dot
            chrome.tabs.query({}).then(tabs => {
                tabs.forEach(tab => {
                    if (tab.id) {
                        chrome.tabs.sendMessage(tab.id, { type: 'HIDE_GAZE' }).catch(() => { });
                    }
                });
            });
            sendResponse({ success: true });
            break;

        case 'START_SERVER':
            log('START_SERVER', 'START_SERVER requested');
            startLocalServer().then((result) => sendResponse(result));
            return true;

        case 'GET_STATUS':
            chrome.storage.local.get(['isTracking', 'isCalibrated'], (data) => {
                log('STATUS', 'GET_STATUS', data);
                isTracking = data.isTracking || false;
                sendResponse({
                    isTracking: data.isTracking || false,
                    isCalibrated: data.isCalibrated || false
                });
            });
            return true; // async response

        case 'GAZE_POSITION':
            // Received from content script on tracker page, broadcast to all other tabs
            // Store the latest position for newly connected tabs
            lastGazePosition = { x: message.x, y: message.y, vw: message.vw, vh: message.vh };
            if (userStopped) {
                break;
            }
            if (isTracking) {
                broadcastGaze(message.x, message.y, message.vw, message.vh);
            }
            // Auto-enable tracking when we receive gaze data
            if (!isTracking) {
                isTracking = true;
                chrome.storage.local.set({ isTracking: true, isCalibrated: true });
                requestKeepAwake();
                log('AUTO', 'Auto-enabled tracking from gaze data');
            }
            break;

        case 'TRACKER_PAGE_ACTIVE':
            // The tracker page is open and monitoring
            chrome.storage.local.set({ isCalibrated: true });
            if (sender.tab && sender.tab.id) {
                const previousTrackerTabId = trackerTabId;
                trackerTabId = sender.tab.id;
                chrome.tabs.setAutoDiscardable(sender.tab.id, false, () => { });
                if (previousTrackerTabId && previousTrackerTabId !== trackerTabId) {
                    log('🔁', 'Tracker tab changed', previousTrackerTabId, '->', trackerTabId);
                } else {
                    log('📍', 'Tracker tab set', trackerTabId);
                }
            }
            log('TRACKER', 'Tracker page active');
            sendResponse({ success: true });
            break;

        case 'CALIBRATION_COMPLETE':
            chrome.storage.local.set({ isCalibrated: true });
            log('CAL', 'Calibration complete');
            sendResponse({ success: true });
            break;

        case 'REQUEST_POSITION':
            // Send the last known position to a newly loaded tab
            if (isTracking && sender.tab && sender.tab.id) {
                chrome.tabs.sendMessage(sender.tab.id, {
                    type: 'GAZE_UPDATE',
                    x: lastGazePosition.x,
                    y: lastGazePosition.y,
                    vw: lastGazePosition.vw,
                    vh: lastGazePosition.vh
                }).catch(() => { });
                log('POS', 'Sent last known position to tab', sender.tab.id);
            }
            break;

        case 'HEARTBEAT':
            // Content script is alive, no action needed
            heartbeatCount += 1;
            if (heartbeatCount % 60 === 0) {
                log('HB', 'Heartbeat', heartbeatCount);
            }
            break;
    }

    return false;
});

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.set({
        isTracking: false,
        isCalibrated: false
    });
});
