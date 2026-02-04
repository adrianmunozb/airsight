# EyeTracker Control

Prototype eye-tracking control for scrolling with a circular on-screen menu.

## Requirements
- Windows 10/11
- Python 3.10+
- Webcam

## Setup
```
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

## Run
```
python src\main.py
```

## Auto-start local web server (Chrome extension)
The extension cannot start a local server without a native host. To enable
auto-start for `http://localhost:8888`, install the native host once:
1) Load the extension in `chrome://extensions` and copy its ID.
2) Run:
```
.\native\install_native_host.ps1 -ExtensionId <YOUR_EXTENSION_ID>
```
3) Reload the extension.

## Notes
- Calibration runs on first start if no calibration matrix exists (press SPACE to capture each point).
- Calibration captures points by gaze dwell (no keyboard required).
- Gaze dwell scroll zones are active by default; look down to scroll down, up to scroll up.
- The circular menu appears on the right side; dwell on its dots to pause, recalibrate, or exit.
- Screen size is detected automatically; you can still override it in `config.json` if needed.
- The preview window is disabled by default; set `show_preview` to true if you want it.
- If you previously installed a newer MediaPipe without `solutions`, reinstall with the pinned version in `requirements.txt`.
