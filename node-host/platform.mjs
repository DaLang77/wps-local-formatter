import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const alive = pid => { try { process.kill(pid,0); return true; } catch(error) { if(error.code === 'ESRCH') return false; throw error; } };
export const LABEL = 'local.wps.formatter.background';
export function pathsFor(home = os.homedir()) {
  const base = path.join(home, 'Library/Application Support/WPSLocalFormatter');
  return { base, settings: path.join(base, 'settings.json'), agent: path.join(home, 'Library/LaunchAgents', `${LABEL}.plist`), registration: path.join(home, 'Library/Containers/com.kingsoft.wpsoffice.mac/Data/.kingsoft/wps/jsaddons/publish.xml'), transactions: path.join(base, 'node-transactions'), active: path.join(base, 'node-transaction.json'), last: path.join(base, 'node-last-install.json'), lock:path.join(base,'node-setup.lock'), runtime: path.join(base, 'node-runtime') };
}
async function run(executable, args, options = {}) {
  try { const value = await exec(executable, args, { timeout: 15000, maxBuffer: 256000, ...options }); return { code: 0, stdout: value.stdout, stderr:value.stderr }; }
  catch (error) { if (typeof error.code === 'number') return { code: error.code, stdout: error.stdout || '', stderr:error.stderr || '' }; throw error; }
}
export function defaultPlatform({ uid = process.getuid?.(), runCommand = run, processAlive = alive, clock = Date.now, delay = milliseconds => new Promise(resolve => setTimeout(resolve,milliseconds)), stopTimeoutMs = 60000 } = {}) {
  const domain = `gui/${uid}`, service = `${domain}/${LABEL}`;
  async function portFree() {
    const result = await runCommand('/usr/sbin/netstat',['-an','-p','tcp'],{maxBuffer:2_000_000});
    if(result.code !== 0) throw new Error('无法确认端口 38941 的释放状态，未启动替换服务。');
    return !result.stdout.split('\n').some(line => { const fields=line.trim().split(/\s+/);return /^tcp[46]?$/.test(fields[0] || '') && /[.:]38941$/.test(fields[3] || ''); });
  }
  return {
    async preflight(nodePath) {
      if (process.platform !== 'darwin' || process.arch !== 'arm64' || Number(os.release().split('.')[0]) < 22) throw new Error('需要 Apple 芯片 Mac、macOS 13 或以上。');
      if (!path.isAbsolute(nodePath)) throw new Error('Node 可执行文件必须使用绝对路径。');
      await fs.access(nodePath, fs.constants.X_OK);
      const checked = await runCommand(nodePath, ['-e', 'process.stdout.write(JSON.stringify({version:process.versions.node,arch:process.arch,platform:process.platform}))']);
      if (checked.code !== 0) throw new Error('Node 无法启动。');
      const info = JSON.parse(checked.stdout);
      if (!['22','24'].includes(info.version.split('.')[0]) || info.arch !== 'arm64' || info.platform !== 'darwin') throw new Error('请使用 macOS arm64 版 Node 22 或 24 LTS。');
      const script = "ObjC.import('AppKit'); var w=$.NSWorkspace.sharedWorkspace; var u=w.URLForApplicationWithBundleIdentifier('com.kingsoft.wpsoffice.mac'); JSON.stringify({installed:!!ObjC.unwrap(u),running:Number($.NSRunningApplication.runningApplicationsWithBundleIdentifier('com.kingsoft.wpsoffice.mac').count)});";
      const found = await runCommand('/usr/bin/osascript', ['-l','JavaScript','-e',script]);
      if (found.code !== 0) throw new Error('无法确认 WPS 运行状态，请手动退出 WPS 后再检查。');
      const wps = JSON.parse(found.stdout);
      if (!wps.installed) throw new Error('请先安装 Mac 版 WPS Office。');
      if (!Number.isSafeInteger(wps.running) || wps.running < 0) throw new Error('无法确认 WPS 运行状态，未修改安装。');
      if (wps.running > 0) throw new Error('WPS 仍在运行。请保存文档并退出 WPS，再执行初始化、回退或卸载。');
      return info;
    },
    async loaded() { return (await runCommand('/bin/launchctl', ['print',service])).code === 0; },
    async stop() {
      const before = await runCommand('/bin/launchctl',['print',service]);
      if(before.code !== 0) throw new Error('本工具的登录服务状态已经变化，未执行停止。请重新检查。');
      const pid = before.stdout.match(/^\s*pid = (\d+)\s*$/m)?.[1];
      const stopped = await runCommand('/bin/launchctl', ['bootout',service]);
      if (stopped.code !== 0) throw new Error('无法停止本工具的登录服务，未切换安装。');
      const deadline=clock()+stopTimeoutMs;
      do {
        const removed=(await runCommand('/bin/launchctl',['print',service])).code !== 0;
        const exited=pid === undefined || !processAlive(Number(pid));
        if(removed && exited && await portFree()) return;
        if(clock()>=deadline) break;
        await delay(Math.min(200,Math.max(1,deadline-clock())));
      } while(clock()<=deadline);
      throw new Error(`旧服务进程或端口 38941 在 ${Math.ceil(stopTimeoutMs/1000)} 秒内未释放。未启动替换服务；请检查本工具进程和端口后恢复。`);
    },
    async start(agent) {
      if(!await portFree()) throw new Error('端口 38941 尚有连接或被其他程序占用，未启动登录服务。请等待释放后恢复。');
      if ((await runCommand('/bin/launchctl', ['bootstrap',domain,agent])).code !== 0) throw new Error('登录服务启动失败。');
    },
    async health(expected) {
      for (let attempt = 0; attempt < 20; attempt++) {
        try {
          const response = await fetch('http://127.0.0.1:38941/build-id', { signal: AbortSignal.timeout(750) });
          const value = await response.text();
          if (response.ok && (expected === undefined || value === expected)) return value;
        } catch {}
        await new Promise(resolve => setTimeout(resolve, 150));
      }
      throw new Error('本地服务未就绪，或端口 38941 被其他程序占用。');
    },
    async candidate(stage, nodePath, settings) {
      const result = await runCommand(nodePath, [path.join(stage,'node-host/cli.mjs'),'selftest','--settings',settings], { timeout: 20000 });
      if (result.code !== 0) throw new Error(`候选服务自检失败：${result.stderr.trim() || result.stdout.trim() || '请检查 Node 与配置文件。'}`);
    }
  };
}
