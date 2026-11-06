#!/usr/bin/env python3
"""Linyu PWA anonymous usage stats service.

Single-file stdlib HTTP service + SQLite. No account data is accepted.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
DB_PATH = Path(os.environ.get("DB_PATH", "/data/stats.db"))
PORT = int(os.environ.get("PORT", "8080"))
ALLOWED_ORIGINS = [
    item.strip()
    for item in os.environ.get("ALLOWED_ORIGINS", "*").split(",")
    if item.strip()
]
STATS_TOKEN = os.environ.get("STATS_TOKEN", "").strip()

EVENTS = {
    "app_open",
    "scan_success",
    "water_start",
    "water_pause",
    "water_resume",
    "water_end",
    "install",
}
EVENT_RE = re.compile(r"^[a-z_]{3,32}$")
ID_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
PROJECT_RE = re.compile(r"^[0-9]{1,20}$")

RATE_LOCK = threading.Lock()
RATE: dict[str, deque[float]] = defaultdict(deque)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            install_id TEXT NOT NULL,
            event TEXT NOT NULL,
            project_id TEXT,
            project_name TEXT,
            country TEXT,
            region TEXT,
            city TEXT,
            app_version TEXT,
            duration_sec INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_events_event ON events(event)"
    )
    conn.commit()
    return conn


def clean(value, limit: int) -> str:
    if not isinstance(value, str):
        return ""
    return value.strip()[:limit]


def client_ip(handler: BaseHTTPRequestHandler) -> str:
    cf = handler.headers.get("CF-Connecting-IP", "")
    if cf:
        return cf.strip()
    forwarded = handler.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return handler.client_address[0] if handler.client_address else ""


def geo(handler: BaseHTTPRequestHandler) -> tuple[str, str, str]:
    # Cloudflare 免费提供粗粒度地理信息；不请求 GPS，不保存 IP。
    return (
        clean(handler.headers.get("CF-IPCountry"), 8),
        clean(handler.headers.get("CF-Region"), 64),
        clean(handler.headers.get("CF-IPCity"), 64),
    )


def allowed(origin: str) -> str | None:
    if "*" in ALLOWED_ORIGINS:
        return "*"
    if origin and origin in ALLOWED_ORIGINS:
        return origin
    return None


def rate_limited(ip: str) -> bool:
    # 只保留哈希键，不存储 IP 原文
    key = hashlib.sha256((ip + "|linyu-stats").encode()).hexdigest()[:24]
    current = time.monotonic()
    with RATE_LOCK:
        bucket = RATE[key]
        while bucket and current - bucket[0] > 60:
            bucket.popleft()
        if len(bucket) >= 120:
            return True
        bucket.append(current)
        return False


def authorized(handler: BaseHTTPRequestHandler, query: dict[str, list[str]]) -> bool:
    if not STATS_TOKEN:
        return True
    token = handler.headers.get("X-Stats-Token", "")
    if not token:
        token = (query.get("token") or [""])[0]
    return token == STATS_TOKEN


def event_rows(handler: BaseHTTPRequestHandler, payload) -> list[tuple]:
    items = payload.get("events") if isinstance(payload, dict) else None
    if not isinstance(items, list):
        items = [payload]
    country, region, city = geo(handler)
    rows = []
    created = now_iso()
    for item in items[:100]:
        if not isinstance(item, dict):
            continue
        install_id = clean(item.get("installId"), 64)
        event = clean(item.get("event"), 32)
        if not ID_RE.fullmatch(install_id) or event not in EVENTS:
            continue
        project_id = clean(item.get("projectId"), 20)
        if project_id and not PROJECT_RE.fullmatch(project_id):
            project_id = ""
        project_name = clean(item.get("projectName"), 80)
        app_version = clean(item.get("appVersion"), 24)
        try:
            duration = int(item.get("durationSec", 0))
        except (TypeError, ValueError):
            duration = 0
        duration = max(0, min(duration, 24 * 60 * 60))
        rows.append(
            (
                install_id,
                event,
                project_id,
                project_name,
                country,
                region,
                city,
                app_version,
                duration,
                created,
            )
        )
    return rows


class Handler(BaseHTTPRequestHandler):
    server_version = "LinyuStats/1.0"

    def log_message(self, fmt: str, *args) -> None:
        print(f"[{self.log_date_time_string()}] {fmt % args}", flush=True)

    def cors(self) -> None:
        origin = self.headers.get("Origin", "")
        allow = allowed(origin)
        if allow:
            self.send_header("Access-Control-Allow-Origin", allow)
            if allow != "*":
                self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Stats-Token")
        self.send_header("Access-Control-Max-Age", "86400")

    def send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.cors()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        if parsed.path == "/health":
            self.send_json(200, {"ok": True, "time": now_iso()})
            return
        if parsed.path == "/api/stats":
            if not authorized(self, query):
                self.send_json(401, {"ok": False, "error": "unauthorized"})
                return
            try:
                days = max(1, min(365, int((query.get("days") or ["30"])[0])))
            except ValueError:
                days = 30
            self.send_json(200, self.stats(days))
            return
        if parsed.path in ("/stats", "/stats/"):
            self.serve_file(WEB / "stats.html", "text/html; charset=utf-8")
            return
        if parsed.path == "/":
            self.send_response(302)
            self.send_header("Location", "/stats")
            self.end_headers()
            return
        if parsed.path == "/static/stats.css":
            self.serve_file(WEB / "stats.css", "text/css; charset=utf-8")
            return
        if parsed.path == "/static/stats.js":
            self.serve_file(WEB / "stats.js", "text/javascript; charset=utf-8")
            return
        self.send_json(404, {"ok": False, "error": "not found"})

    def serve_file(self, path: Path, content_type: str) -> None:
        try:
            body = path.read_bytes()
        except OSError:
            self.send_json(404, {"ok": False, "error": "not found"})
            return
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/api/events":
            self.send_json(404, {"ok": False, "error": "not found"})
            return
        if rate_limited(client_ip(self)):
            self.send_json(429, {"ok": False, "error": "too many requests"})
            return
        length = 0
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            pass
        if length <= 0 or length > 64 * 1024:
            self.send_json(400, {"ok": False, "error": "invalid body size"})
            return
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            self.send_json(400, {"ok": False, "error": "invalid json"})
            return

        rows = event_rows(self, payload)
        if not rows:
            self.send_json(400, {"ok": False, "error": "no valid events"})
            return
        conn = db()
        try:
            conn.executemany(
                """
                INSERT INTO events
                (install_id, event, project_id, project_name, country, region, city,
                 app_version, duration_sec, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                rows,
            )
            conn.commit()
        finally:
            conn.close()
        self.send_json(202, {"ok": True, "accepted": len(rows)})

    def stats(self, days: int) -> dict:
        since = (datetime.now(timezone.utc) - timedelta(days=days - 1)).date().isoformat()
        conn = db()
        try:
            base = "FROM events WHERE substr(created_at,1,10) >= ?"
            total = conn.execute(f"SELECT COUNT(*) {base}", (since,)).fetchone()[0]
            unique = conn.execute(
                f"SELECT COUNT(DISTINCT install_id) {base}", (since,)
            ).fetchone()[0]
            by_event = {
                row["event"]: row["n"]
                for row in conn.execute(
                    f"SELECT event, COUNT(*) AS n {base} GROUP BY event", (since,)
                )
            }
            duration = conn.execute(
                f"SELECT COALESCE(SUM(duration_sec),0) AS total, "
                f"COALESCE(AVG(duration_sec),0) AS avg {base} AND event='water_end'",
                (since,),
            ).fetchone()
            daily = [
                {"day": row["day"], "events": row["n"], "installs": row["u"]}
                for row in conn.execute(
                    f"SELECT substr(created_at,1,10) AS day, COUNT(*) AS n, "
                    f"COUNT(DISTINCT install_id) AS u {base} "
                    f"GROUP BY day ORDER BY day",
                    (since,),
                )
            ]
            projects = [
                {
                    "projectId": row["project_id"] or "",
                    "projectName": row["project_name"] or "未命名项目",
                    "events": row["n"],
                    "installs": row["u"],
                    "waterStarts": row["w"],
                }
                for row in conn.execute(
                    f"SELECT project_id, project_name, COUNT(*) AS n, "
                    f"COUNT(DISTINCT install_id) AS u, "
                    f"SUM(CASE WHEN event='water_start' THEN 1 ELSE 0 END) AS w "
                    f"{base} GROUP BY project_id, project_name "
                    f"ORDER BY n DESC LIMIT 30",
                    (since,),
                )
            ]
            regions = [
                {
                    "country": row["country"] or "未知",
                    "region": row["region"] or "",
                    "city": row["city"] or "",
                    "events": row["n"],
                    "installs": row["u"],
                }
                for row in conn.execute(
                    f"SELECT country, region, city, COUNT(*) AS n, "
                    f"COUNT(DISTINCT install_id) AS u {base} "
                    f"GROUP BY country, region, city ORDER BY n DESC LIMIT 30",
                    (since,),
                )
            ]
            last = conn.execute("SELECT MAX(created_at) FROM events").fetchone()[0]
        finally:
            conn.close()
        return {
            "ok": True,
            "generatedAt": now_iso(),
            "days": days,
            "since": since,
            "totalEvents": total,
            "uniqueInstalls": unique,
            "byEvent": by_event,
            "waterDurationSec": duration["total"],
            "avgWaterDurationSec": round(duration["avg"], 1),
            "daily": daily,
            "projects": projects,
            "regions": regions,
            "lastEventAt": last,
        }


if __name__ == "__main__":
    print(f"Linyu stats listening on :{PORT}, db={DB_PATH}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
