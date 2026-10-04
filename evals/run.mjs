#!/usr/bin/env node
// Prepares workspaces for a skill evaluation run and grades what the agent wrote.
// Needs a built checkout (pnpm build) and Node.js 22.18 or newer, which runs grade.ts directly.
import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGraph, ArchloomError } from '../dist/index.js';
import { grade } from './grade.ts';

const here = dirname(fileURLToPath(import.meta.url));
const loadCases = async () => {
  const names = (await readdir(join(here, 'cases'))).filter((name) => name.endsWith('.json')).sort();
  return Promise.all(names.map(async (name) => JSON.parse(await readFile(join(here, 'cases', name), 'utf8'))));
};
const findGraphs = async (directory) => {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true, recursive: true })) {
    const path = join(entry.parentPath, entry.name);
    if (entry.isFile() && entry.name.endsWith('.archloom.json') && !path.includes('node_modules')) found.push(path);
  }
  return found.sort();
};
const percent = (value) => `${Math.round(value * 100)}%`.padStart(4);

const [command, target] = process.argv.slice(2);
const cases = await loadCases();

if (command === 'list') {
  for (const definition of cases) console.log(`${definition.id}\n  ${definition.title}\n  ${definition.prompt}\n`);
} else if (command === 'prepare' && target !== undefined) {
  const run = resolve(target);
  const fail = (message) => { console.error(message); process.exit(2); };
  if (!relative(join(here, '..'), run).startsWith('..')) fail('choose a run directory outside the repository, so the agent cannot read the answer keys');
  if (existsSync(run)) fail(`${run} already exists; choose a new run directory`);
  for (const definition of cases) {
    const workspace = join(run, definition.id);
    if (definition.fixture === undefined) await mkdir(workspace, { recursive: true });
    else await cp(join(here, 'fixtures', definition.fixture), workspace, { recursive: true });
    await writeFile(join(workspace, 'PROMPT.txt'), `${definition.prompt}\n`, { flag: 'wx' });
  }
  console.log(`Prepared ${cases.length} workspaces in ${run}. Give each agent its PROMPT.txt, with its workspace as the working directory.`);
} else if (command === 'grade' && target !== undefined) {
  const run = resolve(target);
  const scores = [];
  for (const definition of cases) {
    const workspace = join(run, definition.id);
    const invalid = (reason) => scores.push({ case: definition.id, pass: false, failures: [reason] });
    let graphs;
    try { graphs = await findGraphs(workspace); } catch { invalid('no workspace'); continue; }
    if (graphs.length !== 1) { invalid(graphs.length === 0 ? 'no *.archloom.json file' : `expected one graph, found ${graphs.length}: ${graphs.map((path) => relative(workspace, path)).join(', ')}`); continue; }
    try { scores.push({ ...grade(definition, parseGraph(JSON.parse(await readFile(graphs[0], 'utf8')))), file: relative(workspace, graphs[0]) }); }
    catch (error) { invalid(error instanceof ArchloomError ? `graph does not validate: ${error.issues.map((issue) => `${issue.path} ${issue.message}`).join('; ') || error.message}` : 'graph is not valid JSON'); }
  }
  console.log('case            pass  nodes  components  edges  summaries  notes');
  for (const score of scores) {
    console.log(score.nodes === undefined
      ? `${score.case.padEnd(15)} no    ${score.failures[0]}`
      : `${score.case.padEnd(15)} ${score.pass ? 'yes' : 'no '}   ${String(score.nodes).padStart(5)}  ${percent(score.componentRecall).padStart(10)}  ${percent(score.edgeRecall).padStart(5)}  ${percent(score.summaryCoverage).padStart(9)}  ${percent(score.noteCoverage).padStart(5)}`);
    if (score.nodes !== undefined) for (const failure of score.failures) console.log(`  - ${failure}`);
  }
  const passed = scores.filter((score) => score.pass).length;
  console.log(`\n${passed} of ${scores.length} cases passed`);
  await writeFile(join(run, 'scores.json'), `${JSON.stringify(scores, null, 2)}\n`);
  process.exitCode = passed === scores.length ? 0 : 1;
} else {
  console.error('usage: node evals/run.mjs list | prepare <run-directory> | grade <run-directory>');
  process.exitCode = 2;
}
