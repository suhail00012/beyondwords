#!/usr/bin/env python3
"""Beyondwords Publishing Workflow Manager — web application.

A self-contained web app for managing book publishing workflows: project
dashboard, publishing-stage status tracking, task management, deadline
calendar, and progress visualization. Uses Python's standard library only
(http.server + sqlite3), so it runs in any Python 3.11+ environment.
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
import sys
import uuid
from datetime import date, datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

PORT = int(os.environ.get("PORT", "3000"))
DB_PATH = os.environ.get("BEYONDWORDS_DB", "/data/workflow.db")
STATIC_DIR = Path(__file__).resolve().parent / "static"

PUBLISHING_STAGES = [
    ("Research & Market Analysis", 0),
    ("Planning & Outlining", 1),
    ("Writing & Drafting", 2),
    ("Editorial Review", 3),
    ("Cover Design", 4),
    ("Formatting & Production", 5),
    ("Publishing", 6),
    ("Marketing & Launch", 7),
]

STAGE_STATUSES = ("not_started", "in_progress", "review", "completed", "blocked")
TASK_STATUSES = ("todo", "in_progress", "done")
PRIORITIES = ("low", "medium", "high", "urgent")
ROUTES = ("nonfiction", "fiction", "children", "comics", "workbook", "coloring", "puzzles", "art", "activity")


# ── Database ──────────────────────────────────────────────────────────────

def get_db() -> sqlite3.Connection:
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS projects (
        id          TEXT PRIMARY KEY,
        title       TEXT NOT NULL,
        author      TEXT NOT NULL,
        genre       TEXT DEFAULT '',
        route       TEXT DEFAULT 'fiction',
        language    TEXT DEFAULT 'en',
        description TEXT DEFAULT '',
        status      TEXT DEFAULT 'active',
        deadline    TEXT,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stages (
        id          TEXT PRIMARY KEY,
        project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        stage_order INTEGER NOT NULL,
        status      TEXT DEFAULT 'not_started',
        deadline    TEXT,
        notes       TEXT DEFAULT '',
        updated_at  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tasks (
        id          TEXT PRIMARY KEY,
        project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        stage_id    TEXT REFERENCES stages(id) ON DELETE SET NULL,
        title       TEXT NOT NULL,
        description TEXT DEFAULT '',
        status      TEXT DEFAULT 'todo',
        priority    TEXT DEFAULT 'medium',
        due_date    TEXT,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
    );
    """)
    conn.commit()
    conn.close()


def now_iso() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def _stages_for_project(conn, project_id: str) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM stages WHERE project_id=? ORDER BY stage_order", (project_id,)
    ).fetchall()
    return [dict(r) for r in rows]


def _tasks_for_project(conn, project_id: str) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM tasks WHERE project_id=? ORDER BY created_at", (project_id,)
    ).fetchall()
    return [dict(r) for r in rows]


def _project_progress(stages: list[dict]) -> int:
    if not stages:
        return 0
    done = sum(1 for s in stages if s["status"] == "completed")
    return round(done / len(stages) * 100)


def _create_default_stages(conn, project_id: str):
    ts = now_iso()
    for name, order in PUBLISHING_STAGES:
        sid = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO stages (id, project_id, name, stage_order, status, updated_at) VALUES (?,?,?,?,?,?)",
            (sid, project_id, name, order, "not_started", ts),
        )


# ── API helpers ───────────────────────────────────────────────────────────

def api_projects(conn) -> list[dict]:
    rows = conn.execute("SELECT * FROM projects ORDER BY created_at DESC").fetchall()
    result = []
    for r in rows:
        proj = dict(r)
        stages = _stages_for_project(conn, proj["id"])
        proj["stages"] = stages
        proj["progress"] = _project_progress(stages)
        proj["task_count"] = conn.execute(
            "SELECT COUNT(*) FROM tasks WHERE project_id=?", (proj["id"],)
        ).fetchone()[0]
        result.append(proj)
    return result


