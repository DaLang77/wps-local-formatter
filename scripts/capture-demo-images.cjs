#!/usr/bin/env node
'use strict';

// Optional documentation tool: npm install --no-save playwright, with Chrome installed.
// Render the actual add-in pages against synthetic, read-only data.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const config = require('../addin/config.js');

const root = path.resolve(__dirname, '..');
const current = config.defaults();
const state = {
  revision: 1,
  activeTemplateID: 'demo-default',
  templates: [{ id: 'demo-default', name: '默认模板', config: current }],
  current,
};
const resources = new Map([
  ['/settings.html', ['settings.html', 'text/html']],
  ['/settings.css', ['settings.css', 'text/css']],
  ['/settings.js', ['settings.js', 'text/javascript']],
  ['/config.js', ['config.js', 'text/javascript']],
]);
const api = new Map([
  ['/session', { token: 'synthetic-demo-only' }],
  ['/settings', state],
  ['/fonts', { fonts: ['华文中宋', '仿宋_GB2312'] }],
]);

async function main() {
  const output = path.join(root, 'docs', 'images');
  await fs.mkdir(output, { recursive: true });
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
      if (req.method !== 'GET') {
        res.writeHead(405).end('Read-only demo');
      } else if (api.has(pathname)) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(api.get(pathname)));
      } else if (resources.has(pathname)) {
        const [file, type] = resources.get(pathname);
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
        res.end(await fs.readFile(path.join(root, 'addin', file)));
      } else {
        res.writeHead(404).end();
      }
    } catch {
      res.writeHead(500).end('Demo resource unavailable');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  let browser;
  try {
    const launch = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : { channel: 'chrome' };
    browser = await chromium.launch({ ...launch, headless: true });
    const page = await browser.newPage({ viewport: { width: 940, height: 1000 }, deviceScaleFactor: 1.5 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/settings.html`);
    await page.locator('#templateLabel').filter({ hasText: '默认模板' }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    const captures = [
      ['title', 'settings-title.png'],
      ['signature', 'settings-signature.png'],
      ['paragraph', 'settings-paragraph.png'],
    ];
    for (const [area, file] of captures) {
      await page.locator(`input[name="area"][value="${area}"]`).check();
      await page.locator(`#panel-${area}`).waitFor({ state: 'visible' });
      await page.locator('main').screenshot({ path: path.join(output, file) });
      console.log(`Created docs/images/${file}`);
    }
    if (errors.length) throw new Error(errors.join('\n'));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
