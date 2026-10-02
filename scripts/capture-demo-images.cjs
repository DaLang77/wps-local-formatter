#!/usr/bin/env node
'use strict';

// Optional documentation tool: use Playwright with Chromium or Chrome installed.
// All API data below is synthetic. Commands only return synthetic read results;
// this server never connects to WPS or reads/writes user settings or documents.
const http = require('node:http');
const fs = require('node:fs/promises');
const syncFs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const config = require('../addin/config.js');

const root = path.resolve(__dirname, '..');
const current = config.modernDefaults();
const state = {
  revision: 1,
  activeTemplateID: 'demo-default',
  templates: [{ id: 'demo-default', name: '合成示例模板', config: current }],
  current,
};
const fonts = ['华文中宋', '仿宋_GB2312', '宋体', '黑体', '楷体'];
const analysis = {
  docID: 'synthetic-notice', fingerprint: 'synthetic-no-document-content', scope: 'document',
  sessionInvalidated: false, message: '合成示例：展示段落识别和人工纠正控件，未连接真实文档。',
  paragraphs: [
    { index: 1, summary: '关于开展文书规范培训的通知', role: 'title', reason: '现有标题样式', eligible: true },
    { index: 2, summary: '各位同事：', role: 'addressee', reason: '人工指定', eligible: true },
    { index: 3, summary: '一、培训安排', role: 'heading1', reason: '大纲层级 1', eligible: true },
    { index: 4, summary: '请提前准备需要讨论的文书，培训结束后可保存自己的排版模板。', role: 'body', reason: '普通正文', eligible: true },
    { index: 5, summary: '1. 检查通知、合同及带附件文书中的标题与编号。', role: 'body', reason: '正文，保留列表编号和悬挂缩进', eligible: true },
    { index: 6, summary: '培训时间表', role: 'preserve', reason: '表格完全跳过', eligible: false },
    { index: 7, summary: '附件：培训议程', role: 'preserve', reason: '人工指定保持原样', eligible: true },
    { index: 8, summary: '示例工作组', role: 'signature', reason: '文末落款规则', eligible: true },
    { index: 9, summary: '2026年10月3日', role: 'signature', reason: '文末落款规则', eligible: true },
  ],
};
const environment = {
  server: { ok: true, version: '1.2.0-beta.1' },
  wps: { heartbeatFresh: true, apiReady: true, documentOpen: true, bridgeVersion: '1.2.0-beta.1', version: '示例', docID: analysis.docID, title: '合成通知示例', scope: 'document', sessionInvalidated: false },
  fonts: { ready: true, values: fonts, missing: [] },
  checks: [
    { id: 'registration', label: '插件注册', ok: true, state: 'ready', message: '合成示例：本地插件已登记。', action: '' },
    { id: 'synthetic', label: '图片示例', ok: true, state: 'ready', message: '此图使用只读合成数据，不能作为真实 WPS 连接或格式验收证据。', action: '' },
  ],
};
const resources = new Map();
for (const area of ['settings', 'structure', 'environment']) {
  for (const [suffix, type] of [['html', 'text/html'], ['css', 'text/css'], ['js', 'text/javascript']]) {
    resources.set(`/${area}.${suffix}`, [`${area}.${suffix}`, type]);
  }
}
resources.set('/config.js', ['config.js', 'text/javascript']);
const api = new Map([
  ['/session', { token: 'synthetic-demo-only' }], ['/settings', state], ['/fonts', { fonts }], ['/environment', environment],
]);
let lastResult = {}, sequence = 0;

async function main() {
  const output = path.join(root, 'docs', 'images');
  await fs.mkdir(output, { recursive: true });
  const server = http.createServer(async (req, res) => {
    function json(status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); }
    try {
      const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
      if (req.method === 'POST' && pathname === '/request') {
        let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 16384) { json(413, { error: 'Demo request too large' }); return; } }
        const command = JSON.parse(body);
        if (req.headers['x-formatter-token'] !== 'synthetic-demo-only' || command.docID !== analysis.docID || !['analyze', 'preview'].includes(command.op)) { json(405, { error: 'Read-only synthetic demo' }); return; }
        const id = ++sequence;
        lastResult = command.op === 'analyze' ? { id, ok: true, analysis } : { id, ok: true, preview: { docID: analysis.docID, scope: 'document', fingerprint: analysis.fingerprint, targetCount: 7, counts: { change: 5, skip: 2, unchanged: 2 }, warnings: [], rows: analysis.paragraphs.map(row => ({ ...row, selected: true, skip: row.role === 'preserve', change: row.role !== 'preserve' && row.index !== 8 && row.index !== 9 })) } };
        json(200, { id });
      } else if (req.method !== 'GET') {
        json(405, { error: 'Read-only synthetic demo' });
      } else if (pathname === '/state') {
        json(200, { result: lastResult });
      } else if (api.has(pathname)) {
        json(200, api.get(pathname));
      } else if (resources.has(pathname)) {
        const [file, type] = resources.get(pathname);
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
        res.end(await fs.readFile(path.join(root, 'addin', file)));
      } else {
        res.writeHead(404).end();
      }
    } catch { if (!res.headersSent) json(500, { error: 'Demo resource unavailable' }); else res.end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  let browser;
  try {
    const launch = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : syncFs.existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome') ? { channel: 'chrome' } : {};
    browser = await chromium.launch({ ...launch, headless: true });
    const page = await browser.newPage({ viewport: { width: 940, height: 1000 }, deviceScaleFactor: 1.5 });
    const errors = [];page.on('pageerror', error => errors.push(error.message));
    const origin = `http://127.0.0.1:${server.address().port}`;
    async function capture(file) { await page.evaluate(() => document.fonts.ready); await page.locator('main').screenshot({ path: path.join(output, file) }); console.log(`Created docs/images/${file}`); }
    await page.goto(`${origin}/settings.html`);await page.locator('#templateLabel').filter({ hasText: '合成示例模板' }).waitFor();
    for (const [area, file] of [['title', 'settings-title.png'], ['signature', 'settings-signature.png'], ['paragraph', 'settings-paragraph.png'], ['headings', 'settings-headings.png'], ['rules', 'settings-pagination.png']]) {
      await page.locator(`input[name="area"][value="${area}"]`).check();await page.locator(`#panel-${area}`).waitFor({ state: 'visible' });await capture(file);
    }
    await page.goto(`${origin}/structure.html`);await page.locator('#feedback').filter({ hasText: '合成示例' }).waitFor();await page.locator('#rowFilter').selectOption('all');await capture('structure.png');
    await page.goto(`${origin}/environment.html`);await page.locator('#feedback').filter({ hasText: '环境状态已更新' }).waitFor();await capture('environment.png');
    if (errors.length) throw new Error(errors.join('\n'));
  } finally { if (browser) await browser.close();await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
