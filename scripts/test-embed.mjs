import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
const root = fileURLToPath(new URL('../', import.meta.url));
const work = await mkdtemp(join(tmpdir(), 'archloom-embed-'));
const graph = JSON.parse(await readFile(join(root, 'examples/web-system.archloom.json'), 'utf8'));
const entry = process.argv[2] ?? './dist/browser.js';
const bundle = await build({ stdin: { contents: `import {mountCanvas} from ${JSON.stringify(entry)}; globalThis.mountCanvas=mountCanvas;`, resolveDir: root }, bundle: true, platform: 'browser', format: 'iife', target: 'es2022', write: false });
const file = join(work, 'host.html');
await writeFile(file, '<!doctype html><html><head><style>body{margin:0;background:#fff}#one,#two{height:720px}#one{border:4px solid red}#two{border:4px solid green}</style></head><body><button id="host">Host control</button><div id="one">Placeholder</div><div id="two"></div></body></html>');
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1200, height: 850 }, offline: true, acceptDownloads: true });
const page = await context.newPage();
const requests = [], errors = [];
page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(pathToFileURL(file).href);
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const initial = await page.evaluate(graph => {
    try { mountCanvas(document.querySelector('#one'), {}); } catch (error) { if (error.code !== 'INVALID_GRAPH') throw error; }
    return document.querySelector('#one').textContent;
  }, graph);
  assert.equal(initial, 'Placeholder', 'failed initial rendering leaves host content untouched');
  await page.evaluate(graph => {
    globalThis.first = mountCanvas(document.querySelector('#one'), graph);
    globalThis.second = mountCanvas(document.querySelector('#two'), graph, { theme: 'light' });
  }, graph);
  const one = page.frameLocator('#one iframe'), two = page.frameLocator('#two iframe');
  await one.locator('#drawing > svg').first().waitFor();
  await two.locator('#drawing > svg').first().waitFor();
  assert.equal(await one.locator('html').getAttribute('data-theme'), 'dark');
  assert.equal(await two.locator('html').getAttribute('data-theme'), 'light');
  assert.equal(await page.locator('#one iframe').getAttribute('sandbox'), 'allow-scripts allow-downloads');
  await one.locator('[data-kind="node"][data-id="api"]').click();
  assert.equal(await one.locator('#details').isVisible(), true);
  assert.equal(await two.locator('#details').isVisible(), false, 'multiple mounted canvases have independent popups');
  await page.keyboard.press('Escape');
  assert.equal(await one.locator('#details').isVisible(), false);
  await page.evaluate(() => first.update({ title: 'Updated', lanes: [{ id: 'app', label: 'App' }], nodes: [{ id: 'worker', label: 'Worker', lane: 'app' }] }, { theme: 'light' }));
  await one.locator('#system-title').filter({ hasText: 'Updated' }).waitFor();
  assert.equal(await one.locator('html').getAttribute('data-theme'), 'light');
  const failure = await page.evaluate(() => {
    const frame = document.querySelector('#one iframe'), before = frame.srcdoc;
    let code; try { first.update({}); } catch (error) { code = error.code; }
    return { code, unchanged: frame.srcdoc === before };
  });
  assert.deepEqual(failure, { code: 'INVALID_GRAPH', unchanged: true });
  await page.evaluate(() => first.update({ title: 'Retained theme', lanes: [{ id: 'app', label: 'App' }], nodes: [{ id: 'worker', label: 'Worker', lane: 'app' }] }));
  await one.locator('#system-title').filter({ hasText: 'Retained theme' }).waitFor();
  assert.equal(await one.locator('html').getAttribute('data-theme'), 'light');
  const download = page.waitForEvent('download'); await one.locator('#download').click();
  assert.equal((await download).suggestedFilename(), 'architecture-light.svg');
  const tornDown = await page.evaluate(() => {
    first.destroy(); first.destroy();
    let code; try { first.update({}); } catch (error) { code = error.code; }
    return { code, ownedFrames: document.querySelectorAll('#one iframe').length, siblingFrames: document.querySelectorAll('#two iframe').length };
  });
  assert.deepEqual(tornDown, { code: 'INVALID_OPTIONS', ownedFrames: 0, siblingFrames: 1 });
  assert.deepEqual(requests, []);
  assert.deepEqual(errors, []);
  console.log('Browser embed checks passed: platform-browser bundle, initial/update validation safety, independent mounts/popups, theme retention, sandbox, download and idempotent cleanup; HTTP requests: 0.');
} finally { await context.close(); await browser.close(); }
