#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHost, STATIC_FILES, VERSION } from './server.mjs';
import { Installer } from './setup.mjs';
import { readOptional } from './io.mjs';

const args = process.argv.slice(2), command = args.shift() || 'check';
const options = {};
for (let index = 0; index < args.length; index++) {
  const key = args[index];
  if (key === '--diagnostics') options.diagnostics = true;
  else if (['--port','--settings','--static-dir','--build-id','--home','--source-root','--node'].includes(key) && args[index + 1] !== undefined) options[key.slice(2)] = args[++index];
  else throw new Error(`未知参数：${key}`);
}
async function main() {
  if (command === 'host' || command === 'selftest') {
    const staticDir = options['static-dir'] || fileURLToPath(new URL('../addin/',import.meta.url));
    const port = command === 'selftest' ? 0 : options.port === undefined ? 38941 : Number(options.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('端口无效。');
    const build = await readOptional(fileURLToPath(new URL('../build-id',import.meta.url)));
    const host = createHost({ staticDir,settingsPath:options.settings,port,diagnostics:!!options.diagnostics,buildID:options['build-id'] || (build === null ? VERSION : build.toString('utf8')) });
    const address = await host.start();
    if (command === 'selftest') {
      try {
        const origin = `http://127.0.0.1:${address.port}`;
        const session = await (await fetch(`${origin}/session`)).json();
        const environment = await fetch(`${origin}/environment`,{headers:{'X-Formatter-Token':session.token}});
        if (!environment.ok) throw new Error((await environment.json()).error || '配置读取失败。');
        for (const name of STATIC_FILES) {
          if (!STATIC_FILES.has(name)) throw new Error('静态文件列表无效。');
          const response = await fetch(`${origin}/${name}`), bytes = Buffer.from(await response.arrayBuffer());
          if (!response.ok || !bytes.equals(await fs.readFile(path.join(staticDir,name)))) throw new Error(`资源校验失败：${name}`);
        }
        process.stdout.write(`${JSON.stringify({ok:true,version:VERSION,port:address.port})}\n`);
      } finally { await host.close(); }
      return;
    }
    process.stdout.write(`${JSON.stringify({event:'listening',host:address.host,port:address.port,version:VERSION})}\n`);
    const stop = () => host.close().then(() => process.exit(0),() => process.exit(1));
    process.once('SIGINT',stop); process.once('SIGTERM',stop); return;
  }
  if (!['init','check','rollback','uninstall'].includes(command)) throw new Error('使用：node node-host/cli.mjs init|check|rollback|uninstall|host');
  const installer = new Installer({home:options.home,sourceRoot:options['source-root'],nodePath:options.node || process.execPath});
  const result = await installer[command](); process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
  if (!result.ok) process.exitCode = 1;
}
main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
