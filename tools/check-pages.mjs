// Exercise the production artifact as a static project site, without Beryllium.
import { chromium, expect } from '@playwright/test';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const staging = await mkdtemp(join(tmpdir(), 'discribe-pages-'));
let server;
let browser;
try {
  await cp('dist', join(staging, 'discribe'), { recursive: true });
  server = spawn(
    '.venv/bin/python',
    [
      '-u',
      '-c',
      `
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import sys
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(SimpleHTTPRequestHandler, directory=sys.argv[1]))
print(server.server_port, flush=True)
server.serve_forever()
`,
      staging,
    ],
    { stdio: ['ignore', 'pipe', 'ignore'] },
  );
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Static server did not start')), 10000);
    server.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    server.stdout.once('data', (data) => {
      clearTimeout(timer);
      resolve(Number(data.toString().trim()));
    });
  });
  browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(`http://127.0.0.1:${port}/discribe/`);
  await expect(page.locator('.bn-editor:visible')).toBeVisible();
  expect(
    await page.locator('.brand-logo-white').evaluate((el) => el.complete && el.naturalWidth > 0),
  ).toBeTruthy();
  await page.getByRole('button', { name: '⌘ Code', exact: true }).click();
  await page.getByRole('button', { name: 'Open hello.py', exact: true }).click();
  await expect(page.locator('#editor-loading')).toBeHidden();
  await expect(page.locator('.view-lines:visible')).toContainText('dataclass');
  await page.locator('.monaco-editor:visible textarea').focus();
  await page.keyboard.press('Control+Home');
  await page.keyboard.type('# Written on GitHub Pages\n');
  await page.keyboard.press('Control+s');
  await expect(page.locator('#save-state')).toHaveText('All changes saved');
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30000 })
    .toBeTruthy();
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(new URL(scope).pathname).toBe('/discribe/');
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.view-lines:visible')).toContainText('Written on GitHub Pages');
  await page.getByRole('button', { name: '✎ Write', exact: true }).click();
  await expect(page.locator('.bn-editor:visible')).toContainText('Written on GitHub Pages');
  expect(errors).toEqual([]);
  console.log(
    'Pages check passed: repository subpath, branding, both editors, persistence, and offline reload.',
  );
} finally {
  await browser?.close();
  server?.kill();
  await rm(staging, { recursive: true, force: true });
}
