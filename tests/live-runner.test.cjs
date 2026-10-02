const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const version=require('../package.json').version;
const fixture='WPS排版v12通知.docx';

function run(args){
  return new Promise((resolve,reject)=>{
    const child=spawn('python3',[path.join(__dirname,'../scripts/live-v12.py'),...args]);
    let output='';
    child.stdout.on('data',bytes=>output+=bytes);child.stderr.on('data',bytes=>output+=bytes);
    child.on('error',reject);child.on('close',code=>resolve({code,output}));
  });
}
async function harness(t,options={}){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'wps-live-runner-'));
  const build=path.join(dir,'build-id');await fs.writeFile(build,'candidate-build\n');
  let queued=0;
  const status={heartbeatFresh:true,apiReady:true,documentOpen:true,bridgeVersion:version,docID:'7',title:fixture,readOnly:false,...options.status};
  const server=http.createServer((request,response)=>{
    const data=request.url==='/session'?{token:'synthetic-token'}:request.url==='/environment'?{server:{version,buildID:options.buildID??'candidate-build\n'}}:request.url==='/state'?{status}:{};
    if(request.url==='/request')queued++;
    response.setHeader('Content-Type','application/json');response.end(JSON.stringify(data));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await fs.rm(dir,{recursive:true,force:true});});
  return {dir,queued:()=>queued,args:['--fixture',fixture,'--base',`http://127.0.0.1:${server.address().port}`,'--build-id-file',build]};
}

test('live runner rejects absolute and traversal evidence paths before contacting the host',async t=>{
  const h=await harness(t),victim=path.join(h.dir,'settings.json');await fs.writeFile(victim,'original settings');
  for(const name of [path.join(h.dir,'settings'),'../../settings']){
    const result=await run(['inspect',name,...h.args]);assert.notEqual(result.code,0);assert.match(result.output,/不能包含路径/);
  }
  assert.equal(h.queued(),0);assert.equal(await fs.readFile(victim,'utf8'),'original settings');
});
test('live runner refuses the wrong service build before queuing document operations',async t=>{
  const h=await harness(t,{buildID:'legacy-build\n'}),result=await run(['format',randomUUID(),...h.args]);
  assert.notEqual(result.code,0);assert.match(result.output,/不是当前候选构建/);assert.equal(h.queued(),0);
});
test('live runner refuses an old bridge or unavailable document API',async t=>{
  for(const status of [{bridgeVersion:'1.1.0-beta.4'},{apiReady:false}]){
    const h=await harness(t,{status}),result=await run(['probe',randomUUID(),...h.args]);
    assert.notEqual(result.code,0);assert.match(result.output,/尚未就绪/);assert.equal(h.queued(),0);
  }
});
test('live runner requires the exact named fixture instead of a prefix match',async t=>{
  const h=await harness(t,{status:{title:'WPS排版客户材料.docx'}}),result=await run(['undo',randomUUID(),...h.args]);
  assert.notEqual(result.code,0);assert.match(result.output,/不是指定/);assert.equal(h.queued(),0);
});
