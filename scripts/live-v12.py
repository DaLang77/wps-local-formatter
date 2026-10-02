"""Run one explicit operation on a named synthetic WPS fixture and retain evidence."""
import argparse
import json
from pathlib import Path
import time
from urllib.request import Request, urlopen

p = argparse.ArgumentParser()
p.add_argument('operation')
p.add_argument('name')
p.add_argument('--payload', type=Path)
p.add_argument('--base', default='http://127.0.0.1:38941')
a = p.parse_args()
token = json.load(urlopen(a.base + '/session', timeout=3))['token']
def call(path, data=None):
    request = Request(a.base + path, data=None if data is None else json.dumps(data).encode(), headers={'X-Formatter-Token': token, 'Content-Type': 'application/json'})
    return json.load(urlopen(request, timeout=5))
state = call('/state')
status = state.get('status', {})
if not status.get('title', '').startswith('WPS排版') or not status.get('title', '').endswith('.docx'):
    raise SystemExit('当前不是合成验收文档，停止。')
payload = json.loads(a.payload.read_text()) if a.payload else {}
payload.update(op=a.operation, docID=status['docID'])
queued = call('/request', payload)
deadline = time.monotonic() + 45
while time.monotonic() < deadline:
    result = call('/state').get('result', {})
    if result.get('id') == queued['id']:
        dest = Path(__file__).resolve().parents[1] / 'evidence' / 'v1.2-implementation-2026-10-03' / (a.name + '.json')
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(json.dumps(result, ensure_ascii=False, indent=2))
        print(json.dumps({k: v for k, v in result.items() if k not in ['inspection', 'probe', 'analysis', 'preview']}, ensure_ascii=False))
        print(dest)
        raise SystemExit(0 if result.get('ok') else 1)
    time.sleep(.25)
raise SystemExit('结果超时。请读取状态后核对；不自动重试修改操作。')
