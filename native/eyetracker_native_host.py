import json
import os
import socket
import struct
import subprocess
import sys
import time

HOST = "127.0.0.1"
DEFAULT_PORT = 8888
LOG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "host.log")


def _log(message):
    try:
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        with open(LOG_PATH, "a", encoding="utf-8") as handle:
            handle.write(f"[{timestamp}] {message}\n")
    except Exception:
        pass


def _read_message():
    raw_len = sys.stdin.buffer.read(4)
    if not raw_len:
        return None
    msg_len = struct.unpack('<I', raw_len)[0]
    if msg_len == 0:
        return None
    data = sys.stdin.buffer.read(msg_len)
    if not data:
        return None
    return json.loads(data.decode('utf-8'))


def _send_message(payload):
    encoded = json.dumps(payload).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('<I', len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def _is_listening(port):
    try:
        with socket.create_connection((HOST, port), timeout=0.2):
            return True
    except OSError:
        return False


def _start_server(port, root_dir):
    if _is_listening(port):
        _log(f"Server already running on port {port}")
        return {"ok": True, "alreadyRunning": True}

    cmd = [sys.executable, "-m", "http.server", str(port)]
    kwargs = {
        "cwd": root_dir,
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
    }
    if os.name == "nt":
        kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW

    subprocess.Popen(cmd, **kwargs)
    _log(f"Started server process on port {port} with {sys.executable}")

    for _ in range(20):
        if _is_listening(port):
            _log(f"Server is listening on port {port}")
            return {"ok": True, "alreadyRunning": False}
        time.sleep(0.1)

    _log(f"Server failed to start on port {port}")
    return {"ok": False, "error": "Server did not start"}


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    web_dir = os.path.abspath(os.path.join(script_dir, "..", "web"))
    _log("Native host started")
    _log(f"Using web directory: {web_dir}")

    while True:
        message = _read_message()
        if message is None:
            _log("No more messages, exiting")
            break

        command = message.get("command")
        port = int(message.get("port", DEFAULT_PORT))
        _log(f"Received command: {command} port={port}")

        if not os.path.isdir(web_dir):
            _log("Web directory missing")
            _send_message({"ok": False, "error": f"Web directory not found: {web_dir}"})
            continue

        if command == "startServer":
            response = _start_server(port, web_dir)
            _send_message(response)
        elif command == "status":
            _send_message({"ok": True, "running": _is_listening(port)})
        else:
            _log(f"Unknown command: {command}")
            _send_message({"ok": False, "error": "Unknown command"})


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        _log(f"Fatal error: {exc}")
        _send_message({"ok": False, "error": str(exc)})
