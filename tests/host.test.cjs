const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const config = require('../addin/config.js');
const modern = () => (config.modernDefaults || config.defaults)();
async function fixture(t, extra={}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(),'wps-host-test-'));
  const {createHost} = await import('../node-host/server.mjs');
  const host = createHost({settingsPath:path.join(directory,'settings.json'),...extra});
  const {port} = await host.start();
  t.after(async () => {await host.close(); await fs.rm(directory,{recursive:true,force:true});});
  const url = `http://127.0.0.1:${port}`, token = (await (await fetch(`${url}/session`)).json()).token;
  const call = async (route,data,headers={}) => {
    const response = await fetch(url+route,{method:data===undefined?'GET':'POST',headers:{'X-Formatter-Token':token,...(data===undefined?{}:{'Content-Type':'application/json'}),...headers},...(data===undefined?{}:{body:JSON.stringify(data)})});
    return {status:response.status,data:await response.json()};
  };
  const pulse = (extra={}) => call('/poll',{apiReady:true,documentOpen:true,docID:'42',title:'示例.docx',readOnly:false,bridgeVersion:'1.2.0-beta.1',fonts:null,...extra});
  return {directory,host,url,port,token,call,pulse};
}
test('HTTP protects token, exact Host/Origin, and static allowlist',async t=>{
  const f=await fixture(t,{port:0});
  assert.equal((await fetch(f.url+'/settings')).status,403);
  assert.equal((await f.call('/settings',undefined,{'Origin':'https://example.com'})).status,403);
  const wrongHost=await new Promise((resolve,reject)=>{const request=http.get({host:'127.0.0.1',port:f.port,path:'/settings',headers:{Host:`localhost:${f.port}`,'X-Formatter-Token':f.token}},response=>{response.resume();response.on('end',()=>resolve(response.statusCode));});request.on('error',reject);});
  assert.equal(wrongHost,403);
  assert.equal((await fetch(f.url+'/../package.json')).status,403);
  assert.equal((await f.call('/package.json')).status,404);
  const response=await fetch(f.url+'/config.js');
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');
});
test('unknown fonts and API failures remain unknown/unready despite cached connected flag',async t=>{
  let now=10000; const f=await fixture(t,{port:0,clock:()=>now});
  assert.deepEqual((await f.call('/fonts')).data,{fonts:null});
  await f.call('/poll',{connected:true,apiReady:false,documentOpen:false,fonts:null});
  let env=(await f.call('/environment')).data;
  assert.equal(env.wps.heartbeatFresh,true);assert.equal(env.wps.apiReady,false);assert.equal(env.fonts.ready,false);assert.equal(env.fonts.values,null);assert.equal(env.fonts.missing,null);
  await f.pulse({fonts:['仿宋_GB2312']});env=(await f.call('/environment')).data;
  assert.equal(env.fonts.ready,true);assert.ok(env.fonts.missing.includes('华文中宋'));
  now+=4000;const s=(await f.call('/state')).data.status;
  assert.equal(s.connected,false);assert.equal(s.apiReady,false);assert.equal(s.documentOpen,false);assert.equal(s.heartbeatAgeMs,4000);
  assert.equal((await f.call('/environment')).data.fonts.ready,false);
});
test('environment checks heading fonts and bridge mismatches; legacy count is validated',async t=>{
  const f=await fixture(t,{port:0});const current=modern();current.headings[2].font='标题专用字体';await f.call('/settings/save',{revision:0,config:current});
  await f.pulse({fonts:['华文中宋','仿宋_GB2312'],bridgeVersion:'old-bridge'});
  const environment=(await f.call('/environment')).data;assert.equal(environment.wps.versionMatches,false);assert.ok(environment.fonts.missing.includes('标题专用字体'));assert.equal(environment.checks.find(check=>check.id==='bridge-version').state,'blocked');
  assert.equal((await f.call('/request',{op:'analyze',docID:'42'})).status,409);
  await f.pulse();assert.equal((await f.call('/request',{op:'format',docID:'42',count:100})).status,400);
  assert.equal((await f.call('/request',{op:'format',docID:'42',count:3})).status,200);
  const command=(await f.pulse()).data.command;assert.equal(command.count,3);assert.equal(command.config.signatureCount,3);assert.equal(command.config.recognition,'position');
});
test('queue validates context, delivers once, rejects stale results, and preserves request fields',async t=>{
  const f=await fixture(t,{port:0});
  assert.equal((await f.call('/result',{id:'',ok:true})).status,409);
  assert.equal((await f.call('/request',{op:'analyze',docID:'42'})).status,409);
  await f.pulse();assert.equal((await f.call('/request',{op:'analyze',docID:'other'})).status,409);
  const request=await f.call('/request',{op:'set-role',docID:'42',scope:'selection',fingerprint:'abc',index:2,role:'title'});
  assert.equal(request.status,200);const id=request.data.id;
  assert.equal((await f.call('/result',{id,ok:true})).status,409);
  assert.equal((await f.call('/request',{op:'analyze',docID:'42'})).status,409);
  const first=await f.pulse();assert.deepEqual(first.data.command,{id,op:'set-role',docID:'42',scope:'selection',fingerprint:'abc',index:2,role:'title',config:config.normalize(modern())});
  assert.deepEqual((await f.pulse()).data,{});
  assert.equal((await f.call('/result',{id:'stale',ok:true})).status,409);
  assert.equal((await f.call('/result',{id,ok:true,message:'完成'})).status,200);
  assert.equal((await f.call('/result',{id,ok:true,message:'重复结果'})).status,409);
  assert.equal((await f.call('/result',{id:'',ok:true})).status,409);
  const state=(await f.call('/state')).data;assert.equal(state.busy,'');assert.equal(state.resultID,id);
  assert.equal(state.result.message,'完成');
});
test('unclaimed request expires once; claimed mutations remain busy without automatic retry',async t=>{
  let now=1000;const f=await fixture(t,{port:0,clock:()=>now});await f.pulse();
  const a=(await f.call('/request',{op:'format',docID:'42'})).data;now+=10001;
  let state=(await f.call('/state')).data;assert.equal(state.busy,'');assert.equal(state.result.id,a.id);assert.equal(state.result.expired,true);
  assert.equal((await f.call('/result',{id:a.id,ok:true})).status,409);
  await f.pulse();const b=(await f.call('/request',{op:'format',docID:'42'})).data;await f.pulse();now+=120000;
  state=(await f.call('/state')).data;assert.equal(state.busy,b.id);assert.deepEqual((await f.pulse()).data,{});
});
test('document or bridge switching before poll cancels the unclaimed operation',async t=>{
  const f=await fixture(t,{port:0});await f.pulse();const request=(await f.call('/request',{op:'format',docID:'42'})).data;
  assert.deepEqual((await f.pulse({docID:'other'})).data,{});let state=(await f.call('/state')).data;assert.equal(state.busy,'');assert.equal(state.result.id,request.id);assert.equal(state.result.ok,false);
  assert.equal((await f.call('/result',{id:request.id,ok:true})).status,409);
  await f.pulse();const switched=(await f.call('/request',{op:'format',docID:'42'})).data;assert.deepEqual((await f.pulse({bridgeVersion:'old'})).data,{});state=(await f.call('/state')).data;assert.equal(state.busy,'');assert.equal(state.result.ok,false);
  assert.equal((await f.call('/result',{id:switched.id,ok:true})).status,409);
});
test('diagnostics require opt-in and synthetic documents, read-only mutations are rejected',async t=>{
  const normal=await fixture(t,{port:0});await normal.pulse({title:'WPS排版测试.docx'});
  assert.equal((await normal.call('/request',{op:'probe',docID:'42'})).status,400);
  const diagnostic=await fixture(t,{port:0,diagnostics:true});await diagnostic.pulse();
  assert.equal((await diagnostic.call('/request',{op:'probe',docID:'42'})).status,409);
  await diagnostic.pulse({title:'WPS排版测试.docx',readOnly:true});assert.equal((await diagnostic.call('/request',{op:'probe',docID:'42'})).status,409);
  await diagnostic.pulse({title:'WPS排版测试.docx'});const id=(await diagnostic.call('/request',{op:'probe',docID:'42'})).data.id;
  assert.equal(typeof id,'string');assert.equal((await diagnostic.pulse()).data.command.diagnostic,true);
});
test('server rejects chunked and excessive bodies without accepting mutations',async t=>{
  const f=await fixture(t,{port:0});
  const raw=async headers=>new Promise((resolve,reject)=>{
    const request=http.request({host:'127.0.0.1',port:f.port,path:'/settings/save',method:'POST',headers:{'Host':`127.0.0.1:${f.port}`,'X-Formatter-Token':f.token,'Content-Type':'application/json',...headers}},response=>{response.resume();response.on('end',()=>resolve(response.statusCode));});
    request.on('error',reject);request.end('{}');
  });
  assert.equal(await raw({'Transfer-Encoding':'chunked'}),413);
  assert.equal(await raw({'Content-Length':'3900001'}),413);
  assert.equal((await f.call('/settings')).data.revision,0);
});
test('fresh settings and imported templates validate fully, import does not select, export removes private furniture',async t=>{
  const f=await fixture(t,{port:0});let state=(await f.call('/settings')).data;
  assert.equal(state.current.version,modern().version);
  const cfg=modern();cfg.furniture.header.enabled=true;cfg.furniture.header.text='涉案当事人';cfg.furniture.footer.enabled=true;cfg.furniture.footer.text='保密';
  state=(await f.call('/templates/import',{revision:0,payload:{format:'wps-local-formatter-template',fileVersion:1,name:'分享模板',config:cfg}})).data;
  assert.equal(state.revision,1);assert.equal(state.activeTemplateID,'builtin');assert.deepEqual(state.current,config.normalize(modern()));
  const item=state.templates.at(-1),exported=(await f.call('/templates/export',{id:item.id})).data;
  assert.equal(exported.config.furniture.header.text,'');assert.equal(exported.config.furniture.header.enabled,false);assert.equal(exported.config.furniture.footer.text,'');assert.equal(exported.config.furniture.footer.enabled,false);
  assert.equal((await f.call('/templates/export',{id:item.id,includeFurniture:true})).data.config.furniture.header.text,'涉案当事人');
  assert.equal((await f.call('/templates/import',{revision:1,payload:{format:'wps-local-formatter-template',fileVersion:99,name:'bad',config:cfg}})).status,400);
  cfg.body.size=-1;assert.equal((await f.call('/templates/import',{revision:1,payload:{format:'wps-local-formatter-template',fileVersion:1,name:'bad',config:cfg}})).status,400);
  assert.equal((await f.call('/settings')).data.revision,1);
});
test('legacy migration stays in memory until save and backup stores exact original bytes',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'wps-store-test-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const file=path.join(directory,'settings.json'),legacy=config.defaults();
  const raw=Buffer.from(JSON.stringify({version:1,revision:7,current:legacy,activeTemplateID:'builtin',templates:[{id:'builtin',name:'默认文书',config:legacy}]}));await fs.writeFile(file,raw);
  const {SettingsStore}=await import('../node-host/store.mjs');const store=new SettingsStore({file});
  assert.equal((await store.load()).current.version,modern().version);assert.deepEqual(await fs.readFile(file),raw);
  await assert.rejects(store.mutate('/settings/save',{revision:6,config:modern()}));assert.deepEqual(await fs.readFile(file),raw);
  await store.mutate('/settings/save',{revision:7,config:modern()});assert.deepEqual(await fs.readFile(store.legacyBackup),raw);
  assert.equal(JSON.parse(await fs.readFile(file,'utf8')).revision,8);
});
test('serialized store edits reject racing stale revisions, corruption and write failures preserve source',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'wps-store-test-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const file=path.join(directory,'settings.json'),{SettingsStore}=await import('../node-host/store.mjs'),store=new SettingsStore({file});
  const results=await Promise.allSettled([store.mutate('/settings/save',{revision:0,config:modern()}),store.mutate('/settings/save',{revision:0,config:modern()})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const bytes=await fs.readFile(file),broken=new SettingsStore({file,write:async()=>{throw new Error('simulated disk failure');}});
  await assert.rejects(broken.mutate('/settings/save',{revision:1,config:modern()}),/保存失败/);assert.deepEqual(await fs.readFile(file),bytes);
  await fs.writeFile(file,'bad-json');await assert.rejects(store.load(),/原文件已保留/);assert.equal(await fs.readFile(file,'utf8'),'bad-json');
});
