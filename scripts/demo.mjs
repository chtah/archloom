// Record the real offline canvas; no synthetic animation frames or hosted services.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { renderAll, renderHtml } from '../dist/index.js';
import { createLucideResolver } from '../dist/icons/lucide.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'docs/archloom');
const preview = resolve(root, '.archloom/demo');
const frames = await mkdtemp(join(tmpdir(), 'archloom-demo-'));
await mkdir(output, { recursive: true });
await mkdir(preview, { recursive: true });
const example = JSON.parse(await readFile(resolve(root, 'examples/web-system.archloom.json'), 'utf8'));
const keys = { browser: 'lucide:monitor', api: 'lucide:server', database: 'lucide:database' };
const graph = { ...example, nodes: example.nodes.map(node => ({ ...node, icon: keys[node.id] })) };
const icons = await createLucideResolver();
const dark = renderAll(graph, { icons });
const light = renderAll(graph, { icons, theme: 'light' });
await writeFile(resolve(output, 'example.graph.json'), JSON.stringify(graph, null, 2) + '\n');
await writeFile(resolve(output, 'architecture.svg'), dark[0].svg);
await writeFile(resolve(output, 'architecture-light.svg'), light[0].svg);
await writeFile(resolve(output, 'flow.svg'), dark[1].svg);
await writeFile(resolve(output, 'NOTICE.txt'), 'Archloom demo artwork notices\n\n' + dark[0].notices.join('\n\n') + '\n');
const html = resolve(preview, 'index.html');
for (const diagram of dark) await writeFile(resolve(preview, `${diagram.id}.svg`), diagram.svg);
await writeFile(resolve(preview, 'atlas.json'), JSON.stringify({
  schemaVersion: '0.1.0', kind: 'atlas', graph,
  diagrams: dark.map(({ svg, ...diagram }) => ({ ...diagram, file: `${diagram.id}.svg` })),
}, null, 2) + '\n');
await writeFile(html, renderHtml(graph, { icons }));
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1200, height: 760 }, offline: true, reducedMotion: 'no-preference' });
const page = await context.newPage();
const requests = [], errors = [];
page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
page.on('pageerror', error => errors.push(error.message));
let frame = 0;
const hold = async count => {
  for (let i = 0; i < count; i++) {
    await page.screenshot({ path: join(frames, `${String(frame++).padStart(4, '0')}.png`) });
    await page.waitForTimeout(150);
  }
};
try {
  await page.goto(pathToFileURL(html).href);
  await page.locator('#drawing > svg').first().waitFor();
  await page.locator('#view-select').selectOption('flow-load-records');
  await page.screenshot({ path: resolve(output, 'canvas.png') });
  await hold(10);
  await page.locator('#view-select').selectOption('architecture');
  await hold(4);
  await page.locator('[data-kind="node"][data-id="api"]').click();
  assert.match(await page.locator('#detail-title').textContent(), /API/);
  await hold(8);
  await page.locator('#detail-close').click();
  await page.locator('[data-kind="line"][data-id="query"] .line-pill').click();
  assert.match(await page.locator('#detail-title').textContent(), /Read query/);
  await hold(8);
  await page.locator('#detail-close').click();
  await page.locator('#zoom-in').click();
  await hold(5);
  await page.locator('#fit').click();
  await page.locator('#theme-toggle').click();
  await hold(8);
  await page.locator('#view-select').selectOption('flow-load-records');
  await hold(10);
  await page.locator('#step-next').click();
  assert.match(await page.locator('#detail-title').textContent(), /GET \/records/);
  await hold(8);
  await page.locator('#step-next').click();
  assert.match(await page.locator('#detail-title').textContent(), /Read records/);
  await hold(8);
  await page.locator('#play-toggle').click();
  await hold(8);
  await page.locator('#theme-toggle').click();
  await hold(8);
  assert.deepEqual(requests, [], 'Recording must attempt no HTTP requests');
  assert.deepEqual(errors, [], 'Recording must have no client errors');
} finally {
  await context.close();
  await browser.close();
}
const result = spawnSync(process.env.FFMPEG_BIN ?? 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', '5', '-i', join(frames, '%04d.png'), '-filter_complex', '[0:v]split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3', '-loop', '0', resolve(output, 'demo.gif')], { encoding: 'utf8' });
if (result.status !== 0) throw new Error(result.stderr || String(result.error ?? 'ffmpeg failed'));
const gif = await stat(resolve(output, 'demo.gif'));
console.log(`Recorded ${frame} real Chrome frames; HTTP requests: 0. GIF: ${(gif.size / 1024 / 1024).toFixed(2)} MiB. Frames: ${frames}`);
console.log(`Open ${html} for the live offline demo.`);
