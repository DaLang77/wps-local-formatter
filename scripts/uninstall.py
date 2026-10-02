"""Unregister this add-in only. Run after quitting the formatter and WPS."""
from pathlib import Path
from datetime import datetime
import xml.etree.ElementTree as E
import os, subprocess

label="local.wps.formatter.background"
subprocess.run(["launchctl","bootout",f"gui/{os.getuid()}/{label}"],capture_output=True)
agent=Path.home()/"Library/LaunchAgents"/(label+".plist")
if agent.exists(): agent.unlink()

p=Path.home()/'Library/Containers/com.kingsoft.wpsoffice.mac/Data/.kingsoft/wps/jsaddons/publish.xml'
if not p.exists():
    print('未发现加载项配置。');raise SystemExit()
original=p.read_bytes();tree=E.ElementTree(E.fromstring(original));root=tree.getroot()
if root.tag!='jsplugins': raise SystemExit('配置结构未知，未修改。')
matches=[e for e in root if e.get('name')=='local-wps-formatter']
if not matches: print('本工具未注册。');raise SystemExit()
p.with_name('publish.xml.before-uninstall-'+datetime.now().strftime('%Y%m%d%H%M%S')).write_bytes(original)
for e in matches: root.remove(e)
tmp=p.with_suffix('.xml.tmp');tree.write(tmp,encoding='utf-8',xml_declaration=True);tmp.replace(p)
print('已移除本工具注册，其他加载项保持不变。下次启动 WPS 生效。')
