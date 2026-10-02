const test=require('node:test');
const assert=require('node:assert/strict');
async function fixture({pidExitsAt=400,portFreesAt=800,timeout=1000,netstatFails=false}={}) {
  const {defaultPlatform}=await import('../node-host/platform.mjs');let now=0,stopped=false;const calls=[];
  const runCommand=async(executable,args)=>{
    calls.push([executable,args]);
    if(executable==='/usr/sbin/netstat')return netstatFails?{code:1,stdout:''}:{code:0,stdout:now<portFreesAt?'tcp4 0 0 127.0.0.1.38941 127.0.0.1.51234 TIME_WAIT\n':'Active Internet connections\n'};
    assert.equal(executable,'/bin/launchctl');
    if(args[0]==='print')return stopped?{code:113,stdout:''}:{code:0,stdout:'gui/501/local.wps.formatter.background = {\n pid = 12345\n}'};
    if(args[0]==='bootout'){stopped=true;return{code:0,stdout:''};}
    if(args[0]==='bootstrap')return{code:0,stdout:''};
    throw new Error('unexpected command');
  };
  return{calls,get now(){return now;},platform:defaultPlatform({uid:501,runCommand,clock:()=>now,delay:async milliseconds=>{now+=milliseconds;},stopTimeoutMs:timeout,processAlive:pid=>{assert.equal(pid,12345);return now<pidExitsAt;}})};
}
test('stop waits for both captured process exit and TCP TIME_WAIT release after the launchd label disappears',async()=>{
  const f=await fixture();await f.platform.stop();assert.equal(f.now,800);assert.ok(f.calls.filter(c=>c[0]==='/usr/sbin/netstat').length>=3);
  assert.equal(f.calls.some(c=>c[1][0]==='bootstrap'),false);assert.ok(f.calls.filter(c=>c[1][0]==='bootout').every(c=>c[1][1]==='gui/501/local.wps.formatter.background'));
});
test('stop gives a bounded error when the old process stays alive and never starts a replacement',async()=>{
  const f=await fixture({pidExitsAt:Infinity,portFreesAt:0});await assert.rejects(f.platform.stop(),/1 秒内未释放.*未启动替换服务/);assert.equal(f.now,1000);assert.equal(f.calls.some(c=>c[1][0]==='bootstrap'),false);
});
test('stop does not kill or bypass another port owner when the captured process has exited',async()=>{
  const f=await fixture({pidExitsAt:0,portFreesAt:Infinity});await assert.rejects(f.platform.stop(),/未释放/);assert.equal(f.now,1000);assert.equal(f.calls.some(c=>c[1][0]==='bootstrap'),false);
});
test('start refuses a occupied or draining port before bootstrapping the original or candidate service',async()=>{
  const f=await fixture({portFreesAt:Infinity});await assert.rejects(f.platform.start('/original.plist'),/端口 38941 尚有连接/);assert.equal(f.calls.some(c=>c[1][0]==='bootstrap'),false);
  const free=await fixture({portFreesAt:0});await free.platform.start('/original.plist');assert.deepEqual(free.calls.at(-1),['/bin/launchctl',['bootstrap','gui/501','/original.plist']]);
});
test('unknown port state blocks startup instead of treating a failed probe as an empty port',async()=>{
  const f=await fixture({netstatFails:true});await assert.rejects(f.platform.start('/candidate.plist'),/无法确认端口/);assert.equal(f.calls.some(c=>c[1][0]==='bootstrap'),false);
});
