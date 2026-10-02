const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
function fixture(){
  const app={ActiveDocument:{DocID:7,Name:'合成测试.docx'},Selection:{Range:{Start:4,End:8}}},calls=[],events={};
  let fingerprint='first';
  const state={revision:0,current:{version:2},activeTemplateID:'builtin',templates:[{id:'builtin',name:'合成模板'}]};
  const c={window:{},Object,setInterval:()=>1,clearInterval:()=>{},wps:{WpsApplication:()=>app,ApiEvent:{AddApiEventListener:(name,callback)=>{events[name]=callback;}}},FormatterCore:{
    captureContext:(a,scope)=>({docID:String(a.ActiveDocument.DocID),scope,fingerprint,selection:{start:a.Selection.Range.Start,end:a.Selection.Range.End}}),
    fonts:()=>[],apply:(...args)=>{calls.push(args);return {ok:true,message:'已排版'};},
    readParagraphs:()=>[{index:1,story:1,table:false}],analyze:()=>[{index:1,role:'title',summary:'合成测试'}]
  }};
  vm.createContext(c);vm.runInContext(fs.readFileSync('addin/main.js','utf8'),c);
  c.settingsState=state;c.request=(path,data,cb)=>{if(path==='/settings')calls.push({settingsCallback:cb});else cb(null,{},200);};
  c.bridgeToken='local-test';
  return {c,app,state,calls,events,edit:()=>{fingerprint='edited';},restore:()=>{fingerprint='first';}};
}
test('点击时同步捕获选区，异步设置返回后仍使用原选区',()=>{
  const f=fixture();f.c.OnSelectScope({},'selection',1);f.c.OnFormat();
  f.app.Selection.Range={Start:99,End:120};f.calls[0].settingsCallback(null,f.state,200);
  assert.equal(f.calls[1][3].selection.start,4);assert.equal(f.calls[1][3].scope,'selection');
});
test('切换文档重置范围与人工标记，不污染模板',()=>{
  const f=fixture();f.c.operationContext();f.c.documentSession.scope='selection';f.c.documentSession.overrides={1:'preserve'};
  f.c.documentSession.fingerprint='first';f.app.ActiveDocument.DocID=8;f.c.syncDocument(f.app.ActiveDocument);
  assert.equal(f.c.documentSession.scope,'document');assert.equal(Object.keys(f.c.documentSession.overrides).length,0);
  assert.equal(f.c.documentSession.needsReview,true);assert.deepEqual(f.state.current,{version:2});
});
test('文字变动使人工标记失效，重新分析后才允许排版',()=>{
  const f=fixture();f.c.operationContext();f.c.documentSession.overrides={1:'preserve'};f.c.documentSession.fingerprint='first';f.edit();
  assert.throws(()=>f.c.operationContext(),/人工标记已失效/);assert.equal(Object.keys(f.c.documentSession.overrides).length,0);
  assert.equal(f.c.analyzeDocument(f.state.current).sessionInvalidated,true);
  assert.doesNotThrow(()=>f.c.operationContext());
});
test('关闭后重开文档不会提前消除重新检查的要求',()=>{
  const f=fixture();f.c.operationContext();f.c.documentSession.overrides={1:'preserve'};
  f.c.syncDocument(null);f.c.syncDocument(f.app.ActiveDocument);
  assert.equal(f.c.documentSession.needsReview,true);assert.throws(()=>f.c.operationContext(),/重新检查/);
  f.c.analyzeDocument(f.state.current);assert.doesNotThrow(()=>f.c.operationContext());
});
test('异步排版拒绝离开再回到相同文档的过期会话，激活事件不依赖心跳',()=>{
  const f=fixture();f.c.OnAddinLoad();f.calls.length=0;
  const original=f.app.ActiveDocument;
  f.c.documentSession.overrides={1:'preserve'};f.c.documentSession.fingerprint='first';
  f.c.OnFormat();const pending=f.calls[0];
  f.app.ActiveDocument={DocID:8};f.events.WindowActivate(f.app.ActiveDocument);
  f.app.ActiveDocument=original;f.events.WindowActivate(original);
  pending.settingsCallback(null,f.state,200);
  assert.equal(f.calls.filter(Array.isArray).length,0);
  assert.equal(Object.keys(f.c.documentSession.overrides).length,0);
  assert.equal(f.c.documentSession.needsReview,true);assert.match(f.c.statusText,/人工标记已失效/);
});
test('文字编辑事件后恢复原指纹仍使旧标记和异步上下文失效',()=>{
  const f=fixture();f.c.OnAddinLoad();f.calls.length=0;
  f.c.documentSession.overrides={1:'preserve'};f.c.documentSession.fingerprint='first';
  f.c.OnFormat();const pending=f.calls[0];f.edit();f.events.ContentChange();f.restore();
  pending.settingsCallback(null,f.state,200);
  assert.equal(f.calls.filter(Array.isArray).length,0);
  assert.equal(f.c.documentSession.needsReview,true);assert.equal(Object.keys(f.c.documentSession.overrides).length,0);
  assert.match(f.c.statusText,/人工标记已失效/);f.c.analyzeDocument(f.state.current);
  assert.doesNotThrow(()=>f.c.operationContext());
});
test('指纹相同的编辑事件保留角色，但拒绝正在等待设置的过期上下文',()=>{
  const f=fixture();f.c.OnAddinLoad();f.calls.length=0;
  f.c.documentSession.overrides={1:'preserve'};f.c.documentSession.fingerprint='first';
  f.c.OnFormat();const pending=f.calls[0];f.events.ContentChange();pending.settingsCallback(null,f.state,200);
  assert.equal(f.calls.filter(Array.isArray).length,0);assert.match(f.c.statusText,/文档发生编辑或切换/);
  assert.equal(f.c.documentSession.overrides[1],'preserve');assert.equal(f.c.documentSession.needsReview,false);
  f.c.OnFormat();f.calls.at(-1).settingsCallback(null,f.state,200);
  assert.equal(f.calls.filter(Array.isArray).length,1);
});
test('过期结构页在指纹恢复后不能直接重建人工标记，先分析才能重新指定',()=>{
  const f=fixture();f.c.OnAddinLoad();f.calls.length=0;
  f.c.documentSession.overrides={1:'preserve'};f.c.documentSession.fingerprint='first';
  f.edit();f.events.ContentChange();f.restore();
  let result;f.c.request=(path,data,cb)=>{if(path==='/result')result=data;cb(null,{},200);};
  const command={id:'test',op:'set-role',docID:7,index:1,role:'preserve',fingerprint:'first'};
  f.c.execute(command);assert.equal(result.ok,false);assert.match(result.message,/重新读取文档结构/);
  assert.equal(Object.keys(f.c.documentSession.overrides).length,0);assert.equal(f.c.documentSession.needsReview,true);
  f.c.analyzeDocument(f.state.current);f.c.execute(command);
  assert.equal(result.ok,true);assert.equal(f.c.documentSession.overrides[1],'preserve');
});
test('激活事件注册失败不会取消内容和关闭事件的会话保护',()=>{
  const f=fixture(),register=f.c.wps.ApiEvent.AddApiEventListener;
  f.c.wps.ApiEvent.AddApiEventListener=(name,callback)=>{if(name==='WindowActivate')throw Error('unsupported');register(name,callback);};
  assert.doesNotThrow(()=>f.c.OnAddinLoad());assert.equal(f.c.eventsRegistered,true);
  assert.equal(f.c.activationEventsRegistered,false);assert.equal(typeof f.events.ContentChange,'function');
  assert.equal(typeof f.events.DocumentAfterClose,'function');
});
test('API 抛异常时不能报告 WPS API 可用或取得字体',()=>{
  const f=fixture();f.c.wps.WpsApplication=()=>{throw Error('API denied');};const s=f.c.status();
  assert.equal(s.apiReady,false);assert.equal(s.documentOpen,false);assert.equal(s.fonts,null);
});
test('不同 WPS 实例不能执行其他实例的命令，面板 URL 绑定实例和文档',()=>{
  const a=fixture(),b=fixture();assert.notEqual(a.c.bridgeClientID,b.c.bridgeClientID);
  const url=new URL(a.c.panelURL('structure.html')),params=new URLSearchParams(url.hash.slice(1));
  assert.equal(url.search,'');assert.equal(params.get('clientID'),a.c.bridgeClientID);assert.equal(params.get('docID'),'7');
  let result;a.c.request=(path,data,cb)=>{if(path==='/result')result=data;cb(null,{},200);};
  a.c.execute({id:'foreign',clientID:b.c.bridgeClientID,docID:'7',op:'format'});
  assert.equal(result.ok,false);assert.match(result.message,/其他 WPS 窗口/);assert.equal(a.calls.filter(Array.isArray).length,0);
});
test('桥接只允许一条在途心跳，并在传输中绑定实例',()=>{
  const f=fixture(),sent=[];
  f.c.XMLHttpRequest=function(){this.headers={};this.open=(method,path)=>{this.method=method;this.path=path;};this.setRequestHeader=(k,v)=>{this.headers[k]=v;};this.send=body=>{this.body=body;sent.push(this);};};
  const source=fs.readFileSync('addin/main.js','utf8');vm.runInContext(source,f.c);f.c.bridgeToken='token';
  f.c.tick();f.c.tick();assert.equal(sent.length,1);
  const first=sent[0];assert.equal(first.headers['X-Formatter-Client'],f.c.bridgeClientID);assert.equal(JSON.parse(first.body).clientID,f.c.bridgeClientID);
  first.status=200;first.responseText='{}';first.onload();f.c.tick();assert.equal(sent.length,2);
});
test('没有取得字体列表时仍显示等待，空数组只在实际查询完成后出现',()=>{
  const f=fixture();f.c.FormatterCore.fonts=()=>{throw Error('not ready');};assert.equal(f.c.status().fonts,null);
  f.c.FormatterCore.fonts=()=>[];assert.deepEqual(f.c.status().fonts,[]);
});