def api_create_project(conn, body: dict) -> dict:
    pid = str(uuid.uuid4())
    ts = now_iso()
    title = (body.get("title") or "").strip() or "Untitled Project"
    author = (body.get("author") or "").strip() or "Unknown Author"
    conn.execute(
        """INSERT INTO projects
           (id, title, author, genre, route, language, description, status, deadline, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
        (pid, title, author, body.get("genre", ""), body.get("route", "fiction"),
         body.get("language", "en"), body.get("description", ""), "active",
         body.get("deadline"), ts, ts),
    )
    _create_default_stages(conn, pid)
    conn.commit()
    return {"id": pid, "title": title, "author": author}


def api_update_project(conn, pid: str, body: dict) -> dict | None:
    row = conn.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()
    if not row:
        return None
    fields = ("title", "author", "genre", "route", "language", "description", "status", "deadline")
    sets = []
    vals = []
    for f in fields:
        if f in body:
            sets.append(f"{f}=?")
            vals.append(body[f])
    if not sets:
        return dict(row)
    sets.append("updated_at=?")
    vals.append(now_iso())
    vals.append(pid)
    conn.execute(f"UPDATE projects SET {', '.join(sets)} WHERE id=?", vals)
    conn.commit()
    return dict(conn.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone())


def api_delete_project(conn, pid: str) -> bool:
    cur = conn.execute("DELETE FROM projects WHERE id=?", (pid,))
    conn.commit()
    return cur.rowcount > 0


def api_update_stage(conn, sid: str, body: dict) -> dict | None:
    row = conn.execute("SELECT * FROM stages WHERE id=?", (sid,)).fetchone()
    if not row:
        return None
    fields = ("status", "deadline", "notes")
    sets = []
    vals = []
    for f in fields:
        if f in body:
            sets.append(f"{f}=?")
            vals.append(body[f])
    if not sets:
        return dict(row)
    sets.append("updated_at=?")
    vals.append(now_iso())
    vals.append(sid)
    conn.execute(f"UPDATE stages SET {', '.join(sets)} WHERE id=?", vals)
    conn.commit()
    return dict(conn.execute("SELECT * FROM stages WHERE id=?", (sid,)).fetchone())


def api_tasks(conn, project_id: str | None = None) -> list[dict]:
    if project_id:
        rows = conn.execute(
            "SELECT * FROM tasks WHERE project_id=? ORDER BY created_at", (project_id,)
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM tasks ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]


def api_create_task(conn, body: dict) -> dict:
    tid = str(uuid.uuid4())
    ts = now_iso()
    conn.execute(
        """INSERT INTO tasks
           (id, project_id, stage_id, title, description, status, priority, due_date, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (tid, body.get("project_id", ""), body.get("stage_id"),
         (body.get("title") or "").strip() or "Untitled Task",
         body.get("description", ""), body.get("status", "todo"),
         body.get("priority", "medium"), body.get("due_date"), ts, ts),
    )
    conn.commit()
    return {"id": tid}


def api_update_task(conn, tid: str, body: dict) -> dict | None:
    row = conn.execute("SELECT * FROM tasks WHERE id=?", (tid,)).fetchone()
    if not row:
        return None
    fields = ("title", "description", "status", "priority", "due_date", "stage_id")
    sets = []
    vals = []
    for f in fields:
        if f in body:
            sets.append(f"{f}=?")
            vals.append(body[f])
    if not sets:
        return dict(row)
    sets.append("updated_at=?")
    vals.append(now_iso())
    vals.append(tid)
    conn.execute(f"UPDATE tasks SET {', '.join(sets)} WHERE id=?", vals)
    conn.commit()
    return dict(conn.execute("SELECT * FROM tasks WHERE id=?", (tid,)).fetchone())


def api_delete_task(conn, tid: str) -> bool:
    cur = conn.execute("DELETE FROM tasks WHERE id=?", (tid,))
    conn.commit()
    return cur.rowcount > 0


def api_dashboard(conn) -> dict:
    projects = api_projects(conn)
    total = len(projects)
    active = sum(1 for p in projects if p["status"] == "active")
    completed = sum(1 for p in projects if p["status"] == "completed")
    avg_progress = round(sum(p["progress"] for p in projects) / total) if total else 0
    all_stages = [s for p in projects for s in p["stages"]]
    blocked = sum(1 for s in all_stages if s["status"] == "blocked")
    in_progress = sum(1 for s in all_stages if s["status"] == "in_progress")
    total_tasks = conn.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]
    done_tasks = conn.execute("SELECT COUNT(*) FROM tasks WHERE status='done'").fetchone()[0]
    return {
        "total_projects": total,
        "active_projects": active,
        "completed_projects": completed,
        "avg_progress": avg_progress,
        "blocked_stages": blocked,
        "in_progress_stages": in_progress,
        "total_tasks": total_tasks,
        "done_tasks": done_tasks,
    }


