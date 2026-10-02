const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const config=require('../addin/config.js');
const modern=()=>config.modernDefaults();
async function fixture(t,extra={}) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'wps-setup-test-')),home=path.join(directory,'home'),source=path.join(directory,'source');
  const {pathsFor}=await import('../node-host/platform.mjs'),{Installer}=await import('../node-host/setup.mjs'),{atomicWrite}=await import('../node-host/io.mjs');
  const paths=pathsFor(home);
  for(const name of ['node-host','addin','node_modules']) {await fs.mkdir(path.join(source,name),{recursive:true});await fs.writeFile(path.join(source,name,'fixture.txt'),name);}
  for(const name of ['package.json','package-lock.json'])await fs.writeFile(path.join(source,name),'{}');await fs.writeFile(path.join(source,'build-id'),'candidate-build-123\n');
  const legacy=config.defaults(),old={agent:Buffer.from('<plist><string>/old/WPS一键排版.app/Contents/MacOS/WPSFormatter</string></plist>'),registration:Buffer.from('<?xml version="1.0"?><jsplugins><!--keep comment--><jspluginonline name="other" url="http://example.invalid/" enabled="1"/><jspluginonline name="local-wps-formatter" url="http://old/"/></jsplugins>'),settings:Buffer.from(JSON.stringify({version:1,revision:3,current:legacy,activeTemplateID:'builtin',templates:[{id:'builtin',name:'默认文书',config:legacy}]}))};
  for(const key of Object.keys(old))await atomicWrite(paths[key],old[key]);
  await fs.mkdir(path.join(paths.base,'WPS一键排版.app'),{recursive:true});await fs.writeFile(path.join(paths.base,'WPS一键排版.app','keep.txt'),'keep old app');
  let loaded=true,currentBuild='old-build';const calls=[];
  const platform={
    async preflight(node){calls.push(['preflight',node]);if(extra.running)throw new Error('WPS 仍在运行，请先保存并退出。');return{version:'22.22.0',arch:'arm64'};},
    async loaded(){return loaded;},
    async stop(){calls.push(['stop']);loaded=false;},
    async start(agent){calls.push(['start',agent]);loaded=true;const xml=await fs.readFile(agent,'utf8');currentBuild=xml.includes('node-host/cli.mjs')?'candidate-build-123\n':'old-build';},
    async health(expected){calls.push(['health',expected]);if(extra.healthFailure && expected==='candidate-build-123\n')throw new Error('candidate-health-failure');if(expected!==undefined && expected!==currentBuild)throw new Error(`bad-build:${expected}`);return currentBuild;},
    async candidate(stage,node,settings){calls.push(['candidate',stage,node,settings]);if(extra.candidateFailure)throw new Error('candidate-selftest-failure');assert.equal(await fs.readFile(path.join(stage,'build-id'),'utf8'),'candidate-build-123\n');}
  };
  const installer=new Installer({home,sourceRoot:source,platform,...extra.options});
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const unchanged=async()=>{for(const key of Object.keys(old))assert.deepEqual(await fs.readFile(paths[key]),old[key]);};
  return{directory,home,source,paths,old,calls,platform,installer,unchanged,Installer,atomicWrite,setLoaded(value){loaded=value;},get loaded(){return loaded;}};
}
test('registration updates preserve other XML entries, reject malformed/unknown XML, and uninstall removes only this plugin',async()=>{
  const{registrationXML,launchAgentXML}=await import('../node-host/setup.mjs');
  const old=Buffer.from('<jsplugins><!--x--><jspluginonline name="other" token="keep &amp; ok"/><jspluginonline name="local-wps-formatter"/></jsplugins>');
  const updated=registrationXML(old).toString();assert.match(updated,/name="other" token="keep &amp; ok"/);assert.match(updated,/<!--x-->/);assert.match(updated,/version="1.2.0"/);assert.equal((updated.match(/name="local-wps-formatter"/g)||[]).length,1);
  const removed=registrationXML(Buffer.from(updated),{removing:true}).toString();assert.match(removed,/name="other"/);assert.doesNotMatch(removed,/local-wps-formatter/);
  assert.throws(()=>registrationXML(Buffer.from('<jsplugins><bad></jsplugins>')));assert.throws(()=>registrationXML(Buffer.from('<unknown/>')));assert.throws(()=>registrationXML(Buffer.from('<!DOCTYPE jsplugins><jsplugins/>')));
  assert.throws(()=>launchAgentXML('node','/runtime','/base'),/绝对路径/);const plist=launchAgentXML('/some & path/node','/runtime','/base').toString();assert.match(plist,/some &amp; path/);assert.match(plist,/<key>RunAtLoad<\/key><true\/>/);assert.match(plist,/<key>KeepAlive<\/key><true\/>/);
});
test('successful init stages and selftests before stopping, stores exact durable snapshots and preserves settings/Swift app',async t=>{
  const f=await fixture(t);const result=await f.installer.init();assert.equal(result.ok,true);assert.equal(f.loaded,true);
  assert.ok(f.calls.findIndex(c=>c[0]==='candidate')<f.calls.findIndex(c=>c[0]==='stop'));
  assert.deepEqual(await fs.readFile(f.paths.settings),f.old.settings);assert.equal(await fs.readFile(path.join(f.paths.base,'WPS一键排版.app','keep.txt'),'utf8'),'keep old app');
  for(const key of Object.keys(f.old))assert.deepEqual(await fs.readFile(path.join(result.backup,`${key}.backup`)),f.old[key]);
  assert.equal((await f.installer.check()).ok,true);assert.equal(await fs.readFile(path.join(result.runtime,'build-id'),'utf8'),'candidate-build-123\n');
  assert.match(await fs.readFile(f.paths.registration,'utf8'),/name="other"/);assert.match(await fs.readFile(f.paths.agent,'utf8'),new RegExp(process.execPath.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.equal(await fs.readFile(f.paths.active).catch(e=>e.code), 'ENOENT');assert.equal(await fs.readFile(f.paths.lock).catch(e=>e.code),'ENOENT');
});
test('running WPS blocks all mutations before snapshot; candidate failure keeps old service and bytes',async t=>{
  const running=await fixture(t,{running:true});await assert.rejects(running.installer.init(),/WPS 仍在运行/);await running.unchanged();assert.equal(running.calls.some(c=>c[0]==='stop'),false);
  const candidate=await fixture(t,{candidateFailure:true});await assert.rejects(candidate.installer.init(),/原安装状态未变.*candidate-selftest-failure/);await candidate.unchanged();assert.equal(candidate.loaded,true);assert.equal(candidate.calls.filter(c=>c[0]==='stop').length,0);
});
test('snapshot failure occurs before service stop and preserves exact installed bytes',async t=>{
  const f=await fixture(t);const failure=new f.Installer({home:f.home,sourceRoot:f.source,platform:f.platform,write:async(file,bytes)=>{if(file.endsWith('registration.backup'))throw new Error('disk full');await f.atomicWrite(file,bytes);}});
  await assert.rejects(failure.init(),/disk full/);await f.unchanged();assert.equal(f.calls.some(c=>c[0]==='stop'),false);
});
test('cutover and candidate-health failures restore bytes and verify original service health',async t=>{
  for(const mode of ['checkpoint','health']){
    const f=await fixture(t,{healthFailure:mode==='health',options:mode==='checkpoint'?{checkpoint:async phase=>{if(phase==='registered')throw new Error('interrupted-write');}}:{}});
    await assert.rejects(f.installer.init(),/已恢复原安装状态/);await f.unchanged();assert.equal(f.loaded,true);assert.deepEqual(f.calls.at(-1),['health','old-build']);
  }
});
test('interrupted cutover is recovered from verified snapshots before next init; bad snapshot blocks restoration',async t=>{
  const f=await fixture(t);const transaction=await f.installer.snapshot('init');await f.installer.journal(transaction,'registered');
  await fs.writeFile(f.paths.agent,'partial-agent');await fs.writeFile(f.paths.registration,'partial-registration');f.setLoaded(false);
  const recovered=await f.installer.recover();assert.equal(recovered.recovered,true);await f.unchanged();assert.equal(f.loaded,true);
  const bad=await f.installer.snapshot('init');await fs.writeFile(path.join(bad.directory,'agent.backup'),'tampered');await fs.writeFile(f.paths.agent,'current-should-remain');
  await assert.rejects(f.installer.recover(),/快照校验失败/);assert.equal(await fs.readFile(f.paths.agent,'utf8'),'current-should-remain');
});
test('rollback saves v2 settings before restoring exact v1-compatible configuration and old service',async t=>{
  const f=await fixture(t);await f.installer.init();const{SettingsStore}=await import('../node-host/store.mjs');const store=new SettingsStore({file:f.paths.settings});await store.mutate('/settings/save',{revision:3,config:modern()});const v2=await fs.readFile(f.paths.settings);
  const result=await f.installer.rollback();assert.equal(result.ok,true);await f.unchanged();assert.deepEqual(await fs.readFile(path.join(result.backup,'settings-before-rollback.json')),v2);assert.deepEqual(f.calls.at(-1),['health','old-build']);
});
test('rollback settings restoration failure restores current Node settings and service',async t=>{
  const f=await fixture(t);await f.installer.init();const{SettingsStore}=await import('../node-host/store.mjs');await new SettingsStore({file:f.paths.settings}).mutate('/settings/save',{revision:3,config:modern()});const before=await fs.readFile(f.paths.settings);
  const installer=new f.Installer({home:f.home,sourceRoot:f.source,platform:f.platform,checkpoint:async phase=>{if(phase==='rollback-intent')throw new Error('forced-before-rollback');}});
  await assert.rejects(installer.rollback(),/已恢复原安装状态/);assert.deepEqual(await fs.readFile(f.paths.settings),before);assert.match(await fs.readFile(f.paths.agent,'utf8'),/node-host\/cli.mjs/);assert.equal(f.loaded,true);
});
test('uninstall removes only registration and login service and preserves settings, runtime, old app',async t=>{
  const f=await fixture(t);const installed=await f.installer.init();const result=await f.installer.uninstall();assert.equal(result.ok,true);assert.equal(f.loaded,false);assert.equal(await fs.readFile(f.paths.agent).catch(e=>e.code),'ENOENT');
  const xml=await fs.readFile(f.paths.registration,'utf8');assert.match(xml,/name="other"/);assert.doesNotMatch(xml,/local-wps-formatter/);assert.deepEqual(await fs.readFile(f.paths.settings),f.old.settings);assert.ok((await fs.stat(installed.runtime)).isDirectory());assert.equal(await fs.readFile(path.join(f.paths.base,'WPS一键排版.app','keep.txt'),'utf8'),'keep old app');
});
test('exclusive installer lock prevents concurrent mutation and recovers dead PID locks',async t=>{
  const f=await fixture(t);let release,started;const entering=new Promise(resolve=>{started=resolve;}),block=new Promise(resolve=>{release=resolve;});
  const owner=new f.Installer({home:f.home,sourceRoot:f.source,platform:f.platform,checkpoint:async phase=>{if(phase==='candidate-ready'){started();await block;}}});
  const first=owner.init();await entering;await assert.rejects(f.installer.init(),/另一项/);release();await first;
  await fs.writeFile(f.paths.lock,JSON.stringify({pid:99999999,id:'dead-lock'}));const recovery=new f.Installer({home:f.home,sourceRoot:f.source,platform:f.platform,processAlive:()=>false});assert.equal((await recovery.recover()).recovered,false);assert.equal(await fs.readFile(f.paths.lock).catch(e=>e.code),'ENOENT');
  assert.throws(()=>new f.Installer({home:f.home,nodePath:'node'}),/绝对路径/);
});
test('rollback and uninstall remain available when the installed candidate HTTP endpoint is broken',async t=>{
  for(const operation of ['rollback','uninstall']) {
    const f=await fixture(t);await f.installer.init();const healthy=f.platform.health;
    f.platform.health=async expected=>{
      if(expected===undefined && (await fs.readFile(f.paths.agent,'utf8')).includes('node-host/cli.mjs'))throw new Error('broken-current-node-http');
      return healthy(expected);
    };
    const result=await f.installer[operation]();assert.equal(result.ok,true);
    if(operation==='rollback') {await f.unchanged();assert.equal(f.loaded,true);assert.deepEqual(f.calls.at(-1),['health','old-build']);}
    else {assert.equal(f.loaded,false);assert.equal(await fs.readFile(f.paths.agent).catch(e=>e.code),'ENOENT');assert.deepEqual(await fs.readFile(f.paths.settings),f.old.settings);}
  }
});
test('failed uninstall restores an originally unhealthy service loading state without claiming HTTP recovery',async t=>{
  const f=await fixture(t);await f.installer.init();const beforeAgent=await fs.readFile(f.paths.agent),beforeRegistration=await fs.readFile(f.paths.registration);
  f.platform.health=async()=>{throw new Error('original-http-unavailable');};
  const installer=new f.Installer({home:f.home,sourceRoot:f.source,platform:f.platform,checkpoint:async phase=>{if(phase==='uninstall-intent')throw new Error('forced-uninstall-failure');}});
  await assert.rejects(installer.uninstall(),/原服务在操作前未就绪.*仍需检查/);
  assert.equal(f.loaded,true);assert.deepEqual(await fs.readFile(f.paths.agent),beforeAgent);assert.deepEqual(await fs.readFile(f.paths.registration),beforeRegistration);assert.deepEqual(await fs.readFile(f.paths.settings),f.old.settings);
});
test('rollback preserves unrelated registrations added or edited after installation',async t=>{
  const f=await fixture(t);await f.installer.init();let registration=await fs.readFile(f.paths.registration,'utf8');
  registration=registration.replace('http://example.invalid/','http://updated-after-install.invalid/').replace('</jsplugins>','<jspluginonline name="new-independent-plugin" url="http://later.invalid/"/></jsplugins>');await fs.writeFile(f.paths.registration,registration);
  await f.installer.rollback();const restored=await fs.readFile(f.paths.registration,'utf8');
  assert.match(restored,/name="other" url="http:\/\/updated-after-install.invalid\/"/);assert.match(restored,/name="new-independent-plugin"/);assert.match(restored,/name="local-wps-formatter" url="http:\/\/old\/"/);assert.deepEqual(await fs.readFile(f.paths.settings),f.old.settings);assert.deepEqual(await fs.readFile(f.paths.agent),f.old.agent);
});
test('repeated migration and rollback uses the latest compatible install snapshot instead of a stale global backup',async t=>{
  const f=await fixture(t),{SettingsStore}=await import('../node-host/store.mjs');await f.installer.init();await new SettingsStore({file:f.paths.settings}).mutate('/settings/save',{revision:3,config:modern()});await f.installer.rollback();
  const changed=JSON.parse(f.old.settings.toString('utf8'));changed.revision=5;changed.current.body.size=16;changed.templates[0].config.body.size=16;const expected=Buffer.from(JSON.stringify(changed));await fs.writeFile(f.paths.settings,expected);
  await f.installer.init();await new SettingsStore({file:f.paths.settings}).mutate('/settings/save',{revision:5,config:modern()});await f.installer.rollback();
  assert.deepEqual(await fs.readFile(f.paths.settings),expected);assert.deepEqual(await fs.readFile(`${f.paths.settings}.legacy-v1.backup`),f.old.settings);
});
test('init aborts before stopping the old service if WPS is reopened during candidate checks',async t=>{
  const f=await fixture(t),original=f.platform.preflight;let checks=0;
  f.platform.preflight=async node=>{if(++checks>1)throw new Error('WPS 在自检期间重新打开，请先保存并退出。');return original(node);};
  await assert.rejects(f.installer.init(),/原安装状态未变.*WPS 在自检期间/);await f.unchanged();assert.equal(f.calls.some(call=>call[0]==='stop'),false);
});
test('init preserves a concurrent external registration update rather than overwriting it with a stale snapshot',async t=>{
  const f=await fixture(t),candidate=f.platform.candidate;let changed;
  f.platform.candidate=async(...args)=>{await candidate(...args);changed=Buffer.from(f.old.registration.toString().replace('</jsplugins>','<jspluginonline name="concurrent-other-plugin"/></jsplugins>'));await fs.writeFile(f.paths.registration,changed);};
  await assert.rejects(f.installer.init(),/文件发生变化.*未开始切换/);assert.deepEqual(await fs.readFile(f.paths.registration),changed);assert.deepEqual(await fs.readFile(f.paths.agent),f.old.agent);assert.deepEqual(await fs.readFile(f.paths.settings),f.old.settings);assert.equal(f.calls.some(call=>call[0]==='stop'),false);
});
test('init repairs an unavailable old Node host with a healthy candidate while preserving settings',async t=>{
  const f=await fixture(t);await f.installer.init();const previousAgent=await fs.readFile(f.paths.agent),beforeSettings=await fs.readFile(f.paths.settings),health=f.platform.health;
  f.platform.health=async expected=>{if(expected===undefined)throw new Error('old-node-path-unavailable');return health(expected);};
  const result=await f.installer.init();assert.equal(result.ok,true);assert.equal(f.loaded,true);assert.notDeepEqual(await fs.readFile(f.paths.agent),previousAgent);assert.deepEqual(await fs.readFile(f.paths.settings),beforeSettings);
  const record=JSON.parse(await fs.readFile(path.join(result.backup,'snapshot.json'),'utf8'));assert.equal(record.healthWasReady,false);assert.equal(record.wasLoaded,true);assert.deepEqual(await fs.readFile(path.join(result.backup,'agent.backup')),previousAgent);assert.deepEqual(f.calls.at(-1),['health','candidate-build-123\n']);
});
test('failed init candidate retains the previously unavailable Node state and reports that it still needs repair',async t=>{
  const f=await fixture(t);await f.installer.init();const oldAgent=await fs.readFile(f.paths.agent),oldRegistration=await fs.readFile(f.paths.registration),oldSettings=await fs.readFile(f.paths.settings);
  f.platform.health=async()=>{throw new Error('old-node-http-unavailable');};f.platform.candidate=async()=>{throw new Error('new-candidate-selftest-failed');};const stopsBefore=f.calls.filter(call=>call[0]==='stop').length;
  await assert.rejects(f.installer.init(),/原安装状态未变.*new-candidate-selftest-failed.*原服务在操作前未就绪.*仍需检查/);
  assert.equal(f.loaded,true);assert.equal(f.calls.filter(call=>call[0]==='stop').length,stopsBefore);assert.deepEqual(await fs.readFile(f.paths.agent),oldAgent);assert.deepEqual(await fs.readFile(f.paths.registration),oldRegistration);assert.deepEqual(await fs.readFile(f.paths.settings),oldSettings);
});
test('failed candidate startup restores an originally unavailable Node host without claiming HTTP recovery',async t=>{
  const f=await fixture(t);await f.installer.init();const oldAgent=await fs.readFile(f.paths.agent),oldRegistration=await fs.readFile(f.paths.registration),oldSettings=await fs.readFile(f.paths.settings);
  f.platform.health=async()=>{throw new Error('host-unavailable');};
  await assert.rejects(f.installer.init(),/已恢复原安装状态.*原服务在操作前未就绪.*仍需检查/);
  assert.equal(f.loaded,true);assert.deepEqual(await fs.readFile(f.paths.agent),oldAgent);assert.deepEqual(await fs.readFile(f.paths.registration),oldRegistration);assert.deepEqual(await fs.readFile(f.paths.settings),oldSettings);
});
