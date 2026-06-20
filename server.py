#!/usr/bin/env python3
"""Servidor local para desenvolvimento do Dashboard."""

import json
import os
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TOKEN_PATH = os.path.join(BASE_DIR, ".token")
MONDAY_API_URL = "https://api.monday.com/v2"
BOARD_ID = 9296990987

COLUMN_IDS = [
    "color_mkrjsyfh", "numeric_mkrjm7r2", "numeric_mkswt1eb",
    "multiple_person_mkrkp1za", "date_mkt2rybk", "color_mks7pj62", "rating_mkrjygra",
]

FUNNEL_GROUPS = [
    {"id": "topics", "title": "Lead"},
    {"id": "group_mm3ynkak", "title": "EM CONTATO"},
    {"id": "group_mm3y5m94", "title": "REUNIÃO"},
    {"id": "group_mm3yvr2h", "title": "PROPOSTA"},
    {"id": "group_mm3yfd7x", "title": "CONTRATO"},
    {"id": "group_title", "title": "APROVADA"},
    {"id": "group_mkrkws0k", "title": "REPROVADA"},
]

CACHE_TTL = 120
_cache = {"data": None, "ts": 0}


def _read_token():
    with open(TOKEN_PATH, "r") as f:
        return f.read().strip()


def _graphql(query):
    payload = json.dumps({"query": query}).encode("utf-8")
    req = urllib.request.Request(MONDAY_API_URL, data=payload, method="POST", headers={
        "Content-Type": "application/json", "Authorization": _read_token(), "API-Version": "2024-10",
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    if "errors" in body:
        raise RuntimeError(json.dumps(body["errors"]))
    return body["data"]


def _parse_item(item):
    cols = {c["id"]: c for c in item["column_values"]}
    def num(cid):
        c = cols.get(cid)
        if not c or not c.get("text"): return 0.0
        try: return float(c["text"].replace(".", "").replace(",", "."))
        except ValueError:
            try: return float(c["text"])
            except ValueError: return 0.0
    def text(cid):
        c = cols.get(cid)
        return c.get("text") or "" if c else ""
    def people(cid):
        t = (cols.get(cid, {}).get("text") or "").strip()
        return [n.strip() for n in t.split(",") if n.strip()] if t else []
    calor_text = text("rating_mkrjygra")
    return {
        "id": item["id"], "name": item["name"],
        "groupId": item["group"]["id"], "groupTitle": item["group"]["title"],
        "etapa": text("color_mkrjsyfh"),
        "valorUnico": num("numeric_mkrjm7r2"), "valorRecorrente": num("numeric_mkswt1eb"),
        "responsaveis": people("multiple_person_mkrkp1za"),
        "inicioNegociacao": text("date_mkt2rybk") or None,
        "canal": text("color_mks7pj62") or None,
        "calor": int(calor_text) if calor_text.isdigit() else None,
    }


def fetch_board_data():
    now = time.time()
    if _cache["data"] and (now - _cache["ts"]) < CACHE_TTL:
        return _cache["data"]
    col_json = json.dumps(COLUMN_IDS)
    data = _graphql(f"""query {{ boards(ids: [{BOARD_ID}]) {{ name groups {{ id title }}
        items_page(limit: 500) {{ cursor items {{ id name group {{ id title }}
        column_values(ids: {col_json}) {{ id text value }} }} }} }} }}""")
    board = data["boards"][0]
    items = [_parse_item(i) for i in board["items_page"]["items"]]
    cursor = board["items_page"]["cursor"]
    while cursor:
        data = _graphql(f"""query {{ next_items_page(limit: 500, cursor: "{cursor}") {{
            cursor items {{ id name group {{ id title }}
            column_values(ids: {col_json}) {{ id text value }} }} }} }}""")
        page = data["next_items_page"]
        items.extend(_parse_item(i) for i in page["items"])
        cursor = page["cursor"]
    result = {"boardName": board["name"], "fetchedAt": int(now), "groups": board["groups"],
              "funnelGroups": FUNNEL_GROUPS, "items": items}
    _cache["data"] = result
    _cache["ts"] = now
    return result


STATIC = {"/": "index.html", "/index.html": "index.html", "/app.js": "app.js", "/style.css": "style.css"}
CTYPES = {".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8"}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _json(self, obj, status=200):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)
    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/data":
            try:
                if "force=1" in self.path: _cache["data"] = None
                self._json(fetch_board_data())
            except Exception as e:
                self._json({"error": str(e)}, 500)
            return
        fn = STATIC.get(path)
        if fn:
            fp = os.path.join(BASE_DIR, "public", fn)
            if os.path.exists(fp):
                ext = os.path.splitext(fn)[1]
                with open(fp, "rb") as f: body = f.read()
                self.send_response(200)
                self.send_header("Content-Type", CTYPES.get(ext, "application/octet-stream"))
                self.end_headers()
                self.wfile.write(body)
                return
        self.send_response(404)
        self.end_headers()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8765"))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Dashboard rodando em http://127.0.0.1:{port}")
    try: server.serve_forever()
    except KeyboardInterrupt: pass
