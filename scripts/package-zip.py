"""Collect reviewed public sources and the self-contained Node plugin runtime."""
from pathlib import Path
import sys
import zipfile

ROOT=Path(__file__).resolve().parents[1]
version=sys.argv[1]
for kind,base,items in [
    ('arm64',ROOT/'dist'/('wps-local-formatter-'+version),None),
    ('source',ROOT,['Sources','addin','node-host','scripts','tests','docs','skills','.github','AGENTS.md','README.md','CONTRIBUTING.md','NOTICE.md','LICENSE','.gitignore','package.json','package-lock.json','初始化.command','环境检查.command','回退.command','卸载.command'])
]:
    candidates=list(base.rglob('*')) if items is None else [f for item in items for f in ([base/item] if (base/item).is_file() else (base/item).rglob('*'))]
    with zipfile.ZipFile(ROOT/'release'/('wps-local-formatter-'+version+'-'+kind+'.zip'),'w',zipfile.ZIP_DEFLATED) as archive:
        for file in sorted(candidates):
            rel=file.relative_to(base)
            if not file.is_file() or any(x in ['__pycache__','plans','.git'] for x in rel.parts):continue
            if file.name in ['.DS_Store','settings.json'] or file.suffix.lower() in ['.docx','.pdf','.log','.ttf','.ttc','.otf']:continue
            archive.write(file,Path('wps-local-formatter')/rel)
