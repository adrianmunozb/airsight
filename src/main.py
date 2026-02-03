import json
import time
from dataclasses import dataclass

import cv2
import mediapipe as mp
import numpy as np
from PyQt6 import QtWidgets

from ctypes import windll

from overlay import CircularMenuOverlay


WHEEL_DELTA = 120
VK_SHIFT = 0x10
KEYEVENTF_KEYUP = 0x0002


@dataclass
class DwellState:
    active_zone: str = None
    start_ts: float = 0.0
    last_fire_ts: float = 0.0


class ScrollController:
    def __init__(self, amount, interval_ms):
        self.amount = int(amount)
        self.interval_ms = int(interval_ms)

    def scroll(self, delta):
        # delta in multiples of WHEEL_DELTA
        windll.user32.mouse_event(0x0800, 0, 0, int(delta), 0)

    def scroll_up(self):
        self.scroll(self.amount)

    def scroll_down(self):
        self.scroll(-self.amount)

    def scroll_right(self):
        # Use SHIFT+wheel to trigger horizontal scroll in many apps.
        windll.user32.keybd_event(VK_SHIFT, 0, 0, 0)
        self.scroll(-self.amount)
        windll.user32.keybd_event(VK_SHIFT, 0, KEYEVENTF_KEYUP, 0)


class GazeSmoother:
    def __init__(self, alpha, outlier_px):
        self.alpha = float(alpha)
        self.outlier_px = float(outlier_px)
        self.last = None

    def update(self, point):
        if self.last is None:
            self.last = point
            return point

        dist = np.linalg.norm(np.array(point) - np.array(self.last))
        if dist > self.outlier_px:
            return self.last

        smoothed = (
            self.alpha * np.array(point) + (1.0 - self.alpha) * np.array(self.last)
        )
        self.last = tuple(smoothed)
        return self.last


