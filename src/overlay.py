import sys
from PyQt6 import QtCore, QtGui, QtWidgets


class CircularMenuOverlay(QtWidgets.QWidget):
    """Always-on-top circular menu overlay for gaze control."""

    action_selected = QtCore.pyqtSignal(str)

    def __init__(self, radius=28, parent=None):
        super().__init__(parent)
        self.radius = radius
        self.expanded = False
        self.actions = ["pause", "resume", "recalibrate", "exit"]
        self.hover_action = None

        self.setWindowFlags(
            QtCore.Qt.WindowType.FramelessWindowHint
            | QtCore.Qt.WindowType.WindowStaysOnTopHint
            | QtCore.Qt.WindowType.Tool
        )
        self.setAttribute(QtCore.Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.setFixedSize(200, 200)

        # Default location: right edge, mid-height
        screen = QtGui.QGuiApplication.primaryScreen().geometry()
        self.move(screen.width() - self.width() - 20, (screen.height() - self.height()) // 2)

    def screen_center(self):
        pos = self.pos()
        return (pos.x() + self.width() / 2, pos.y() + self.height() / 2)

    def action_at(self, screen_x, screen_y):
        if not self.expanded:
            return None
        cx, cy = self.screen_center()
        ring_radius = self.radius + 36
        angle_step = 360 / max(1, len(self.actions))
        for i, action in enumerate(self.actions):
            angle_deg = i * angle_step - 90
            radians = angle_deg * 3.14159 / 180.0
            x = cx + ring_radius * QtCore.qCos(radians)
            y = cy + ring_radius * QtCore.qSin(radians)
            if (screen_x - x) ** 2 + (screen_y - y) ** 2 <= 20 ** 2:
                return action
        return None

    def is_in_base_circle(self, screen_x, screen_y):
        cx, cy = self.screen_center()
        return (screen_x - cx) ** 2 + (screen_y - cy) ** 2 <= self.radius ** 2

    def toggle_expand(self, expand=None):
        if expand is None:
            self.expanded = not self.expanded
        else:
            self.expanded = bool(expand)
        self.update()

    def set_hover_action(self, action_name):
        if self.hover_action != action_name:
            self.hover_action = action_name
            self.update()

    def paintEvent(self, _event):
        painter = QtGui.QPainter(self)
        painter.setRenderHint(QtGui.QPainter.RenderHint.Antialiasing)

        center = QtCore.QPointF(self.width() / 2, self.height() / 2)
        base_color = QtGui.QColor(30, 30, 30, 160)
        highlight = QtGui.QColor(60, 160, 220, 200)

        # Base circle
        painter.setBrush(QtGui.QBrush(base_color))
        painter.setPen(QtCore.Qt.PenStyle.NoPen)
        painter.drawEllipse(center, self.radius, self.radius)

        if not self.expanded:
            return

        # Expanded action rings
        ring_radius = self.radius + 36
        angle_step = 360 / max(1, len(self.actions))
        for i, action in enumerate(self.actions):
            angle_deg = i * angle_step - 90
            radians = angle_deg * 3.14159 / 180.0
            x = center.x() + ring_radius * QtCore.qCos(radians)
            y = center.y() + ring_radius * QtCore.qSin(radians)

            action_color = highlight if action == self.hover_action else base_color
            painter.setBrush(QtGui.QBrush(action_color))
            painter.drawEllipse(QtCore.QPointF(x, y), 20, 20)

            painter.setPen(QtGui.QPen(QtGui.QColor(240, 240, 240, 220)))
            painter.drawText(
                QtCore.QRectF(x - 24, y - 10, 48, 20),
                QtCore.Qt.AlignmentFlag.AlignCenter,
                action[:1].upper(),
            )


def run_overlay():
    app = QtWidgets.QApplication(sys.argv)
    overlay = CircularMenuOverlay()
    overlay.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    run_overlay()
