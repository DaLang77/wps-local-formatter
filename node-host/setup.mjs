import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { atomicWrite, jsonBytes, readOptional, restoreBytes, syncDirectory } from './io.mjs';
import { defaultPlatform, LABEL, pathsFor } from './platform.mjs';
import { VERSION } from './server.mjs';

const plugin = 'local-wps-formatter';
const digest = bytes => bytes === null ? null : createHash('sha256').update(bytes).digest('hex');
const xmlEscape = value => String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
export function registrationXML(bytes, { removing = false, version = '1.2.0' } = {}) {
  const text = bytes === null ? '<?xml version="1.0" encoding="UTF-8"?><jsplugins/>' : bytes.toString('utf8');
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('WPS 注册文件含未知 XML 声明，未修改。');
  const document = new DOMParser({ onError(level, message) { throw new Error(`XML ${level}: ${message}`); } }).parseFromString(text, 'application/xml');
  const root = document.documentElement;
  if (!root || root.nodeName !== 'jsplugins' || root.namespaceURI) throw new Error('WPS 插件注册文件结构未知，未修改。');
  for (const child of [...root.childNodes]) if (child.nodeType === 1 && child.getAttribute('name') === plugin) root.removeChild(child);
  if (!removing) {
    const entry = document.createElement('jspluginonline');
    for (const [key,value] of Object.entries({ name:plugin,type:'wps',url:'http://127.0.0.1:38941/',enable:'enable_dev',install:'null',version })) entry.setAttribute(key,value);
    root.appendChild(entry);
  }
  return Buffer.from(new XMLSerializer().serializeToString(document));
}
export function launchAgentXML(nodePath, runtime, base) {
  if (!path.isAbsolute(nodePath) || !path.isAbsolute(runtime)) throw new Error('登录服务路径必须是绝对路径。');
  const values = { Label: LABEL, ProgramArguments: [nodePath,path.join(runtime,'node-host/cli.mjs'),'host'], WorkingDirectory:runtime, RunAtLoad:true, KeepAlive:true, ThrottleInterval:10, StandardOutPath:path.join(base,'service.log'), StandardErrorPath:path.join(base,'service-error.log') };
  const encode = value => typeof value === 'boolean' ? `<${value ? 'true' : 'false'}/>` : typeof value === 'number' ? `<integer>${value}</integer>` : Array.isArray(value) ? `<array>${value.map(encode).join('')}</array>` : `<string>${xmlEscape(value)}</string>`;
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>${Object.entries(values).map(([key,value]) => `<key>${key}</key>${encode(value)}`).join('')}</dict></plist>\n`);
}

export class Installer {
  constructor({ home, sourceRoot = fileURLToPath(new URL('../',import.meta.url)), nodePath = process.execPath, paths = pathsFor(home), platform = defaultPlatform(), write = atomicWrite, checkpoint = async () => {}, processAlive = pid => { try { process.kill(pid,0); return true; } catch(error) { if(error.code === 'ESRCH') return false; throw error; } } } = {}) {
    if(!path.isAbsolute(nodePath)) throw new Error('Node 可执行文件必须使用绝对路径。');
    this.paths = paths; this.sourceRoot = sourceRoot; this.nodePath = nodePath; this.platform = platform; this.write = write; this.checkpoint = checkpoint;
    this.processAlive = processAlive;
  }
  async locked(action) {
    await fs.mkdir(this.paths.base,{recursive:true});
    const lock = this.paths.lock || path.join(this.paths.base,'node-setup.lock'), owner = jsonBytes({pid:process.pid,id:randomUUID()}), reclaim = `${lock}.reclaim`;
    const acquire = async () => { const handle = await fs.open(lock,'wx',0o600); try { await handle.writeFile(owner); await handle.sync(); } finally { await handle.close(); } };
    try { await acquire(); }
    catch(error) {
      if(error.code !== 'EEXIST') throw error;
      try { await fs.mkdir(reclaim); } catch { throw new Error('另一项初始化、回退或卸载正在执行，请等待完成。'); }
      try {
        const bytes = await readOptional(lock);
        if(bytes !== null) {
          let record; try { record = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('安装锁文件无效，已保留；请检查是否有另一项安装正在执行。'); }
          if(!Number.isSafeInteger(record.pid) || record.pid < 1 || typeof record.id !== 'string') throw new Error('安装锁记录无效，已保留。');
          if(this.processAlive(record.pid)) throw new Error('另一项初始化、回退或卸载正在执行，请等待完成。');
          await fs.rm(lock);
        }
        await acquire();
      } finally { await fs.rmdir(reclaim); }
    }
    try { return await action(); }
    finally { const current = await readOptional(lock); if(current?.equals(owner)) await fs.rm(lock); }
  }
  async journal(transaction, phase) {
    transaction.phase = phase;
    await this.write(this.paths.active, jsonBytes(transaction)); await this.checkpoint(phase, transaction);
  }
  async snapshot(mode) {
    const id = randomUUID(), directory = path.join(this.paths.transactions,id);
    await fs.mkdir(directory,{recursive:true});
    const files = {};
    for (const key of ['agent','registration','settings']) {
      const bytes = await readOptional(this.paths[key]);
      if (bytes !== null) await this.write(path.join(directory,`${key}.backup`),bytes);
      files[key] = { present:bytes !== null, sha256:digest(bytes) };
    }
    const wasLoaded = await this.platform.loaded(), healthBuildID = wasLoaded ? await this.platform.health() : null;
    const transaction = { version:1,id,mode,directory,files,wasLoaded,healthBuildID,phase:'snapshot',createdAt:new Date().toISOString(),runtime:null };
    await this.write(path.join(directory,'snapshot.json'),jsonBytes(transaction));
    await this.journal(transaction,'snapshot'); return transaction;
  }
  async bytes(transaction, key) {
    const record = transaction.files[key];
    if (!record || typeof record.present !== 'boolean') throw new Error('事务快照记录无效。');
    const bytes = record.present ? await fs.readFile(path.join(transaction.directory,`${key}.backup`)) : null;
    if (digest(bytes) !== record.sha256) throw new Error(`事务快照校验失败：${key}。`);
    return bytes;
  }
  async readRecord(file) {
    const bytes = await readOptional(file); if (bytes === null) return null;
    const record = JSON.parse(bytes.toString('utf8'));
    if (record.version !== 1 || !/^[0-9a-f-]{36}$/.test(record.id || '') || record.directory !== path.join(this.paths.transactions,record.id) || !record.files) throw new Error('事务日志无效，原文件已保留。');
    return record;
  }
  async finish(transaction, phase) {
    transaction.phase = phase;
    await this.write(path.join(transaction.directory,'snapshot.json'),jsonBytes(transaction));
    await fs.rm(this.paths.active,{force:true}); await syncDirectory(this.paths.base);
  }
  async restore(transaction, { settings = false, settingsBytes } = {}) {
    // Verify all backup bytes before changing the live installation.
    const old = {};
    for (const key of ['agent','registration','settings']) old[key] = await this.bytes(transaction,key);
    if (await this.platform.loaded()) await this.platform.stop();
    await restoreBytes(this.paths.registration,old.registration); await restoreBytes(this.paths.agent,old.agent);
    if (settings) await restoreBytes(this.paths.settings,settingsBytes === undefined ? old.settings : settingsBytes);
    if (transaction.wasLoaded) { if (old.agent === null) throw new Error('旧服务快照缺少登录服务文件。'); await this.platform.start(this.paths.agent); await this.platform.health(transaction.healthBuildID); }
  }
  async recoverUnlocked() {
    const transaction = await this.readRecord(this.paths.active);
    if (!transaction) return { recovered:false };
    if (transaction.phase === 'complete') { if(transaction.mode === 'init') await this.write(this.paths.last,jsonBytes(transaction)); await this.finish(transaction,'complete'); return { recovered:true }; }
    if(['snapshot','staged','candidate-ready'].includes(transaction.phase)) {
      for(const key of ['agent','registration','settings']) await this.bytes(transaction,key);
      await this.finish(transaction,'aborted'); return {recovered:true,backup:transaction.directory};
    }
    try { await this.restore(transaction,{settings:transaction.settingsChanged === true}); await this.finish(transaction,'recovered'); }
    catch (error) { throw new Error(`上次操作中断，恢复失败；备份位于 ${transaction.directory}：${error.message}`); }
    return { recovered:true,backup:transaction.directory };
  }
  async recover() { return this.locked(() => this.recoverUnlocked()); }
  async stage(transaction) {
    const runtime = path.join(this.paths.runtime,`${VERSION}-${transaction.id}`);
    await fs.mkdir(runtime,{recursive:true});
    for (const name of ['node-host','addin','package.json','package-lock.json','node_modules']) await fs.cp(path.join(this.sourceRoot,name),path.join(runtime,name),{recursive:true,errorOnExist:true,force:false,dereference:false});
    const build = await readOptional(path.join(this.sourceRoot,'build-id'));
    if (build !== null) await this.write(path.join(runtime,'build-id'),build);
    transaction.buildID = build === null ? VERSION : build.toString('utf8');
    transaction.runtime = runtime;
    await this.journal(transaction,'staged');
    await this.platform.candidate(runtime,this.nodePath,this.paths.settings);
    await this.journal(transaction,'candidate-ready'); return runtime;
  }
  async failed(transaction, original) {
    if(['snapshot','staged','candidate-ready'].includes(transaction.phase)) {
      await this.finish(transaction,'aborted');
      throw new Error(`操作未完成，原安装状态未变：${original.message}`);
    }
    try { await this.restore(transaction,{settings:transaction.settingsChanged === true}); await this.finish(transaction,'restored'); }
    catch (error) { throw new Error(`操作未完成：${original.message}。恢复旧状态也失败：${error.message}。备份：${transaction.directory}`); }
    throw new Error(`操作未完成，已恢复原安装状态：${original.message}`);
  }
  async init() { return this.locked(() => this.initUnlocked()); }
  async initUnlocked() {
    await this.platform.preflight(this.nodePath);
    const recovery = await this.recoverUnlocked();
    const replacement = registrationXML(await readOptional(this.paths.registration));
    const transaction = await this.snapshot('init');
    try {
      const runtime = await this.stage(transaction);
      await this.journal(transaction,'switch-intent');
      if (transaction.wasLoaded) await this.platform.stop();
      await this.journal(transaction,'old-stopped');
      await this.write(this.paths.registration,replacement);
      await this.write(this.paths.agent,launchAgentXML(this.nodePath,runtime,this.paths.base));
      await this.journal(transaction,'registered');
      await this.platform.start(this.paths.agent);
      await this.platform.health(transaction.buildID);
      await this.journal(transaction,'complete');
      await this.write(this.paths.last,jsonBytes(transaction)); await this.finish(transaction,'complete');
      return { ok:true,version:VERSION,runtime,backup:transaction.directory,recovered:recovery.recovered,message:'初始化完成。重新打开 WPS 文档后检查插件连接。' };
    } catch (error) { return this.failed(transaction,error); }
  }
  async check() {
    const interrupted = await readOptional(this.paths.active), last = await this.readRecord(this.paths.last);
    const loaded = await this.platform.loaded(); let buildID = null, error = null;
    if (loaded) { try { buildID = await this.platform.health(); } catch (failure) { error = failure.message; } }
    const ready = loaded && buildID === (last?.buildID || VERSION);
    return { ok:ready && !interrupted,loaded,buildID,version:VERSION,interrupted:interrupted !== null,runtime:last?.runtime || null,settings:this.paths.settings,error,message:interrupted ? '上次操作未完成。退出 WPS 后重新执行初始化以恢复。' : ready ? '本地服务已启动；WPS 连接需在插件内检查。' : '本地服务尚未就绪，请执行初始化。' };
  }
  async preserveModern(directory) {
    const bytes = await readOptional(this.paths.settings);
    if (bytes === null) return null;
    await this.write(path.join(directory,'settings-before-rollback.json'),bytes);
    return bytes;
  }
  async rollback() { return this.locked(() => this.rollbackUnlocked()); }
  async rollbackUnlocked() {
    await this.platform.preflight(this.nodePath); await this.recoverUnlocked();
    const installed = await this.readRecord(this.paths.last);
    if (!installed) throw new Error('没有可回退的 Node 初始化快照。');
    const transaction = await this.snapshot('rollback');
    try {
      const current = await this.preserveModern(transaction.directory), oldAgent = await this.bytes(installed,'agent');
      let settings = null, restoreSettings = false;
      if (oldAgent?.toString('utf8').includes('WPSFormatter') && current !== null) {
        const raw = JSON.parse(current.toString('utf8'));
        if (raw.current?.version === 2 || raw.templates?.some(item => item.config?.version === 2)) {
          settings = await readOptional(`${this.paths.settings}.legacy-v1.backup`);
          if (settings === null) settings = await this.bytes(installed,'settings');
          if (settings !== null) { const compatible = JSON.parse(settings.toString('utf8')); if (compatible.current?.version !== 1 || compatible.templates?.some(item => item.config?.version !== 1)) throw new Error('没有兼容旧版的配置快照，已保留新配置，未回退。'); }
          restoreSettings = true;
        }
      }
      transaction.settingsChanged = restoreSettings;
      await this.journal(transaction,'rollback-intent');
      // The init snapshot contains the exact old registration and service state.
      await this.restore(installed,{settings:restoreSettings,settingsBytes:settings});
      await this.journal(transaction,'complete'); await this.finish(transaction,'complete');
      return { ok:true,backup:transaction.directory,message:'已恢复初始化前的插件与登录服务，新配置已另存。' };
    } catch (error) { return this.failed(transaction,error); }
  }
  async uninstall() { return this.locked(() => this.uninstallUnlocked()); }
  async uninstallUnlocked() {
    await this.platform.preflight(this.nodePath); await this.recoverUnlocked();
    const oldRegistration = await readOptional(this.paths.registration), replacement = oldRegistration === null ? null : registrationXML(oldRegistration,{removing:true});
    const transaction = await this.snapshot('uninstall');
    try {
      await this.journal(transaction,'uninstall-intent');
      if (transaction.wasLoaded) await this.platform.stop();
      if (replacement !== null) await this.write(this.paths.registration,replacement);
      await fs.rm(this.paths.agent,{force:true});
      await this.journal(transaction,'complete'); await this.finish(transaction,'complete');
      return { ok:true,backup:transaction.directory,message:'已移除插件注册和登录服务；设置、备份和旧版应用保留。' };
    } catch (error) { return this.failed(transaction,error); }
  }
}
