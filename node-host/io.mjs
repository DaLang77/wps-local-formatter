import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export class FormatterError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export async function readOptional(file) {
  try { return await fs.readFile(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
export async function syncDirectory(directory) {
  const handle = await fs.open(directory, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}
export async function atomicWrite(file, data, { mode = 0o600 } = {}) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}-${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await fs.open(temporary, 'wx', mode);
    await handle.writeFile(data); await handle.sync(); await handle.close(); handle = null;
    await fs.rename(temporary, file); await syncDirectory(path.dirname(file));
  } finally { if (handle) await handle.close(); await fs.rm(temporary, { force: true }); }
}
export async function restoreBytes(file, bytes) {
  if (bytes === null) { await fs.rm(file, { force: true }); return; }
  await atomicWrite(file, bytes);
}
export function jsonBytes(value) { return Buffer.from(`${JSON.stringify(value, null, 2)}\n`); }
export function object(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
export function copy(value) { return JSON.parse(JSON.stringify(value)); }
