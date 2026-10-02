const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
function fixture(){
  const app={ActiveDocument:{DocID:7,Name:'合成测试.docx'},Selection:{Range:{Start:4,End:8}}},calls=[];
  let fingerprint='first';
  const state={revision:0,current:{version:2},activeTemplateID:'builtin',templates:[{id:'builtin',name:'合成模板'}]};
  const c={window:{},Object,wps:{WpsApplication:()=>app},FormatterCore:{
    captureContext:(a,scope)=>({docID:String(a.ActiveDocument.DocID),scope,fingerprint,selection:{start:a.Selection.Range.Start,end:a.Selection.Range.End}}),
    fonts:()=>[],apply:(...args)=>{calls.push(args);return {ok:true,message:'已排版'};},
    readParagraphs:()=>[{index:1,story:1,table:false}],analyze:()=>[{index:1,role:'title',summary:'合成测试'}]
  }};
  vm.createContext(c);vm.runInContext(fs.readFileSync('addin/main.js','utf8'),c);
  c.settingsState=state;c.request=(path,data,cb)=>{if(path==='/settings')calls.push({settingsCallback:cb});else cb(null,{},200);};
  c.bridgeToken='local-test';
  return {c,app,state,calls,edit:()=>{fingerprint='edited';}};
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
test('API 抛异常时不能报告 WPS API 可用或取得字体',()=>{
  const f=fixture();f.c.wps.WpsApplication=()=>{throw Error('API denied');};const s=f.c.status();
  assert.equal(s.apiReady,false);assert.equal(s.documentOpen,false);assert.equal(s.fonts,null);
});
test('没有取得字体列表时仍显示等待，空数组只在实际查询完成后出现',()=>{
  const f=fixture();f.c.FormatterCore.fonts=()=>{throw Error('not ready');};assert.equal(f.c.status().fonts,null);
  f.c.FormatterCore.fonts=()=>[];assert.deepEqual(f.c.status().fonts,[]);
});
