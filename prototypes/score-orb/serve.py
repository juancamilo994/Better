"""Static server for the score orb prototype, proxying /api/* to the local harness.

Usage: python3 serve.py [port] [harness_url]
The browser cannot call the harness on :3000 directly (no CORS), so GET /api/...
is forwarded server-side. Read-only: only GET is proxied.
"""
import http.server
import os
import sys
import urllib.error
import urllib.request

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
HARNESS = (sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:3000").rstrip("/")
ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        if not self.path.startswith("/api/"):
            return super().do_GET()
        try:
            with urllib.request.urlopen(HARNESS + self.path, timeout=10) as r:
                body, status, ctype = r.read(), r.status, r.headers.get("Content-Type", "application/json")
        except urllib.error.HTTPError as e:
            body, status, ctype = e.read(), e.code, "application/json"
        except Exception as e:  # harness down
            body, status, ctype = ('{"error":"harness unreachable: %s"}' % e).encode(), 502, "application/json"
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
