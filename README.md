# 🎯 AirSight — Eye Tracker Control

> Control your computer and browse the web **hands-free** using only your eyes.

AirSight uses your webcam and machine learning to detect where you are looking and translate that into scroll actions — no special hardware required.

---

## 📋 Table of Contents

1. [What This Project Does](#1-what-this-project-does)
2. [Requirements](#2-requirements)
3. [Installation — One-Time Setup](#3-installation--one-time-setup)
4. [Option A: Chrome / Edge Extension (Recommended)](#4-option-a-chrome--edge-extension-recommended)
   - [4.1 Load the Extension in Chrome](#41-load-the-extension-in-chrome)
   - [4.2 Calibrate and Start Tracking](#42-calibrate-and-start-tracking)
   - [4.3 Install the Native Host (Auto-Start Local Server)](#43-install-the-native-host-auto-start-local-server)
5. [Option B: Desktop Python App](#5-option-b-desktop-python-app)
6. [Option C: Browser-Only Web App](#6-option-c-browser-only-web-app)
7. [How Calibration Works](#7-how-calibration-works)
8. [How to Use Eye Tracking (Controls)](#8-how-to-use-eye-tracking-controls)
9. [Configuration Reference (config.json)](#9-configuration-reference-configjson)
10. [Troubleshooting](#10-troubleshooting)
11. [Project File Structure](#11-project-file-structure)

---

## 1. What This Project Does

AirSight has **three separate ways** to use eye tracking:

| Mode | What it is | Best for |
|---|---|---|
| **Chrome Extension** | Adds eye tracking to any website in Chrome/Edge | Everyday browsing |
| **Desktop Python App** | A standalone Python app with an overlay window | Any application on your PC |
| **Web App** | A plain web page — no installation needed | Quick demos or testing |

All three use your **webcam** and a **calibration step** to learn where your eyes are pointing.

---

## 2. Requirements

Before you begin, make sure you have:

- ✅ **Windows 10 or Windows 11** (64-bit)
- ✅ A **webcam** (built-in laptop cameras work fine)
- ✅ **Google Chrome** or **Microsoft Edge** (for the extension)
- ✅ **Python 3.10 or newer**

### How to check if Python is installed

1. Press `Win + R`, type `cmd`, and press **Enter** to open a Command Prompt.
2. Type the following and press **Enter**:
   ```
   python --version
   ```
3. If you see something like `Python 3.11.4`, you are good. If you see an error, download Python from [python.org/downloads](https://www.python.org/downloads/) — make sure to tick **"Add Python to PATH"** during installation.

---

## 3. Installation — One-Time Setup

These steps only need to be done **once**. They install the required Python libraries.

### Step 1 — Download or clone the repository

If you have Git installed, open a Command Prompt and run:
```
git clone https://github.com/adrianmunozb/airsight.git
cd airsight
```

If you don't have Git, click the green **"Code"** button on GitHub and choose **"Download ZIP"**, then extract the folder.

### Step 2 — Open a Command Prompt in the project folder

1. Open **File Explorer** and navigate to the `eyetracker` folder.
2. Click the address bar at the top of the window, type `cmd`, and press **Enter**.  
   A Command Prompt will open already pointing to the correct folder.

### Step 3 — Create a virtual environment

A virtual environment keeps this project's libraries separate from the rest of your system. Run:
```
python -m venv .venv
```

### Step 4 — Activate the virtual environment

```
.\.venv\Scripts\activate
```

You will see `(.venv)` appear at the start of your command prompt line. This confirms the virtual environment is active.

> ⚠️ **Every time** you open a new Command Prompt to run the app, you must run this activate command again before anything else.

### Step 5 — Install the required libraries

```
pip install -r requirements.txt
```

This will download and install:
- `opencv-python` — reads your webcam
- `mediapipe==0.10.9` — detects your face and eyes
- `numpy` — math and number processing
- `pywin32` — sends scroll events to Windows
- `PyQt6` — draws the overlay window

Wait for the installation to finish (it may take a minute or two).

---

## 4. Option A: Chrome / Edge Extension (Recommended)

The Chrome Extension adds a floating red gaze dot and scroll zones to **every website** you visit.

### 4.1 Load the Extension in Chrome

> The extension is not on the Chrome Web Store yet, so it is loaded manually.

1. Open Chrome and go to: `chrome://extensions`
2. Turn on **"Developer mode"** using the toggle in the top-right corner.
3. Click **"Load unpacked"**.
4. Navigate to the `eyetracker` folder, then select the **`chrome-extension`** subfolder and click **"Select Folder"**.
5. The **Eye Tracker** extension will now appear in your extensions list.
6. Click the **puzzle piece icon** 🧩 in the Chrome toolbar and pin the Eye Tracker extension so it is always visible.

### 4.2 Calibrate and Start Tracking

1. Click the **Eye Tracker icon** in your toolbar.
2. A popup appears with a single **"🎯 Calibrate"** button. Click it.
3. A new **Calibration tab** will open — see [Section 7](#7-how-calibration-works) for what to do.
4. After calibration is complete, the calibration tab will close automatically.
5. Click the Eye Tracker icon again — you will now see:
   - A status indicator (green dot = active)
   - **Start Tracking** / **Stop Tracking** buttons
   - A **Hide Overlay** / **Show Overlay** button

| Button | What it does |
|---|---|
| 🎯 **Calibrate** | Runs a new calibration so the tracker learns your gaze |
| ▶ **Start Tracking** | Activates the gaze dot and scroll zones on all tabs |
| ⏹ **Stop Tracking** | Pauses tracking but keeps calibration data |
| 👁️ **Hide Overlay** | Hides the red dot and green rectangles (tracking still works) |

### 4.3 Install the Native Host (Auto-Start Local Server)

The extension needs a small helper program (a "native host") to automatically launch the local web server when you start tracking. Without this step, you must start the server manually each time.

**This is a one-time setup:**

1. First, load the extension as described in [Section 4.1](#41-load-the-extension-in-chrome).
2. On the `chrome://extensions` page, find **Eye Tracker Overlay** and copy its **ID** — it looks like a long string of letters, e.g. `abcdefghijklmnopabcdefghijklmnop`.
3. Open a **PowerShell** window as Administrator:
   - Press `Win + X` and choose **"Windows PowerShell (Admin)"** or **"Terminal (Admin)"**.
4. Navigate to the project's `native` folder:
   ```powershell
   cd "C:\Users\adria\eyetracker\native"
   ```
5. Run the installer, replacing `YOUR_EXTENSION_ID` with the ID you copied:
   ```powershell
   .\install_native_host.ps1 -ExtensionId YOUR_EXTENSION_ID
   ```
   Example:
   ```powershell
   .\install_native_host.ps1 -ExtensionId abcdefghijklmnopabcdefghijklmnop
   ```
6. You should see a success message. Go back to `chrome://extensions` and click the **Reload** button (circular arrow) next to Eye Tracker Overlay.

The extension can now automatically start and stop the eye-tracking server when you click Start/Stop.

---

## 5. Option B: Desktop Python App

This is a standalone Python program that draws a transparent overlay on top of your entire screen and works with **any application**, not just the browser.

### Step 1 — Activate the virtual environment (if not already active)

```
.\.venv\Scripts\activate
```

### Step 2 — Run the application

```
python src\main.py
```

A transparent overlay window will appear on your screen. If this is your **first time running** the app (or if no calibration file exists), the calibration screen will start automatically.

### What happens at startup

1. **Calibration** — A series of dots appear on screen. Look at each one until it is captured (see [Section 7](#7-how-calibration-works)).
2. **Tracking begins** — After calibration, the app watches your eyes continuously.
3. **Scroll zones are active** — Look at the top or bottom edge of the screen to trigger scrolling.
4. **Circular menu** — A small circular icon appears on the right side of the screen (see [Section 8](#8-how-to-use-eye-tracking-controls)).

### Step 3 — Stop the application

- Dwell your gaze on the circular menu on the right side and select **Exit**.
- Or close the overlay window.

---

## 6. Option C: Browser-Only Web App

This option requires **no extension** and runs entirely inside a browser tab. It is useful for testing or demonstration.

### Step 1 — Activate the virtual environment (if not already active)

```
.\.venv\Scripts\activate
```

### Step 2 — Start a local web server

From the project root folder:
```
python -m http.server 8000 --directory web
```

### Step 3 — Open the app in your browser

Open Chrome, Edge, or any modern browser and go to:
```
http://localhost:8000
```

### Step 4 — Allow camera access

When the browser asks for camera permission, click **"Allow"**.

### Step 5 — Calibrate and use

- A calibration overlay will appear automatically. Follow the on-screen instructions (see [Section 7](#7-how-calibration-works)).
- After calibration, you will see a **red gaze dot** following your eyes.
- Look at the top or bottom edge to scroll, or use the circular menu on the right.

### Step 6 — Stop

Close the browser tab or navigate away. The server can be stopped by pressing `Ctrl + C` in the Command Prompt.

---

## 7. How Calibration Works

Calibration teaches the system where **your** eyes look on the screen. It must be done at least once (the result is saved).

### Steps during calibration

1. **Sit comfortably** in front of your webcam — about 40–70 cm (16–28 inches) away works best.
2. **Make sure your face is well lit** — avoid strong backlighting (e.g., a window directly behind you).
3. A **sequence of dots** appears on screen (5 points: corners + center).
4. **Look directly at each dot** and hold your gaze on it. You do not need to press anything — the system collects samples automatically using "dwell" (holding your gaze still for ~0.5 seconds).
5. When enough samples are collected, the dot will move to the next position.
6. When all dots are done, calibration is **saved to disk** and does not need to be repeated unless you move your chair, change your display setup, or accuracy degrades.

### Tips for better calibration

- Keep your **head still** during calibration.
- **Remove glasses** if possible, or ensure they don't cause glare.
- Use the same **lighting and seating position** each time.
- If tracking feels inaccurate, click **Calibrate** again in the extension popup.

---

## 8. How to Use Eye Tracking (Controls)

Once tracking is active, these actions are available in all three modes:

### Scroll Zones

The screen is divided into invisible zones. Look at a zone for ~0.5 seconds (dwell) to trigger the action:

| Where you look | Action |
|---|---|
| **Top edge** of screen | Scroll **up** |
| **Bottom edge** of screen | Scroll **down** |
| **Right edge** of screen | Scroll **right** (horizontal scroll) |

### Circular Menu (Desktop App & Web App)

A small menu icon sits on the right side of the screen. **Look at it** to expand it, then dwell on a dot to select an option:

| Menu option | Action |
|---|---|
| **Pause** | Temporarily stop gaze-based scrolling |
| **Resume** | Turn scrolling back on |
| **Recalibrate** | Start a new calibration |
| **Exit** | Close the application |

### Chrome Extension Controls

Use the **popup** (click the Eye Tracker icon in the toolbar) to:
- Start or stop tracking
- Show or hide the gaze overlay (red dot + green rectangles)
- Recalibrate at any time

---

## 9. Configuration Reference (`config.json`)

The `config.json` file in the project root controls how the eye tracker behaves. You can open it with Notepad or any text editor.

```json
{
  "camera_index": 0,
  "screen": {
    "width": 1920,
    "height": 1080
  },
  "calibration": {
    "enabled": true,
    "points": 5
  },
  "smoothing": {
    "ema_alpha": 0.35,
    "outlier_px": 200
  },
  "dwell": {
    "threshold_ms": 500,
    "cooldown_ms": 250
  },
  "zones": {
    "top_px": 120,
    "bottom_px": 120,
    "right_px": 140
  },
  "scroll": {
    "amount": 120,
    "interval_ms": 90
  },
  "show_preview": false
}
```

| Setting | What it controls | Default |
|---|---|---|
| `camera_index` | Which camera to use. `0` = built-in webcam, `1` = first external camera | `0` |
| `screen.width` / `screen.height` | Your monitor resolution. **Leave as-is** — detected automatically | `1920` / `1080` |
| `calibration.enabled` | Set to `false` to skip calibration (uses last saved data) | `true` |
| `calibration.points` | Number of calibration dots. More = more accurate, but slower | `5` |
| `smoothing.ema_alpha` | How much to smooth gaze movement. Lower = smoother but laggier (range: 0.1–1.0) | `0.35` |
| `smoothing.outlier_px` | Ignore jumps larger than this many pixels | `200` |
| `dwell.threshold_ms` | How long (in milliseconds) to hold your gaze to trigger a scroll | `500` |
| `dwell.cooldown_ms` | Pause after a scroll before the next one can trigger | `250` |
| `zones.top_px` | Height (in pixels) of the scroll-up zone at the top of the screen | `120` |
| `zones.bottom_px` | Height (in pixels) of the scroll-down zone at the bottom | `120` |
| `zones.right_px` | Width (in pixels) of the scroll-right zone on the right edge | `140` |
| `scroll.amount` | How many scroll units to send per scroll event | `120` |
| `scroll.interval_ms` | Delay between repeated scroll events while dwelling | `90` |
| `show_preview` | Set to `true` to show a small camera preview window | `false` |

---

## 10. Troubleshooting

### ❌ Camera not detected / black screen
- Make sure no other app is using your webcam at the same time (e.g., Zoom, Teams, or another browser tab).
- Try changing `camera_index` in `config.json` from `0` to `1`.
- On Chrome, go to `chrome://settings/content/camera` and make sure the camera is allowed.

### ❌ Eye tracking is very inaccurate
- Redo calibration: click **Calibrate** in the extension popup or restart the Python app.
- Improve lighting — avoid sitting with a bright window behind you.
- Ensure your face is fully visible and centred in the camera frame.
- Try reducing `smoothing.ema_alpha` in `config.json` (e.g. `0.2`).

### ❌ Scrolling triggers too easily / not easily enough
- Increase `dwell.threshold_ms` (e.g. `800`) to require a longer gaze hold.
- Decrease the zone size (`top_px`, `bottom_px`) to make the trigger area smaller.

### ❌ Extension shows "Not tracking" and won't start
- Make sure you completed calibration first.
- If you installed the native host, reload the extension on `chrome://extensions`.
- Check that the Python virtual environment has all packages installed (`pip install -r requirements.txt`).

### ❌ PowerShell says "cannot be loaded because running scripts is disabled"
Run this command in PowerShell (as Administrator) to allow local scripts:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```
Then try running the install script again.

### ❌ `ModuleNotFoundError: No module named 'mediapipe'`
- Make sure the virtual environment is activated (you should see `(.venv)` in your prompt).
- Re-run: `pip install -r requirements.txt`
- If MediaPipe errors about `solutions`, run: `pip install mediapipe==0.10.9`

### ❌ The gaze dot trails behind or freezes on other tabs
This is expected browser behaviour (Chrome throttles background tabs). The extension uses an anti-throttle mechanism. Make sure the webcam/calibration tab is not closed while tracking.

---

## 11. Project File Structure

```
eyetracker/
│
├── chrome-extension/       ← Chrome / Edge extension files
│   ├── manifest.json       ← Extension configuration & permissions
│   ├── popup.html          ← The popup UI (Start, Stop, Calibrate buttons)
│   ├── popup.js            ← Popup button logic
│   ├── calibration.html    ← Full-screen calibration page
│   ├── calibration.js      ← Calibration dot logic and WebGazer setup
│   ├── background.js       ← Service worker: manages state across tabs
│   ├── content.js          ← Injected into every page: gaze dot + scrolling
│   ├── content.css         ← Styles for the gaze overlay
│   ├── offscreen.html      ← Hidden page used to keep tracking alive
│   ├── offscreen.js        ← Anti-throttle logic (keeps camera active)
│   ├── webgazer.js         ← WebGazer eye-tracking library
│   └── icons/              ← Extension icons (16px, 48px, 128px)
│
├── native/                 ← Native host (auto-starts local server)
│   ├── install_native_host.ps1      ← Run once to register the native host
│   ├── eyetracker_native_host.py    ← Python native messaging host script
│   └── eyetracker_native_host.cmd  ← Launcher for the native host
│
├── src/                    ← Desktop Python app source code
│   ├── main.py             ← Main loop: camera, gaze, calibration, scrolling
│   └── overlay.py          ← PyQt6 circular menu overlay window
│
├── web/                    ← Browser-only web app (no extension needed)
│   ├── index.html          ← Single-page app
│   ├── app.js              ← All gaze, calibration, and scroll logic
│   ├── style.css           ← UI styles
│   └── webgazer.js         ← WebGazer eye-tracking library
│
├── config.json             ← All tunable settings (see Section 9)
├── requirements.txt        ← Python package dependencies
├── chrome-extension.crx    ← Packaged extension (alternative to "Load unpacked")
└── README.md               ← This file
```

---

## Acknowledgements

- **[WebGazer.js](https://webgazer.cs.brown.edu/)** — browser-based eye tracking library by Brown University
- **[MediaPipe](https://mediapipe.dev/)** — face and iris landmark detection by Google
- **[PyQt6](https://www.riverbankcomputing.com/software/pyqt/)** — cross-platform GUI framework

---

*For questions or issues, please open a GitHub Issue.*
