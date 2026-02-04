// Popup script for Eye Tracker extension

const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const calibrateBtn = document.getElementById('calibrate-btn');
const toggleBtn = document.getElementById('toggle-btn');
const stopBtn = document.getElementById('stop-btn');
const toggleIcon = document.getElementById('toggle-icon');
const toggleText = document.getElementById('toggle-text');
const errorText = document.getElementById('error-text');

let currentStatus = {
    isTracking: false,
    isCalibrated: false
};

const log = (emoji, ...args) => console.log(`${emoji} Eye Tracker:`, ...args);
const warn = (emoji, ...args) => console.warn(`${emoji} Eye Tracker:`, ...args);
const error = (emoji, ...args) => console.error(`${emoji} Eye Tracker:`, ...args);

// Update UI based on status
function updateUI() {
    if (errorText) {
        errorText.textContent = '';
        errorText.style.display = 'none';
    }
    if (currentStatus.isTracking) {
        statusIndicator.classList.add('active');
        statusIndicator.classList.remove('calibrating');
        statusText.textContent = 'Tracking active';
        toggleBtn.style.display = 'none';
        stopBtn.style.display = 'flex';
        calibrateBtn.textContent = '?? Recalibrate';
    } else if (currentStatus.isCalibrated) {
        statusIndicator.classList.remove('active', 'calibrating');
        statusText.textContent = 'Calibrated - ready to track';
        toggleBtn.style.display = 'flex';
        stopBtn.style.display = 'none';
        toggleIcon.textContent = '?';
        toggleText.textContent = 'Start Tracking';
        calibrateBtn.textContent = '?? Recalibrate';
    } else {
        statusIndicator.classList.remove('active', 'calibrating');
        statusText.textContent = 'Not calibrated';
        toggleBtn.style.display = 'none';
        stopBtn.style.display = 'none';
        calibrateBtn.textContent = '?? Start Tracker';
    }
}

// Fetch current status
async function fetchStatus() {
    try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
        currentStatus = response;
        log('??', 'Fetched status', response);
        updateUI();
    } catch (error) {
        error('?', 'Error fetching status:', error);
    }
}

// Open the web app for calibration (runs on localhost:8888)
calibrateBtn.addEventListener('click', async () => {
    if (errorText) {
        errorText.textContent = '';
        errorText.style.display = 'none';
    }
    try {
        log('??', 'Starting local server for tracker');
        const response = await chrome.runtime.sendMessage({ type: 'START_SERVER' });
        if (response && response.ok) {
            log('?', 'Server started, opening tracker window');
            let win = null;
            try {
                win = await chrome.windows.create({
                    url: 'http://localhost:8888',
                    type: 'popup',
                    width: 520,
                    height: 360,
                    focused: true
                });
            } catch (e) {
                // Fallback to tab if popup fails
                await chrome.tabs.create({ url: 'http://localhost:8888' });
            }

            if (win && win.tabs && win.tabs[0] && win.tabs[0].id) {
                chrome.tabs.setAutoDiscardable(win.tabs[0].id, false, () => { });
            }
            window.close();
            return;
        }
        const message = (response && response.error) ? response.error : 'Failed to start local server';
        if (errorText) {
            errorText.textContent = message;
            errorText.style.display = 'block';
        }
    } catch (error) {
        error('?', 'Error starting local server:', error);
        if (errorText) {
            errorText.textContent = error.message || 'Failed to start local server';
            errorText.style.display = 'block';
        }
    }
});

// Start tracking
toggleBtn.addEventListener('click', async () => {
    try {
        log('??', 'Start tracking requested');
        await chrome.runtime.sendMessage({ type: 'START_TRACKING' });
        currentStatus.isTracking = true;
        updateUI();
    } catch (error) {
        error('?', 'Error starting tracking:', error);
    }
});

// Stop tracking
stopBtn.addEventListener('click', async () => {
    try {
        log('??', 'Stop tracking requested');
        await chrome.runtime.sendMessage({ type: 'STOP_TRACKING' });
        currentStatus.isTracking = false;
        updateUI();
    } catch (error) {
        error('?', 'Error stopping tracking:', error);
    }
});

// Initialize
log('?', 'Popup loaded');
fetchStatus();
