"""Verify captured WPS API snapshots and untouched OOXML regions."""
import json,re,xml.etree.ElementTree as E
from pathlib import Path

root=Path(__file__).resolve().parents[1]/'evidence'
def inspection(name): return json.loads((root/f'live-{name}.json').read_text())['inspection']
b=inspection('before');a=inspection('after');u=inspection('undo');one=inspection('one-signature-check')
assert b['bodyText']==a['bodyText']==u['bodyText']
assert b['paragraphs']==u['paragraphs'], '一次撤销未恢复全部段落'
assert b['shapes']==a['shapes']==u['shapes']
assert [p for p in b['paragraphs'] if p['table']]==[p for p in a['paragraphs'] if p['table']]
targets=[p for p in a['paragraphs'] if not p['table'] and re.sub(r'[\s\x00-\x1f\x7f]','',p['text'])]
assert len(targets)==6
for i,p in enumerate(targets):
    assert p['farEast']==p['font']==('华文中宋' if i==0 else '仿宋_GB2312')
    assert p['size']==(22 if i==0 else 14)
    assert p['lineRule']==1
    assert p['indent']==(2 if 0<i<len(targets)-2 else 0)
    if i==0: assert p['alignment']==1
    if i>=len(targets)-2: assert p['alignment']==2
for old,new in zip(b['paragraphs'],a['paragraphs']):
    assert (old['bold'],old['before'],old['after'])==(new['bold'],new['before'],new['after'])
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
def parse(xml): return E.fromstring(re.sub(r'<\?xml[^?]*\?>','',xml))
before,after=parse(b['xml']),parse(a['xml'])
for tag in ['tbl','txbxContent','hdr','ftr','sectPr']:
    x=[E.tostring(n) for n in before.findall('.//w:'+tag,ns)]
    y=[E.tostring(n) for n in after.findall('.//w:'+tag,ns)]
    assert x and x==y, tag+'发生修改'
assert json.loads((root/'live-repeat.json').read_text())['changed']==0
signatures=[p for p in one['paragraphs'] if p['text'].startswith(('测试单位','2026年'))]
assert signatures[0]['indent']==2 and signatures[0]['alignment']==0
assert signatures[1]['indent']==0 and signatures[1]['alignment']==2
print('PASS: WPS 实测格式、文字不变、表格/文本框/页眉/页脚/页边距不变、加粗与段间距、重复执行、整组撤销、可调落款。')

r=inspection('regression-two-check'); ru=inspection('regression-undo')
def formatting(ps): return [{k:v for k,v in p.items() if k not in ['start','end','text']} for p in ps]
assert formatting(r['paragraphs'])==formatting(a['paragraphs'])
assert formatting(ru['paragraphs'])==formatting(one['paragraphs'])
assert r['bodyText']==ru['bodyText']
assert [p['text'] for p in r['paragraphs']]==[p['text'] for p in ru['paragraphs']]
assert json.loads((root/'live-regression-two.json').read_text())['ok']
assert json.loads((root/'live-regression-repeat.json').read_text())['changed']==0
for tag in ['tbl','txbxContent','hdr','ftr','sectPr']:
    assert [E.tostring(n) for n in parse(r['xml']).findall('.//w:'+tag,ns)]==[E.tostring(n) for n in after.findall('.//w:'+tag,ns)]
print('PASS: 修复后 WPS 落款 1→2、重复执行及一次撤销。')