def api_calendar(conn, month: str | None = None) -> list[dict]:
    events = []
    rows = conn.execute(
        "SELECT id, title, deadline, status FROM projects WHERE deadline IS NOT NULL"
    ).fetchall()
    for r in rows:
        events.append({
            "id": r["id"], "title": r["title"], "date": r["deadline"],
            "type": "project_deadline", "status": r["status"],
        })
    srows = conn.execute(
        """SELECT s.id, s.name, s.deadline, s.status, s.project_id, p.title as project_title
           FROM stages s JOIN projects p ON s.project_id=p.id
           WHERE s.deadline IS NOT NULL"""
    ).fetchall()
    for r in srows:
        events.append({
            "id": r["id"], "title": f"{r['project_title']} — {r['name']}",
            "date": r["deadline"], "type": "stage_deadline", "status": r["status"],
        })
    trows = conn.execute(
        "SELECT id, title, due_date, status, priority FROM tasks WHERE due_date IS NOT NULL"
    ).fetchall()
    for r in rows:
        pass  # tasks handled below
    for r in trows:
        events.append({
            "id": r["id"], "title": r["title"], "date": r["due_date"],
            "type": "task", "status": r["status"], "priority": r["priority"],
        })
    if month:
        events = [e for e in events if e.get("date", "").startswith(month)]
    events.sort(key=lambda e: e.get("date", ""))
    return events


def api_project_detail(conn, pid: str) -> dict | None:
    row = conn.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()
    if not row:
        return None
    proj = dict(row)
    stages = _stages_for_project(conn, pid)
    proj["stages"] = stages
    proj["progress"] = _project_progress(stages)
    proj["tasks"] = _tasks_for_project(conn, pid)
    return proj


# ── HTTP handler ──────────────────────────────────────────────────────────

class Handler(BaseHTTPRequestHandler):
    def _json(self, code: int, data):
        body = json.dumps(data, ensure_ascii=False, default=str).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _static(self, path: str):
        full = (STATIC_DIR / path.lstrip("/")).resolve()
        if not str(full).startswith(str(STATIC_DIR)):
            self._json(403, {"error": "forbidden"})
            return
        if not full.is_file():
            self._json(404, {"error": "not_found"})
            return
        ext = full.suffix.lower()
        ctype = {".html": "text/html", ".js": "application/javascript",
                 ".css": "text/css", ".svg": "image/svg+xml",
                 ".png": "image/png", ".ico": "image/x-icon"}.get(ext, "application/octet-stream")
        body = full.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", f"{ctype}; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {}

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        conn = get_db()
        try:
            if path == "/healthz":
                self._json(200, {"status": "ok"})
            elif path == "/" or path == "/index.html":
                self._static("/index.html")
            elif path.startswith("/static/"):
                self._static(path)
            elif path == "/api/projects":
                self._json(200, api_projects(conn))
            elif path == "/api/dashboard":
                self._json(200, api_dashboard(conn))
            elif path == "/api/calendar":
                month = urlparse(self.path).query.replace("month=", "") or None
                self._json(200, api_calendar(conn, month if month and len(month) == 7 else None))
            elif m := re.match(r"^/api/projects/([\w-]+)$", path):
                proj = api_project_detail(conn, m.group(1))
                self._json(200 if proj else 404, proj or {"error": "not_found"})
            elif path == "/api/tasks":
                self._json(200, api_tasks(conn))
            else:
                self._json(404, {"error": "not_found"})
        finally:
            conn.close()

    def do_POST(self):
        path = urlparse(self.path).path
        body = self._body()
        conn = get_db()
        try:
            if path == "/api/projects":
                self._json(201, api_create_project(conn, body))
            elif path == "/api/tasks":
                self._json(201, api_create_task(conn, body))
            else:
                self._json(404, {"error": "not_found"})
        finally:
            conn.close()

    def do_PUT(self):
        path = urlparse(self.path).path
        body = self._body()
        conn = get_db()
        try:
            if m := re.match(r"^/api/projects/([\w-]+)$", path):
                result = api_update_project(conn, m.group(1), body)
                self._json(200 if result else 404, result or {"error": "not_found"})
            elif m := re.match(r"^/api/stages/([\w-]+)$", path):
                result = api_update_stage(conn, m.group(1), body)
                self._json(200 if result else 404, result or {"error": "not_found"})
            elif m := re.match(r"^/api/tasks/([\w-]+)$", path):
                result = api_update_task(conn, m.group(1), body)
                self._json(200 if result else 404, result or {"error": "not_found"})
            else:
                self._json(404, {"error": "not_found"})
        finally:
            conn.close()

    def do_DELETE(self):
        path = urlparse(self.path).path
        conn = get_db()
        try:
            if m := re.match(r"^/api/projects/([\w-]+)$", path):
                ok = api_delete_project(conn, m.group(1))
                self._json(200 if ok else 404, {"deleted": ok})
            elif m := re.match(r"^/api/tasks/([\w-]+)$", path):
                ok = api_delete_task(conn, m.group(1))
                self._json(200 if ok else 404, {"deleted": ok})
            else:
                self._json(404, {"error": "not_found"})
        finally:
            conn.close()

    def log_message(self, *a):
        pass


def main():
    init_db()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"beyondwords: publishing workflow app listening on 0.0.0.0:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
