## Eye-Tracking Control Script Plan

### Goals
- Use an existing trained eye-tracking library to control the screen.
- Support scrolling up/down/right.
- Provide a circular on-screen menu icon for basic controls.

### Decisions (options -> shortlist -> final choice)

#### 1) Target OS
Options considered (5-7):
- Windows 10/11
- macOS
- Linux (Ubuntu)
- Cross-platform (Windows/macOS/Linux)
- Android
- iPadOS

Shortlist (1-2):
- Windows 10/11
- Cross-platform (Windows/macOS/Linux)

Final choice:
- Windows 10/11.
Reasoning: The repo path indicates Windows, and OS input + overlay are simplest to ship first on Windows. Cross-platform adds complexity for no immediate benefit.

#### 2) Language/runtime
Options considered (5-7):
- Python
- C#
- C++
- JavaScript/Node
- Rust
- Go

Shortlist (1-2):
- Python
- C#

Final choice:
- Python.
Reasoning: Best ecosystem for computer vision, fastest iteration, and easy integration with eye-tracking models and OS input.

#### 3) Eye-tracking library
Options considered (5-7):
- MediaPipe Face Mesh (iris landmarks)
- OpenCV + custom gaze model
- OpenVINO gaze estimation model
- Pupil Labs SDK
- Tobii SDK
- dlib facial landmarks

Shortlist (1-2):
- MediaPipe Face Mesh
- OpenVINO gaze estimation

Final choice:
- MediaPipe Face Mesh.
Reasoning: Requires no extra training, works in real time, easy Python setup, good-enough accuracy for scroll control.

#### 4) UI overlay for circular menu
Options considered (5-7):
- PyQt6
- Tkinter
- Electron
- WinUI (C#)
- SDL
- Dear ImGui

Shortlist (1-2):
- PyQt6
- Tkinter

Final choice:
- PyQt6.
Reasoning: Reliable always-on-top, transparent overlays and smoother UI control than Tkinter on Windows.

#### 5) OS input control (scroll)
Options considered (5-7):
- pyautogui
- pynput
- pywin32 (SendInput)
- AutoHotkey integration
- uinput (Linux only)
- macOS Quartz events

Shortlist (1-2):
- pywin32 (SendInput)
- pyautogui

Final choice:
- pywin32 (SendInput).
Reasoning: Lower latency and more consistent scroll events on Windows compared to pyautogui.

#### 6) Selection / activation method
Options considered (5-7):
- Dwell time
- Blink detection
- Mouth open detection
- Voice commands
- Hotkey toggle
- Head tilt gesture

Shortlist (1-2):
- Dwell time
- Dwell + hotkey for safety

Final choice:
- Dwell time with a hotkey safety toggle.
Reasoning: Dwell is simplest and least error-prone; hotkey provides a quick disable/enable for safety.

#### 7) Calibration mapping
Options considered (5-7):
- No calibration (raw gaze)
- 3-point calibration
- 5-point calibration
- 9-point calibration
- Continuous adaptive calibration
- Per-user profiles

Shortlist (1-2):
- 5-point calibration
- 9-point calibration

Final choice:
- 5-point calibration.
Reasoning: Balanced accuracy vs. speed; enough for scroll zones without long setup.

### High-Level Architecture
- Input: camera feed -> MediaPipe gaze estimate -> (x, y) gaze point
- Processing: smoothing (EMA), calibration mapping, thresholds, dwell detection
- Actions: OS scroll events and menu selection
- UI overlay: always-on-top circular menu icon with gaze selection

### Step-by-Step Plan
1. Project setup
   - Create Python virtual environment.
   - Add dependencies: opencv-python, mediapipe, pywin32, PyQt6, numpy.
   - Create config file for thresholds and calibration data.

2. Eye tracking integration
   - Capture camera frames via OpenCV.
   - Use MediaPipe Face Mesh to extract iris landmarks.
   - Compute gaze vector and normalize to screen space.
   - Apply EMA smoothing and basic outlier rejection.

3. Calibration flow (5 points)
   - Display 5 calibration targets (center + corners).
   - Collect gaze samples per target.
   - Fit an affine mapping from camera space to screen space.
   - Save calibration to disk per user.

4. Gaze-to-scroll mapping
   - Define screen zones (top/bottom/right edge bands).
   - Trigger scroll on dwell > threshold (e.g., 400-600 ms).
   - Rate limit scrolling and add cool-down to prevent runaway.

5. Circular menu overlay
   - Always-on-top circular icon at a fixed edge location.
   - Expand on dwell to reveal actions (pause, recalibrate, exit).
   - Gaze dwell selects an item; time-out collapses menu.

6. OS input integration
   - Use pywin32 SendInput for scroll events.
   - Provide a hotkey (e.g., Ctrl+Alt+G) to toggle gaze control.

7. Testing and tuning
   - Measure latency end-to-end.
   - Tune smoothing, dwell time, scroll speed, and zone size.
   - Validate with multiple lighting conditions.

8. Documentation
   - Setup steps, calibration instructions, safety tips.
   - Troubleshooting for camera access and overlay issues.

### Deliverables
- `main.py` for eye tracking + control loop
- `overlay.py` for the circular menu UI
- `config.json` for thresholds and calibration data
- `README.md` with setup and usage
