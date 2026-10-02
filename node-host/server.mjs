import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { SettingsStore } from './store.mjs';
import { FormatterError, copy, object, readOptional } from './io.mjs';
import { DOMParser } from '@xmldom/xmldom';

export const VERSION = '1.2.0-beta.1';
export const STATIC_FILES = new Set(['index.html','furniture.js','core.js','main.js','ribbon.xml','manifest.xml','config.js','settings.html','settings.js','settings.css','result.html','result.js','result.css','structure.html','structure.js','structure.css','environment.html','environment.js','environment.css','icons/format.svg','icons/settings.svg','icons/result.svg']);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const operations = new Set(['analyze','preview','extract','set-role','scope','format']);
const diagnostics = new Set(['inspect','undo','probe']);
function validToken(value, expected) {
  if (typeof value !== 'string') return false;
  const a = Buffer.from(value), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
function string(value, field, maximum = 512) {
  if (typeof value !== 'string' || !value || value.length > maximum || /[\x00-\x1f\x7f]/.test(value)) throw new FormatterError(`${field} 无效。`);
  return value;
}
async function readJSON(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) throw new FormatterError('请求必须是 JSON。');
  const length = request.headers['content-length'];
  if (request.headers['transfer-encoding'] !== undefined || !/^\d+$/.test(length || '') || Number(length) > 3_900_000) throw new FormatterError('请求长度无效。', 413);
  let bytes = 0; const chunks = [];
  for await (const chunk of request) { bytes += chunk.length; if (bytes > 3_900_000) throw new FormatterError('请求过大。', 413); chunks.push(chunk); }
  if (bytes !== Number(length)) throw new FormatterError('请求长度不完整。');
  let data; try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new FormatterError('JSON 无效。'); }
  if (!object(data)) throw new FormatterError('请求结构无效。');
  return data;
}

