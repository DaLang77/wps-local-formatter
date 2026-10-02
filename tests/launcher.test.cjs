const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const entries=[['初始化.command','init','初始化'],['环境检查.command','check','环境检查'],['回退.command','rollback','回退'],['卸载.command','uninstall','卸载']];

async function fixture(t) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'wps-launcher-test-'));
  const root=path.join(directory,'ZIP with spaces'),bin=path.join(directory,'selected-node');
  await fs.mkdir(path.join(root,'node-host'),{recursive:true});await fs.mkdir(bin);
  await fs.copyFile(path.join(__dirname,'../node-host/launch.sh'),path.join(root,'node-host/launch.sh'));
  await fs.writeFile(path.join(root,'node-host/cli.mjs'),'throw new Error("The real Node must not run this fixture.");\n');
  for(const [name] of entries)await fs.copyFile(path.join(__dirname,'..',name),path.join(root,name));
  const node=path.join(bin,'node');
  await fs.writeFile(node,'#!/bin/bash\nprintf "fake Node action: %s\\n" "$2"\nprintf "module search: %s\\n" "${NODE_PATH:-}"\nif [ "${FAKE_NODE_EXIT:-0}" -ne 0 ]; then printf "%s\\n" "fake failure detail" >&2; fi\nexit "${FAKE_NODE_EXIT:-0}"\n',{mode:0o755});
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  return{root,node,env:{...process.env,PATH:`${bin}:/usr/bin:/bin`,NODE_PATH:'/fixture/retained-module-search'}};
}

test('all command entries use the Node already selected by PATH and report only local completion',async t=>{
  const f=await fixture(t);
  for(const [name,action,label] of entries) {
    const result=spawnSync('/bin/bash',[path.join(f.root,name)],{env:{...f.env,FAKE_NODE_EXIT:'0'},encoding:'utf8',timeout:3000});
    assert.equal(result.status,0,result.stderr);assert.equal(result.error,undefined);
    assert.ok(result.stdout.includes(`使用 Node：${f.node}`));assert.ok(result.stdout.includes(`fake Node action: ${action}`));
    assert.match(result.stdout,/module search: \/fixture\/retained-module-search/);
    assert.ok(result.stdout.includes(`${label}的本地操作已完成`));
    if(action!=='uninstall')assert.match(result.stdout,/WPS.*环境检查.*核对插件连接/);
    assert.doesNotMatch(result.stdout,/按回车/);
  }
});

test('all failed command entries retain the Node exit code and a clear unfinished conclusion',async t=>{
  const f=await fixture(t);
  for(const [name,action,label] of entries) {
    const result=spawnSync('/bin/bash',[path.join(f.root,name)],{env:{...f.env,FAKE_NODE_EXIT:'17'},encoding:'utf8',timeout:3000});
    assert.equal(result.status,17);assert.equal(result.error,undefined);
    assert.ok(result.stdout.includes(`fake Node action: ${action}`));assert.match(result.stderr,/fake failure detail/);
    assert.ok(result.stderr.includes(`${label}未完成（退出码 17）`));assert.doesNotMatch(result.stdout,/本地操作已完成|按回车/);
  }
});

test('a failed command keeps its terminal open until Enter is pressed',{skip:process.platform!=='darwin'},async t=>{
  const f=await fixture(t);
  const python=spawnSync('/bin/bash',['-c','type -P python3'],{encoding:'utf8'}).stdout.trim();
  if(!python){t.skip('Developer PTY verification requires Python 3.');return;}
  const probe=`import os, pty, select, subprocess, sys, time
master, slave = pty.openpty()
child = subprocess.Popen(sys.argv[1:], stdin=slave, stdout=slave, stderr=slave)
os.close(slave)
try:
    output = b''
    deadline = time.monotonic() + 4
    while '按回车关闭此窗口。'.encode() not in output:
        assert time.monotonic() < deadline, output.decode()
        if select.select([master], [], [], 0.1)[0]:
            output += os.read(master, 4096)
    time.sleep(0.1)
    assert child.poll() is None, 'failed command exited before Enter'
    os.write(master, b'\\n')
    assert child.wait(timeout=2) == 17, 'launcher lost the Node exit code'
    sys.stdout.write(output.decode())
finally:
    if child.poll() is None:
        child.kill()
        child.wait()
    os.close(master)
`;
  const result=spawnSync(python,['-c',probe,'/bin/bash',path.join(f.root,'初始化.command')],{env:{...f.env,FAKE_NODE_EXIT:'17'},encoding:'utf8',timeout:7000});
  assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/初始化未完成（退出码 17）/);assert.match(result.stdout,/按回车关闭此窗口/);assert.doesNotMatch(result.stdout,/本地操作已完成/);
});
