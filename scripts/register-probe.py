"""Register only this project's WPS add-in; preserve unrelated registrations."""
from pathlib import Path
import xml.etree.ElementTree as ET
import shutil
from datetime import datetime

folder = Path.home() / 'Library/Containers/com.kingsoft.wpsoffice.mac/Data/.kingsoft/wps/jsaddons'
file = folder / 'publish.xml'
folder.mkdir(parents=True, exist_ok=True)
if file.exists():
    tree = ET.parse(file)
    root = tree.getroot()
    if root.tag != 'jsplugins':
        raise RuntimeError('未知的 publish.xml 结构，停止修改')
    existing=[e for e in root if e.get('name')=='local-wps-formatter']
    if len(existing)==1 and existing[0].tag=='jspluginonline' and existing[0].get('url')=='http://127.0.0.1:38941/' and existing[0].get('enable')=='enable_dev':
        print('WPS 加载项已注册。');raise SystemExit()
    shutil.copy2(file, file.with_name('publish.xml.backup-' + datetime.now().strftime('%Y%m%d%H%M%S')))
else:
    root = ET.Element('jsplugins')
    tree = ET.ElementTree(root)
for item in list(root):
    if item.get('name') == 'local-wps-formatter':
        root.remove(item)
ET.SubElement(root, 'jspluginonline', dict(url='http://127.0.0.1:38941/', type='wps', enable='enable_dev', install='null', version='1.0.0', name='local-wps-formatter'))
temp=file.with_suffix('.xml.tmp')
tree.write(temp, encoding='utf-8', xml_declaration=True)
temp.replace(file)
print(file)
