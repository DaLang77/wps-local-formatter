import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
export const LABEL = 'local.wps.formatter.background';
export function pathsFor(home = os.homedir()) {
  const base = path.join(home, 'Library/Application Support/WPSLocalFormatter');
  return { base, settings: path.join(base, 'settings.json'), agent: path.join(home, 'Library/LaunchAgents', `${LABEL}.plist`), registration: path.join(home, 'Library/Containers/com.kingsoft.wpsoffice.mac/Data/.kingsoft/wps/jsaddons/publish.xml'), transactions: path.join(base, 'node-transactions'), active: path.join(base, 'node-transaction.json'), last: path.join(base, 'node-last-install.json'), lock:path.join(base,'node-setup.lock'), runtime: path.join(base, 'node-runtime') };
}
async function run(executable, args, options = {}) {
  try { const value = await exec(executable, args, { timeout: 15000, maxBuffer: 256000, ...options }); return { code: 0, stdout: value.stdout, stderr:value.stderr }; }
  catch (error) { if (typeof error.code === 'number') return { code: error.code, stdout: error.stdout || '', stderr:error.stderr || '' }; throw error; }
}
export function defaultPlatform({ uid = process.getuid?.() } = {}) {
  const domain = `gui/${uid}`, service = `${domain}/${LABEL}`;
  return {
    async preflight(nodePath) {
      if (process.platform !== 'darwin' || process.arch !== 'arm64' || Number(os.release().split('.')[0]) < 22) throw new Error('需要 Apple 芯片 Mac、macOS 13 或以上。');
      if (!path.isAbsolute(nodePath)) throw new Error('Node 可执行文件必须使用绝对路径。');
      await fs.access(nodePath, fs.constants.X_OK);
      const checked = await run(nodePath, ['-e', 'process.stdout.write(JSON.stringify({version:process.versions.node,arch:process.arch,platform:process.platform}))']);
      if (checked.code !== 0) throw new Error('Node 无法启动。');
      const info = JSON.parse(checked.stdout);
      if (!['22','24'].includes(info.version.split('.')[0]) || info.arch !== 'arm64' || info.platform !== 'darwin') throw new Error('请使用 macOS arm64 版 Node 22 或 24 LTS。');
      const script = "ObjC.import('AppKit'); var w=$.NSWorkspace.sharedWorkspace; var u=w.URLForApplicationWithBundleIdentifier('com.kingsoft.wpsoffice.mac'); JSON.stringify({installed:!!ObjC.unwrap(u),running:Number($.NSRunningApplication.runningApplicationsWithBundleIdentifier('com.kingsoft.wpsoffice.mac').count)});";
      const found = await run('/usr/bin/osascript', ['-l','JavaScript','-e',script]);
      if (found.code !== 0) throw new Error('无法确认 WPS 运行状态，请手动退出 WPS 后再检查。');
      const wps = JSON.parse(found.stdout);
      if (!wps.installed) throw new Error('请先安装 Mac 版 WPS Office。');
      if (!Number.isSafeInteger(wps.running) || wps.running < 0) throw new Error('无法确认 WPS 运行状态，未修改安装。');
      if (wps.running > 0) throw new Error('WPS 仍在运行。请保存文档并退出 WPS，再执行初始化、回退或卸载。');
      return info;
    },
    async loaded() { return (await run('/bin/launchctl', ['print',service])).code === 0; },
    async stop() {
      const stopped = await run('/bin/launchctl', ['bootout',service]);
      if (stopped.code !== 0) throw new Error('无法停止本工具的登录服务，未切换安装。');
      if ((await run('/bin/launchctl', ['print',service])).code === 0) throw new Error('旧登录服务仍在运行，未切换安装。');
    },
    async start(agent) { if ((await run('/bin/launchctl', ['bootstrap',domain,agent])).code !== 0) throw new Error('登录服务启动失败。'); },
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
      const result = await run(nodePath, [path.join(stage,'node-host/cli.mjs'),'selftest','--settings',settings], { timeout: 20000 });
      if (result.code !== 0) throw new Error(`候选服务自检失败：${result.stderr.trim() || result.stdout.trim() || '请检查 Node 与配置文件。'}`);
    }
  };
}
