"""Exercise only the named synthetic WPS fixture through the diagnostic app API."""
import json
from pathlib import Path
import sys
import time
from urllib.request import Request, urlopen

BASE='http://127.0.0.1:38941'
token=json.load(urlopen(BASE+'/session',timeout=3))['token']
def call(path, data=None):
    req=Request(BASE+path, data=None if data is None else json.dumps(data).encode(),
                headers={'X-Formatter-Token':token,'Content-Type':'application/json'})
    return json.load(urlopen(req,timeout=5))

state=call('/state')
title=state.get('status',{}).get('title','')
if not title.startswith('WPS排版') or not title.endswith('.docx'):
    raise SystemExit('当前不是本项目测试文档，停止。状态：'+str(state.get('status')))
op=sys.argv[1] if len(sys.argv)>1 else 'inspect'
if op=='state':
    print(json.dumps({**state,'result':{k:v for k,v in state.get('result',{}).items() if k!='inspection'}},ensure_ascii=False));sys.exit()
payload={'op':op,'docID':state['status']['docID'],'count':2}
if len(sys.argv)>3:
    if sys.argv[3]=='current': payload['config']=call('/settings')['current']
    else: payload['count']=int(sys.argv[3])
result=call('/request',payload)
deadline=time.monotonic()+30
while time.monotonic()<deadline:
    result_state=call('/state').get('result',{})
    if result_state.get('id')==result['id']:
        name=sys.argv[2] if len(sys.argv)>2 else op
        output=Path(__file__).resolve().parents[1]/'evidence'/('live-'+name+'.json')
        output.write_text(json.dumps(result_state,ensure_ascii=False,indent=2))
        inspection=result_state.get('inspection',{})
        print(json.dumps({k:v for k,v in result_state.items() if k!='inspection'},ensure_ascii=False))
        if inspection: print(json.dumps({k:v for k,v in inspection.items() if k not in ['xml','bodyText']},ensure_ascii=False))
        print(output)
        sys.exit(0 if result_state.get('ok') else 1)
    time.sleep(.25)
raise SystemExit('结果超时，不能自动重试修改操作；请检查 WPS。')
