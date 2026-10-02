"""Temporary loopback server for the read-only WPS integration probe."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'addin'), **kwargs)
    def do_POST(self):
        if self.path != '/event':
            self.send_error(404); return
        size = int(self.headers.get('Content-Length', '0'))
        if size > 100000:
            self.send_error(413); return
        data = json.loads(self.rfile.read(size))
        with (ROOT / 'evidence/js-probe.jsonl').open('a') as f:
            f.write(json.dumps(data, ensure_ascii=False) + '\n')
        self.send_response(204); self.end_headers()
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

ThreadingHTTPServer(('127.0.0.1', 38941), Handler).serve_forever()
