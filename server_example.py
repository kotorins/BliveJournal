#!/usr/bin/env python3
from http.server import SimpleHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
import json
import zlib
import tempfile
import gzip
import os
import traceback

slices = {}


class CORSRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

    def end_headers(self):
        self.send_header(
            'Access-Control-Allow-Origin', self.headers.get('Origin', '*'))
        self.send_header('Access-Control-Allow-Methods', 'PUT, OPTIONS')
        self.send_header(
            'Access-Control-Allow-Headers',
            'Content-Type, Accept-Encoding, Content-Encoding')
        self.send_header('Access-Control-Max-Age', '86400')
        self.send_header('Cache-Control', 'no-store')

        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_PUT(self):
        content_length = int(self.headers['Content-Length'])
        payload = self.rfile.read(content_length)
        try:
            payload = zlib.decompress(payload).decode('utf-8')
            data = json.loads(payload)
            prefix = f"{data['roomid']}-{data['src']}-{data['timestamp']}"
            key = f"{prefix}-{data['rand']}"
            tmp_file = os.path.join(tempfile.gettempdir(), f"{key}.jsonl.gz")

            if slices.get(key, -1) + 1 != data['page']:
                raise Exception(f"expected page {slices.get(key, -1) + 1}, got {data['page']}")

            with gzip.open(tmp_file, 'at', encoding='utf-8') as f:
                f.write(data['jsonl'])
                f.write('\n')
            slices[key] = data['page']

            response = {
                'code': 0,
                'msg': '',
                'page': data['page'],
            }

            if (data['page'] + 1) * data['size'] >= data['length']:
                slices.pop(key, None)
                os.rename(tmp_file, f"{prefix}.jsonl.gz")
                response['done'] = True

        except Exception:
            response = {
                'code': -1,
                'msg': traceback.format_exc(),
            }

        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.end_headers()

        self.wfile.write(json.dumps(response).encode('utf-8'))


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    pass


if __name__ == '__main__':
    port = 8000
    server_address = ('127.0.0.1', port)

    httpd = ThreadedHTTPServer(server_address, CORSRequestHandler)
    print(f"Server running on port {port}")
    httpd.serve_forever()