export function createHost({ staticDir = fileURLToPath(new URL('../addin/', import.meta.url)), settingsPath, configModule, port = 38941, host = '127.0.0.1', diagnostics: diagnosticMode = false, clock = Date.now, buildID = VERSION, registrationPath = path.join(os.homedir(),'Library/Containers/com.kingsoft.wpsoffice.mac/Data/.kingsoft/wps/jsaddons/publish.xml'), store: suppliedStore } = {}) {
  if (host !== '127.0.0.1') throw new Error('服务只能绑定 127.0.0.1。');
  const store = suppliedStore || new SettingsStore({ file: settingsPath, configModule });
  const token = randomBytes(32).toString('hex'), started = clock();
  const state = { latest: {}, lastPulse: null, pending: null, pendingAt: null, busy: '', result: {} };
  let boundPort = port;
  function refresh() {
    if (state.pending && clock() - state.pendingAt > 10_000) {
      state.result = { id: state.busy, ok: false, message: 'WPS 未领取操作，请检查连接后重新发起。', expired: true };
      state.pending = null; state.busy = '';
    }
  }
  function status() {
    const age = state.lastPulse === null ? null : Math.max(0, clock() - state.lastPulse), fresh = age !== null && age < 4_000;
    return { ...state.latest, connected: fresh, heartbeatFresh: fresh, heartbeatAgeMs: age, apiReady: fresh && state.latest.apiReady === true, documentOpen: fresh && state.latest.apiReady === true && state.latest.documentOpen === true, fonts: Array.isArray(state.latest.fonts) ? copy(state.latest.fonts) : null, bridgeVersion: typeof state.latest.bridgeVersion === 'string' ? state.latest.bridgeVersion : null };
  }
  async function environment() {
    const s = status(), settings = await store.load();
    const requested = new Set();
    function collect(value) { if (Array.isArray(value)) { value.forEach(collect); return; } if (!object(value) || value.enabled === false) return; for (const [key, child] of Object.entries(value)) { if (key === 'font' && typeof child === 'string') requested.add(child); else collect(child); } }
    collect(settings.current);
    const values = s.fonts, missing = values === null ? null : [...requested].filter(font => !values.includes(font));
    const versionMatches = s.bridgeVersion === VERSION;
    let registered = false, registrationError = null;
    try {
      const bytes = await readOptional(registrationPath);
      if (bytes !== null) {
        const text = bytes.toString('utf8');
        if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('注册文件包含未知声明。');
        const document = new DOMParser({onError(){throw new Error('注册 XML 无效。');}}).parseFromString(text,'application/xml');
        if (document.documentElement?.nodeName !== 'jsplugins') throw new Error('注册文件结构未知。');
        registered = [...document.documentElement.childNodes].some(entry => entry.nodeType === 1 && entry.nodeName === 'jspluginonline' && entry.getAttribute('name') === 'local-wps-formatter' && entry.getAttribute('url') === 'http://127.0.0.1:38941/' && entry.getAttribute('enable') === 'enable_dev');
      }
    } catch (error) { registered = null; registrationError = error.message; }
    const checks = [
      { id: 'server', label: '本地服务', ok: true, state: 'ready', message: `版本 ${VERSION}`, action: '' },
      { id: 'registration', label: '插件注册', ok: registered === true, state: registered === true ? 'ready' : 'blocked', message: registered === true ? '已登记本地插件。' : registrationError || '尚未登记本地插件，请退出 WPS 后初始化。', action: '退出 WPS 后初始化' },
      { id: 'heartbeat', label: 'WPS 连接', ok: s.heartbeatFresh, state: s.heartbeatFresh ? 'ready' : 'waiting', message: s.heartbeatFresh ? '已收到 WPS 心跳。' : '请重新打开 WPS，并打开文档。', action: '重新打开 WPS' },
      { id: 'api', label: '文档接口', ok: s.apiReady, state: s.apiReady ? 'ready' : 'waiting', message: s.apiReady ? 'WPS 文档接口已就绪。' : '等待 WPS 加载插件。', action: '重新打开 WPS' },
      { id: 'bridge-version', label: '插件版本', ok: s.heartbeatFresh && versionMatches, state: s.heartbeatFresh ? (versionMatches ? 'ready' : 'blocked') : 'waiting', message: s.heartbeatFresh ? (versionMatches ? `插件版本 ${VERSION}` : `插件版本不一致（${s.bridgeVersion || '未知'}），请退出并重新打开 WPS。`) : '等待插件报告版本。', action: '退出并重新打开 WPS' },
      { id: 'document', label: '当前文档', ok: s.documentOpen && !s.readOnly, state: s.documentOpen ? (s.readOnly ? 'blocked' : 'ready') : 'waiting', message: s.documentOpen ? (s.readOnly ? '当前文档只读。' : s.title || '文档已打开。') : '请打开 Word 文档。', action: '打开可编辑文档' },
      { id: 'fonts', label: '所需字体', ok: s.apiReady && values !== null && missing.length === 0, state: !s.apiReady || values === null ? 'waiting' : missing.length ? 'blocked' : 'ready', message: !s.apiReady || values === null ? '等待 WPS 返回实际字体列表。' : missing.length ? `缺少：${missing.join('、')}` : '当前设置所需字体已识别。', action: s.apiReady && values !== null && missing.length ? '安装缺失字体后重开 WPS' : '' }
    ];
    return { server: { ok: true, version: VERSION, buildID, uptimeMs: Math.max(0, clock() - started) }, registration:{registered,error:registrationError}, wps: { heartbeatFresh: s.heartbeatFresh, heartbeatAgeMs: s.heartbeatAgeMs, apiReady: s.apiReady, documentOpen: s.documentOpen, bridgeVersion: s.bridgeVersion, versionMatches, version: state.latest.version || null, title: s.title || null, docID: s.docID || null, readOnly: !!s.readOnly, scope: s.scope ?? null, sessionInvalidated: s.sessionInvalidated ?? null }, fonts: { ready: s.apiReady && values !== null, values, missing }, checks };
  }
  async function enqueue(data) {
    refresh(); const s = status(), op = data.op ?? 'format';
    if (!operations.has(op) && !(diagnosticMode && diagnostics.has(op))) throw new FormatterError('未知或未授权的操作。');
    if (!s.heartbeatFresh || !s.apiReady) throw new FormatterError('WPS 尚未连接或文档接口未就绪，请重新打开 WPS。', 409);
    if (s.bridgeVersion !== VERSION) throw new FormatterError('插件版本与本地服务不一致，请退出并重新打开 WPS。', 409);
    if (state.busy) throw new FormatterError('已有操作正在处理，请等待结果。', 409);
    if (!s.documentOpen || !s.docID) throw new FormatterError('请先打开 Word 文档。', 409);
    const docID = string(data.docID, '文档标识', 100);
    if (docID !== String(s.docID)) throw new FormatterError('当前文档已经切换，未开始操作。', 409);
    if (['format','set-role','undo','probe'].includes(op) && s.readOnly) throw new FormatterError('当前文档只读，请先保存可编辑副本。', 409);
    if (diagnostics.has(op) && !/^WPS排版.*\.docx$/.test(s.title || '')) throw new FormatterError('诊断仅允许本项目测试文档。', 409);
    const command = { id: randomUUID(), op, docID };
    if (data.config !== undefined) command.config = store.normalize(data.config);
    else if (data.count !== undefined && op === 'format') { if (!Number.isInteger(data.count) || data.count < 0 || data.count > 99) throw new FormatterError('落款段数无效。'); command.count = data.count; command.config = store.normalize(data.count); }
    else if (['format','preview','analyze','set-role'].includes(op)) command.config = (await store.load()).current;
    if (data.scope !== undefined) command.scope = string(data.scope, '操作范围', 100);
    if (data.fingerprint !== undefined) command.fingerprint = string(data.fingerprint, '文档指纹', 1024);
    if (data.index !== undefined) { if (!Number.isSafeInteger(data.index) || data.index < 1) throw new FormatterError('段落序号无效。'); command.index = data.index; }
    if (data.role !== undefined) command.role = string(data.role, '段落角色', 100);
    if (op === 'set-role' && (command.index === undefined || command.role === undefined || command.fingerprint === undefined)) throw new FormatterError('缺少段落序号、角色或文档指纹。');
    if (diagnostics.has(op)) command.diagnostic = true;
    state.busy = command.id; state.pending = command; state.pendingAt = clock();
    return { id: command.id };
  }
  const server = http.createServer({ maxHeaderSize: 16_384, requestTimeout: 10_000, headersTimeout: 10_000 }, async (request, response) => {
    const send = (code, value, type = 'application/json; charset=utf-8') => {
      if (response.destroyed || response.writableEnded) return;
      const bytes = Buffer.isBuffer(value) ? value : type.startsWith('application/json') ? Buffer.from(JSON.stringify(value)) : Buffer.from(String(value));
      response.writeHead(code, { 'Content-Type': type, 'Content-Length': bytes.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',...(code>=400?{'Connection':'close'}:{}) }); response.end(bytes);
    };
    try {
      const authority = `127.0.0.1:${boundPort}`, origin = `http://${authority}`;
      const count = key => request.rawHeaders.filter((_, i) => i % 2 === 0 && request.rawHeaders[i].toLowerCase() === key).length;
      if (request.headers.host !== authority || count('host') !== 1 || count('origin') > 1 || count('x-formatter-token') > 1 || (request.headers.origin !== undefined && request.headers.origin !== origin)) throw new FormatterError('请求来源无效。', 403);
      const declared = request.headers['content-length'];
      if (request.headers['transfer-encoding'] !== undefined || (declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) > 3_900_000))) throw new FormatterError('请求长度无效。',413);
      if (request.method === 'GET' && Number(declared || 0) > 0) throw new FormatterError('GET 请求不能包含正文。');
      if (!request.url?.startsWith('/') || request.url.includes('?') || request.url.includes('#')) throw new FormatterError('路径无效。', 404);
      const route = request.url;
      if (request.method === 'GET') {
        const file = route === '/' ? 'index.html' : route.slice(1);
        if (STATIC_FILES.has(file)) { const bytes = await readOptional(path.join(staticDir, file)); if (bytes === null) throw new FormatterError('文件不存在。', 404); send(200, bytes, mime[path.extname(file)] || 'application/octet-stream'); return; }
        if (route === '/session') { send(200, { token }); return; }
        if (route === '/build-id') { send(200, buildID, 'text/plain; charset=utf-8'); return; }
      }
      if (!validToken(request.headers['x-formatter-token'], token)) throw new FormatterError('invalid token', 403);
      refresh();
      if (request.method === 'GET') {
        if (route === '/settings') send(200, await store.load());
        else if (route === '/fonts') send(200, { fonts: status().fonts });
        else if (route === '/state') send(200, { status: status(), busy: state.busy, busyID: state.busy, resultID: state.result.id || '', result: state.result });
        else if (route === '/environment') send(200, await environment());
        else throw new FormatterError('not found', 404);
        return;
      }
      if (request.method !== 'POST') throw new FormatterError('不支持的请求方法。', 405);
      const data = await readJSON(request);
      if (['/settings/save','/templates','/templates/select','/templates/import'].includes(route)) send(200, await store.mutate(route, data));
      else if (route === '/templates/export') send(200, await store.export(data));
      else if (route === '/request') send(200, await enqueue(data));
      else if (route === '/poll') {
        const clean = {};
        for (const key of ['docID','title','readOnly','apiReady','documentOpen','bridgeVersion','version','scope','sessionInvalidated']) if (data[key] !== undefined) clean[key] = data[key];
        clean.apiReady = data.apiReady === true; clean.documentOpen = data.documentOpen === true;
        clean.fonts = Array.isArray(data.fonts) && data.fonts.length <= 10000 && data.fonts.every(font => typeof font === 'string' && font.length <= 200) ? [...new Set(data.fonts)] : null;
        state.latest = clean; state.lastPulse = clock();
        if (state.pending && (clean.bridgeVersion !== VERSION || !clean.apiReady || !clean.documentOpen || String(clean.docID) !== state.pending.docID)) {
          state.result = {id:state.busy,ok:false,message:'WPS 插件或当前文档已经切换，未开始操作。'};state.pending=null;state.busy='';send(200,{});
        }
        else if (state.pending) { const command = state.pending; state.pending = null; send(200, { command }); }
        else send(200, {});
      } else if (route === '/result') {
        if (typeof data.id !== 'string' || !state.busy || data.id !== state.busy || state.pending !== null) throw new FormatterError('stale result', 409);
        state.result = copy(data); state.busy = ''; state.pending = null; send(200, { accepted: true });
      } else if (route === '/ui-result') { state.result = copy(data); send(200, { accepted: true }); }
      else throw new FormatterError('not found', 404);
    } catch (error) { send(error.status || 500, { error: error.status ? error.message : '本地服务操作失败，请检查文件权限或设置文件。' }); }
  });
  server.on('clientError', (_, socket) => { if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); });
  return { server,
    async start() { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, () => { server.off('error', reject); boundPort = server.address().port; resolve(); }); }); return { host, port: boundPort, token }; },
    async close() { server.closeIdleConnections(); await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  };
}
