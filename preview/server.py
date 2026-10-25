#!/usr/bin/env python3
"""Read-only preview harness for the Beyondwords local toolkit.

The project ships a Python CLI and an optional STDIO MCP server; it has no web
UI and no hosted backend. This harness runs the project's own CLI (`doctor` and
`--help`) from the bind-mounted source and renders the real output, so the
preview shows the toolkit working rather than a static mock-up.

Nothing here writes to the source tree or to a publishing project.
"""
from __future__ import annotations

import html
import json
import os
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("PORT", "3000"))
PYTHON = os.environ.get("BEYONDWORDS_PYTHON", sys.executable)
CLI = os.environ.get("BEYONDWORDS_CLI", "/workspace/.agents/skills/beyondwords/scripts/beyondwords.py")
SCRIPTS = os.environ.get("BEYONDWORDS_SCRIPTS", "/workspace/.agents/skills/beyondwords/scripts")

# Cache CLI output for 30 seconds so repeated requests don't re-run the doctor.
_cache: dict[str, object] = {"ts": 0.0, "doctor": None, "help": None}
_CACHE_TTL = 30.0


def _run(args: list[str], timeout: int = 15) -> str:
    env = dict(os.environ)
    env["PYTHONPATH"] = SCRIPTS
    try:
        r = subprocess.run(
            [PYTHON, CLI, *args],
            capture_output=True, text=True, timeout=timeout, env=env,
        )
        return r.stdout if r.returncode == 0 else r.stderr or r.stdout
    except subprocess.TimeoutExpired:
        return "timed out"
    except Exception as exc:
        return str(exc)


def _get_outputs() -> dict[str, str]:
    now = time.time()
    if _cache["doctor"] is None or now - _cache["ts"] > _CACHE_TTL:
        _cache["doctor"] = _run(["doctor", "--input", "/dev/null"]) if False else _run_doctor()
        _cache["help"] = _run(["--help"])
        _cache["ts"] = now
    return {"doctor": _cache["doctor"], "help": _cache["help"]}


def _run_doctor() -> str:
    """Run the doctor operation and return pretty-printed JSON."""
    env = dict(os.environ)
    env["PYTHONPATH"] = SCRIPTS
    try:
        r = subprocess.run(
            [PYTHON, CLI, "doctor"],
            capture_output=True, text=True, timeout=15, env=env,
        )
        if r.returncode == 0 and r.stdout:
            try:
                return json.dumps(json.loads(r.stdout), indent=2, ensure_ascii=False)
            except json.JSONDecodeError:
                return r.stdout
        return r.stderr or r.stdout or "no output"
    except subprocess.TimeoutExpired:
        return "doctor timed out"
    except Exception as exc:
        return str(exc)


PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Beyondwords Toolkit — Status</title>
<style>
  :root {{ --bg:#0f1117; --card:#1a1d28; --ink:#e4e6eb; --dim:#8b90a0;
           --accent:#7c9eff; --green:#4ecca3; --amber:#e8c547; --border:#2a2e3a; }}
  * {{ box-sizing:border-box; margin:0; padding:0; }}
  body {{ background:var(--bg); color:var(--ink); font-family:system-ui,-apple-system,
         'Segoe UI',Roboto,sans-serif; line-height:1.6; padding:1.25rem; }}
  header {{ text-align:center; margin-bottom:1.5rem; }}
  h1 {{ font-size:1.4rem; font-weight:700; }}
  .sub {{ color:var(--dim); font-size:.85rem; margin-top:.25rem; }}
  .grid {{ display:grid; gap:1rem; max-width:820px; margin:0 auto; }}
  .card {{ background:var(--card); border:1px solid var(--border); border-radius:12px;
          padding:1rem 1.1rem; overflow-x:auto; }}
  .card h2 {{ font-size:.95rem; color:var(--accent); margin-bottom:.6rem;
             display:flex; align-items:center; gap:.4rem; }}
  pre {{ font-family:'SF Mono',Consolas,'Liberation Mono',monospace; font-size:.78rem;
         white-space:pre-wrap; word-break:break-word; color:var(--ink); }}
  .pill {{ display:inline-block; padding:.15rem .55rem; border-radius:99px;
          font-size:.72rem; font-weight:600; }}
  .ok {{ background:rgba(78,204,163,.15); color:var(--green); }}
  .info {{ background:rgba(124,158,255,.15); color:var(--accent); }}
  footer {{ text-align:center; color:var(--dim); font-size:.75rem; margin-top:1.5rem; }}
</style>
</head>
<body>
  <header>
    <h1>📚 Beyondwords Toolkit</h1>
    <p class="sub">Local publishing-house CLI — live status from <code>doctor</code></p>
  </header>
  <div class="grid">
    <div class="card">
      <h2><span class="pill ok">LIVE</span> Doctor output</h2>
      <pre>{doctor}</pre>
    </div>
    <div class="card">
      <h2><span class="pill info">CLI</span> Available operations</h2>
      <pre>{help}</pre>
    </div>
  </div>
  <footer>Read-only preview · no writes to source or publishing projects</footer>
</body>
</html>"""


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: bytes, ctype: str = "text/html; charset=utf-8"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/healthz":
            self._send(200, b'{"status":"ok"}', "application/json")
            return
        if self.path == "/":
            try:
                out = _get_outputs()
                body = PAGE.format(
                    doctor=html.escape(str(out["doctor"])),
                    help=html.escape(str(out["help"])),
                ).encode()
                self._send(200, body)
            except Exception as exc:
                self._send(500, f"<pre>{html.escape(str(exc))}</pre>".encode())
            return
        self._send(404, b'{"status":"not_found"}', "application/json")

    def log_message(self, *a):
        pass


def main() -> None:
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"beyondwords preview: listening on 0.0.0.0:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
