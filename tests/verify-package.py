"""Check archive byte identity, locked vendor license, and the public whitelist."""
from pathlib import Path
import hashlib
import json
import zipfile
ROOT=Path(__file__).resolve().parents[1]
version=json.loads((ROOT/'package.json').read_text())['version']
for kind in ['arm64','source']:
    file=ROOT/'release'/('wps-local-formatter-'+version+'-'+kind+'.zip')
    base=ROOT/'dist'/('wps-local-formatter-'+version) if kind=='arm64' else ROOT
    with zipfile.ZipFile(file) as archive:
        names=archive.namelist()
        assert len(names)==len(set(names)), 'duplicate archive entries'
        for name in names:
            rel=Path(name).relative_to('wps-local-formatter')
            assert not any(p in ['evidence','plans','.git','__pycache__','assets'] for p in rel.parts),name
            assert rel.name not in ['settings.json','.DS_Store'],name
            assert rel.suffix.lower() not in ['.docx','.pdf','.log','.ttf','.ttc','.otf','.dmg','.app'],name
            assert archive.read(name)==(base/rel).read_bytes(),name
        for required in ['LICENSE','NOTICE.md','package-lock.json','node-host/cli.mjs','addin/core.js','初始化.command','回退.command']:
            assert 'wps-local-formatter/'+required in names,required
        if kind=='arm64':
            assert not any('/Sources/' in n for n in names)
            assert b'MIT' in archive.read('wps-local-formatter/node_modules/@xmldom/xmldom/LICENSE')
            vendor=json.loads(archive.read('wps-local-formatter/node_modules/@xmldom/xmldom/package.json'))
            assert vendor['version']=='0.9.12'
        else:
            assert not any('/node_modules/' in n for n in names)
            for required in ['docs/images/settings-title.png','skills/github-open-source-release/SKILL.md','tests/create-v12-fixtures.py']:
                assert 'wps-local-formatter/'+required in names,required
checks=ROOT/'release'/('wps-local-formatter-'+version+'-SHA256SUMS.txt')
for row in checks.read_text().splitlines():
    expected,name=row.split(None,1)
    assert hashlib.sha256((ROOT/'release'/name.strip()).read_bytes()).hexdigest()==expected,name
print('ZIP 白名单、源码字节、锁定依赖许可证与 SHA256 校验通过。')