class EyeTrackerController:
    def __init__(self, config):
        self.config = config
        self.screen_w = config["screen"]["width"]
        self.screen_h = config["screen"]["height"]
        self.dwell_cfg = config["dwell"]
        self.zones = config["zones"]
        self.scroll = ScrollController(
            config["scroll"]["amount"], config["scroll"]["interval_ms"]
        )
        self.smoother = GazeSmoother(
            config["smoothing"]["ema_alpha"], config["smoothing"]["outlier_px"]
        )
        self.dwell = DwellState()
        self.enabled = True
        self.menu_dwell = DwellState()
        self.show_preview = bool(config.get("show_preview", False))

        self.calibration = config.get("calibration", {})
        self.calibration_matrix = self.calibration.get("matrix")

        if not hasattr(mp, "solutions"):
            raise RuntimeError(
                "MediaPipe 'solutions' not available. Reinstall with mediapipe==0.10.9."
            )
        self.mp_face_mesh = mp.solutions.face_mesh
        self.face_mesh = self.mp_face_mesh.FaceMesh(
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.6,
            min_tracking_confidence=0.6,
        )

    def _compute_iris_center(self, landmarks, image_w, image_h):
        # Iris landmarks (left and right) from MediaPipe Face Mesh
        left_ids = [474, 475, 476, 477]
        right_ids = [469, 470, 471, 472]

        def center(ids):
            pts = [landmarks[i] for i in ids]
            xs = [p.x * image_w for p in pts]
            ys = [p.y * image_h for p in pts]
            return (sum(xs) / len(xs), sum(ys) / len(ys))

        left = center(left_ids)
        right = center(right_ids)
        return ((left[0] + right[0]) / 2.0, (left[1] + right[1]) / 2.0)

    def _map_to_screen(self, gaze_xy, frame_w, frame_h):
        if self.calibration_matrix is not None:
            x, y = gaze_xy
            vec = np.array([x, y, 1.0])
            mapped = np.dot(self.calibration_matrix, vec)
            return (float(mapped[0]), float(mapped[1]))

        # Simple normalization to screen size if not calibrated.
        x = np.clip(gaze_xy[0] / frame_w, 0.0, 1.0)
        y = np.clip(gaze_xy[1] / frame_h, 0.0, 1.0)
        return (x * self.screen_w, y * self.screen_h)

    def _zone_for_point(self, x, y):
        if y <= self.zones["top_px"]:
            return "scroll_up"
        if y >= self.screen_h - self.zones["bottom_px"]:
            return "scroll_down"
        if x >= self.screen_w - self.zones["right_px"]:
            return "scroll_right"
        return None

    def _process_dwell(self, zone, now):
        threshold = self.dwell_cfg["threshold_ms"] / 1000.0
        cooldown = self.dwell_cfg["cooldown_ms"] / 1000.0

        if zone != self.dwell.active_zone:
            self.dwell.active_zone = zone
            self.dwell.start_ts = now
            return

        if zone is None:
            return

        if now - self.dwell.last_fire_ts < cooldown:
            return

        if now - self.dwell.start_ts >= threshold:
            self.dwell.last_fire_ts = now
            if zone == "scroll_up":
                self.scroll.scroll_up()
            elif zone == "scroll_down":
                self.scroll.scroll_down()
            elif zone == "scroll_right":
                self.scroll.scroll_right()

    def _process_menu_dwell(self, action, now):
        threshold = self.dwell_cfg["threshold_ms"] / 1000.0
        if action != self.menu_dwell.active_zone:
            self.menu_dwell.active_zone = action
            self.menu_dwell.start_ts = now
            return False
        if action is None:
            return False
        if now - self.menu_dwell.start_ts >= threshold:
            self.menu_dwell.active_zone = None
            return True
        return False

    def _save_calibration(self, matrix):
        self.config.setdefault("calibration", {})
        self.config["calibration"]["matrix"] = matrix.tolist()
        with open("config.json", "w", encoding="ascii") as f:
            json.dump(self.config, f, indent=2)
        self.calibration_matrix = matrix

    def run_calibration(self, cap):
        points = [
            (0.5, 0.5),
            (0.1, 0.1),
            (0.9, 0.1),
            (0.1, 0.9),
            (0.9, 0.9),
        ]
        samples = []
        targets = []

        for nx, ny in points:
            dwell_start = None
            while True:
                ok, frame = cap.read()
                if not ok:
                    return
                frame = cv2.flip(frame, 1)
                h, w, _ = frame.shape
                cx = int(nx * w)
                cy = int(ny * h)
                cv2.circle(frame, (cx, cy), 12, (0, 255, 0), -1)
                cv2.putText(
                    frame,
                    "Look at the dot to capture (dwell)",
                    (20, 40),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.7,
                    (255, 255, 255),
                    2,
                )
                cv2.imshow("calibration", frame)
                _ = cv2.waitKey(1)
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                result = self.face_mesh.process(rgb)
                if result.multi_face_landmarks:
                    landmarks = result.multi_face_landmarks[0].landmark
                    iris_xy = self._compute_iris_center(landmarks, w, h)
                    # Check dwell near the target dot
                    dx = abs(iris_xy[0] - cx)
                    dy = abs(iris_xy[1] - cy)
                    if dx <= 40 and dy <= 40:
                        if dwell_start is None:
                            dwell_start = time.time()
                        elif time.time() - dwell_start >= 0.6:
                            samples.append([iris_xy[0], iris_xy[1], 1.0])
                            targets.append([nx * self.screen_w, ny * self.screen_h])
                            break
                    else:
                        dwell_start = None

        cv2.destroyWindow("calibration")

        A = np.array(samples)
        B = np.array(targets)
        if len(A) >= 3:
            matrix, _, _, _ = np.linalg.lstsq(A, B, rcond=None)
            self._save_calibration(matrix.T)

    def run(self):
        cap = cv2.VideoCapture(self.config["camera_index"])
        if not cap.isOpened():
            raise RuntimeError("Camera not accessible")

        if self.calibration.get("enabled") and not self.calibration_matrix:
            self.run_calibration(cap)

        app = QtWidgets.QApplication.instance()
        if app is None:
            app = QtWidgets.QApplication([])
        overlay = CircularMenuOverlay()
        overlay.show()

        while True:
            ok, frame = cap.read()
            if not ok:
                break

            frame = cv2.flip(frame, 1)
            h, w, _ = frame.shape
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result = self.face_mesh.process(rgb)

            if result.multi_face_landmarks:
                landmarks = result.multi_face_landmarks[0].landmark
                iris_xy = self._compute_iris_center(landmarks, w, h)
                screen_xy = self._map_to_screen(iris_xy, w, h)
                screen_xy = self.smoother.update(screen_xy)

                if overlay.is_in_base_circle(screen_xy[0], screen_xy[1]):
                    overlay.toggle_expand(True)

                action = overlay.action_at(screen_xy[0], screen_xy[1])
                overlay.set_hover_action(action)
                if self._process_menu_dwell(action, time.time()):
                    if action == "pause":
                        self.enabled = False
                    elif action == "resume":
                        self.enabled = True
                    elif action == "recalibrate":
                        self.run_calibration(cap)
                    elif action == "exit":
                        break

                if self.enabled:
                    zone = self._zone_for_point(screen_xy[0], screen_xy[1])
                    self._process_dwell(zone, time.time())

            if self.show_preview:
                if result.multi_face_landmarks:
                    x = int(np.clip(screen_xy[0], 0, self.screen_w - 1) / self.screen_w * w)
                    y = int(np.clip(screen_xy[1], 0, self.screen_h - 1) / self.screen_h * h)
                    cv2.circle(frame, (x, y), 6, (0, 0, 255), -1)
                cv2.imshow("eye-tracker", frame)
                if cv2.waitKey(1) & 0xFF == 27:
                    break
            app.processEvents()

        cap.release()
        if self.show_preview:
            cv2.destroyAllWindows()


def load_config(path="config.json"):
    with open(path, "r", encoding="ascii") as f:
        config = json.load(f)
    if "screen" not in config:
        config["screen"] = {}
    if not config["screen"].get("width") or not config["screen"].get("height"):
        config["screen"]["width"] = int(windll.user32.GetSystemMetrics(0))
        config["screen"]["height"] = int(windll.user32.GetSystemMetrics(1))
    return config


def main():
    config = load_config()
    controller = EyeTrackerController(config)
    controller.run()


if __name__ == "__main__":
    main()
