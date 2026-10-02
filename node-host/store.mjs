import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { FormatterError, atomicWrite, copy, jsonBytes, object, readOptional, syncDirectory } from './io.mjs';

const require = createRequire(import.meta.url);
const configFile = fileURLToPath(new URL('../addin/config.js', import.meta.url));
export class SettingsStore {
  constructor({ file = path.join(os.homedir(), 'Library/Application Support/WPSLocalFormatter/settings.json'), configModule = require(configFile), write = atomicWrite } = {}) {
    this.file = file; this.config = configModule; this.write = write; this.tail = Promise.resolve();
    this.legacyBackup = `${file}.legacy-v1.backup`;
  }
  normalize(value) {
    try { return this.config.normalize(value); } catch (error) { throw new FormatterError(error.message, 400); }
  }
  fresh() {
    const config = this.normalize((this.config.modernDefaults || this.config.defaults)());
    return { version: 1, revision: 0, current: config, activeTemplateID: 'builtin', templates: [{ id: 'builtin', name: '默认文书', config: copy(config) }] };
  }
  async load() {
    const bytes = await readOptional(this.file);
    if (bytes === null) return this.fresh();
    try {
      const state = JSON.parse(bytes.toString('utf8'));
      if (!object(state) || state.version !== 1 || !Number.isSafeInteger(state.revision) || state.revision < 0 || !Array.isArray(state.templates) || !state.templates.length || state.templates.length > 200 || typeof state.activeTemplateID !== 'string') throw new Error('模板数据结构无效。');
      const ids = new Set(), names = new Set();
      const templates = state.templates.map(item => {
        if (!object(item) || typeof item.id !== 'string' || !item.id || item.id.length > 100 || typeof item.name !== 'string' || !item.name || item.name.length > 40 || /[\x00-\x1f\x7f]/.test(item.name) || ids.has(item.id) || names.has(item.name)) throw new Error('模板记录无效。');
        ids.add(item.id); names.add(item.name);
        return { id: item.id, name: item.name, config: this.normalize(item.config) };
      });
      if (!ids.has('builtin') || !ids.has(state.activeTemplateID)) throw new Error('当前模板不存在。');
      return { version: 1, revision: state.revision, current: this.normalize(state.current), activeTemplateID: state.activeTemplateID, templates };
    } catch (error) { throw new FormatterError(`本地设置读取失败，原文件已保留：${error.message}`, 500); }
  }
  name(value, templates) {
    const name = typeof value === 'string' ? value.trim() : '';
    if (!name || [...name].length > 40 || /[\x00-\x1f\x7f]/.test(name)) throw new FormatterError('模板名称请输入 1～40 个字符。');
    if (templates.some(item => item.name === name)) throw new FormatterError('已有同名模板，请更换名称。', 409);
    if (templates.length >= 200) throw new FormatterError('最多保存 199 个自定义模板。', 409);
    return name;
  }
  async preserveLegacy() {
    const bytes = await readOptional(this.file);
    if (bytes === null) return;
    const raw = JSON.parse(bytes.toString('utf8'));
    if (raw.current?.version !== 1 && !raw.templates?.some(item => item.config?.version === 1)) return;
    await fs.mkdir(path.dirname(this.legacyBackup), { recursive: true });
    const temporary = `${this.legacyBackup}.${randomUUID()}.tmp`;
    let handle;
    try {
      handle = await fs.open(temporary, 'wx', 0o600);
      await handle.writeFile(bytes); await handle.sync(); await handle.close(); handle = null;
      await fs.link(temporary,this.legacyBackup);
      await syncDirectory(path.dirname(this.legacyBackup));
    } catch (error) { if (error.code !== 'EEXIST') throw error; }
    finally { if (handle) await handle.close(); await fs.rm(temporary,{force:true}); }
  }
  mutate(route, data) {
    const action = async () => {
      if (!object(data)) throw new FormatterError('请求结构无效。');
      const state = await this.load();
      if (!Number.isSafeInteger(data.revision) || data.revision !== state.revision) throw new FormatterError('设置已被其他窗口更新，请关闭后重新打开。', 409);
      if (route === '/templates/select') {
        const item = state.templates.find(item => item.id === data.id);
        if (!item) throw new FormatterError('模板不存在。', 404);
        state.activeTemplateID = item.id; state.current = copy(item.config);
      } else if (route === '/templates/import') {
        const payload = data.payload;
        if (!object(payload) || payload.format !== 'wps-local-formatter-template' || payload.fileVersion !== 1) throw new FormatterError('模板文件格式或版本无效。');
        const config = this.normalize(payload.config), name = this.name(data.name ?? payload.name, state.templates);
        state.templates.push({ id: randomUUID(), name, config });
      } else if (route === '/settings/save' || route === '/templates') {
        const config = this.normalize(data.config);
        if (route === '/templates') {
          const name = this.name(data.name, state.templates), id = randomUUID();
          state.templates.push({ id, name, config: copy(config) }); state.activeTemplateID = id;
        }
        state.current = config;
      } else throw new FormatterError('未知设置操作。', 404);
      state.revision += 1;
      try { await this.preserveLegacy(); await this.write(this.file, jsonBytes(state)); }
      catch (error) { throw new FormatterError(`设置保存失败，原设置已保留：${error.message}`, 500); }
      return state;
    };
    const result = this.tail.then(action, action); this.tail = result.catch(() => {}); return result;
  }
  async export(data) {
    if (!object(data) || typeof data.id !== 'string' || (data.includeFurniture !== undefined && typeof data.includeFurniture !== 'boolean')) throw new FormatterError('导出请求无效。');
    const state = await this.load(), item = state.templates.find(item => item.id === data.id);
    if (!item) throw new FormatterError('模板不存在。', 404);
    const config = copy(item.config);
    if (data.includeFurniture !== true) for (const key of ['header', 'footer']) if (config.furniture?.[key]) { config.furniture[key].text = ''; config.furniture[key].enabled = false; }
    return { format: 'wps-local-formatter-template', fileVersion: 1, name: item.name, config: this.normalize(config) };
  }
}
