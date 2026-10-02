"""Run an explicit operation on an exact synthetic fixture using the candidate build."""
import argparse
import json
from pathlib import Path
import re
import time
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ('WPS排版v12通知.docx', 'WPS排版v12合同与列表.docx',
            'WPS排版v12附件与长段.docx', 'WPS排版v12多节.docx')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('operation', choices=('format', 'inspect', 'probe', 'undo',
                                             'analyze', 'preview', 'extract', 'set-role', 'scope'))
    parser.add_argument('name', help='新的证据文件名，不含目录或扩展名')
    parser.add_argument('--fixture', required=True, choices=FIXTURES)
    parser.add_argument('--payload', type=Path)
    parser.add_argument('--base', default='http://127.0.0.1:38941')
    parser.add_argument('--build-id-file', type=Path)
    args = parser.parse_args()
    if not re.fullmatch(r'[\w-]{1,80}', args.name) or args.name in ('.', '..'):
        parser.error('证据文件名只能包含文字、数字、下划线或连字符，不能包含路径。')
    match = re.fullmatch(r'http://127\.0\.0\.1:([0-9]+)', args.base)
    if not match or not 1 <= int(match.group(1)) <= 65535:
        parser.error('只能连接明确端口的本机 127.0.0.1 服务。')
    dest = ROOT / 'evidence' / 'v1.2-implementation-2026-10-03' / (args.name + '.json')
    if dest.exists() or dest.is_symlink():
        parser.error('证据文件已存在，请使用新名称；未发起操作。')
    version = json.loads((ROOT / 'package.json').read_text())['version']
    build_file = args.build_id_file or ROOT / 'dist' / ('wps-local-formatter-' + version) / 'build-id'
    try:
        expected_build = build_file.read_text()
    except OSError as error:
        raise SystemExit('请先构建候选运行时，或指定其 build-id 文件：' + str(error))
    if not expected_build.strip():
        raise SystemExit('候选 build-id 为空，未发起操作。')
    payload = json.loads(args.payload.read_text()) if args.payload else {}
    if not isinstance(payload, dict):
        raise SystemExit('操作参数必须为 JSON 对象，未发起操作。')
    token = json.load(urlopen(args.base + '/session', timeout=3))['token']
    owner = None

    def call(route, data=None):
        headers = {'X-Formatter-Token': token, 'Content-Type': 'application/json'}
        if owner is not None:
            headers['X-Formatter-Client'] = owner
        request = Request(args.base + route, data=None if data is None else json.dumps(data).encode(),
                          headers=headers)
        return json.load(urlopen(request, timeout=5))

    environment = call('/environment')
    server = environment.get('server', {})
    if server.get('version') != version or server.get('buildID') != expected_build:
        raise SystemExit('本地服务不是当前候选构建，未发起操作。')
    status = call('/state').get('status', {})
    owner = status.get('clientID')
    if owner is not None:
        if not isinstance(owner, str) or not owner:
            raise SystemExit('WPS 窗口标识无效，未发起操作。')
        status = call('/state').get('status', {})
    if not (status.get('heartbeatFresh') is True and status.get('apiReady') is True
            and status.get('documentOpen') is True and status.get('bridgeVersion') == version):
        raise SystemExit('当前候选插件、接口或文档尚未就绪，未发起操作。')
    if status.get('readOnly') or not status.get('docID') or status.get('title') != args.fixture:
        raise SystemExit('当前文档不是指定的可编辑合成验收文档，未发起操作。')
    if args.operation in ('inspect', 'probe', 'undo'):
        payload['diagnostic'] = True
    payload.update(op=args.operation, docID=status['docID'])
    if owner is not None:
        payload['clientID'] = owner
    queued = call('/request', payload)
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        result = call('/state').get('result', {})
        if result.get('id') == queued['id']:
            dest.parent.mkdir(parents=True, exist_ok=True)
            with dest.open('x') as output:
                json.dump(result, output, ensure_ascii=False, indent=2)
            print(json.dumps({key: value for key, value in result.items()
                              if key not in ('inspection', 'probe', 'analysis', 'preview')}, ensure_ascii=False))
            print(dest)
            return 0 if result.get('ok') else 1
        time.sleep(.25)
    raise SystemExit('结果超时。请读取状态后核对；不自动重试修改操作。')


if __name__ == '__main__':
    raise SystemExit(main())
