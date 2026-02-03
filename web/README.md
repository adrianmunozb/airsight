# WebGazer.js Eye Tracking (Browser)

This is a browser-based alternative using WebGazer.js.

## Run
From `c:\Users\adria\eyetracker`:
```
cd web
python -m http.server 8000
```
Open in your browser:
```
http://localhost:8000
```

## Notes
- Camera permissions must be allowed in the browser.
- Gaze dot shows where the system thinks you are looking.
- Look down to scroll down, up to scroll up, right edge to scroll right.
- Circular menu on the right: dwell to pause, resume, recalibrate, or exit.
- A calibration overlay runs at start; dwell on each dot until it turns green.
