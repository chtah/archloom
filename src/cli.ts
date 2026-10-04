#!/usr/bin/env node
import { constants, realpathSync } from "node:fs";
import { mkdir, open, lstat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import packageInfo from "../package.json" with { type: "json" };
import { ArchloomError } from "./errors.js";
import { parseGraph, ThemeSchema } from "./graph.js";
import { renderAll } from "./render.js";
import { combineIconResolvers, type IconResolver } from "./icons.js";
import { renderHtml } from "./viewer.js";

const MAX_INPUT_BYTES = 4 * 1024 * 1024;
const HELP = `Archloom — local architecture and data-flow diagrams

Usage:
  archloom validate <graph.json>
  archloom render <graph.json> [--out <directory>] [--theme dark|light] [--icons lucide|simple-icons|both] [--force]
  archloom --help
  archloom --version

Render writes one SVG per view, atlas.json and an offline index.html canvas.
Default directory: .archloom. Open index.html directly in a browser.
No graph uploads, model providers, or PR integrations.
Icon packs are optional local peer packages; nothing is downloaded automatically.
--force overwrites generated files only; it never deletes the output directory.
`;
// Control, bidirectional and invisible format characters could disguise terminal output.
const clean = (text: string): string => text.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, "");
const RESERVED_NAME = /^(?:con|prn|aux|nul|com\d|lpt\d)\./i;

const readGraph = async (fileName: string) => {
  // Reject FIFOs before an open can wait indefinitely for a writer.
  const file = await open(fileName, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    if (!(await file.stat()).isFile()) throw new ArchloomError("INVALID_GRAPH", "input must be a regular JSON file");
    const buffer = Buffer.alloc(MAX_INPUT_BYTES + 1);
    let size = 0;
    while (size < buffer.length) {
      const chunk = await file.read(buffer, size, buffer.length - size, size);
      if (chunk.bytesRead === 0) break;
      size += chunk.bytesRead;
    }
    if (size > MAX_INPUT_BYTES) throw new ArchloomError("INVALID_GRAPH", "input exceeds the 4 MiB limit");
    let input: unknown;
    try { input = JSON.parse(buffer.subarray(0, size).toString("utf8")); }
    catch { throw new ArchloomError("INVALID_GRAPH", "input is not valid JSON"); }
    return parseGraph(input);
  } finally { await file.close(); }
};

const loadIcons = async (value: unknown): Promise<IconResolver | undefined> => {
  if (value === undefined) return undefined;
  if (value !== "lucide" && value !== "simple-icons" && value !== "both")
    throw new ArchloomError("USAGE", "--icons must be lucide, simple-icons or both");
  const resolvers: IconResolver[] = [];
  if (value === "lucide" || value === "both") {
    try { const { createLucideResolver } = await import("./icons/lucide.js"); resolvers.push(await createLucideResolver()); }
    catch { throw new ArchloomError("UNKNOWN_ICON", "Lucide adapter unavailable; install the optional lucide peer or omit --icons"); }
  }
  if (value === "simple-icons" || value === "both") {
    try { const { createSimpleIconsResolver } = await import("./icons/simple-icons.js"); resolvers.push(await createSimpleIconsResolver()); }
    catch { throw new ArchloomError("UNKNOWN_ICON", "Simple Icons adapter unavailable; install the optional simple-icons peer or omit --icons"); }
  }
  return combineIconResolvers(...resolvers);
};

const existing = async (path: string) => {
  try { return await lstat(path); }
  catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
};

export const main = async (args: string[]): Promise<number> => {
  try {
    let parsed: ReturnType<typeof parseArgs>;
    try {
      parsed = parseArgs({ args, allowPositionals: true, strict: true, options: {
        out: { type: "string", short: "o" }, theme: { type: "string" }, icons: { type: "string" }, force: { type: "boolean" },
        help: { type: "boolean", short: "h" }, version: { type: "boolean", short: "v" },
      } });
    } catch (error) {
      throw new ArchloomError("USAGE", error instanceof Error ? error.message : "invalid arguments");
    }
    const { positionals, values } = parsed;
    if (values.help === true) { process.stdout.write(HELP); return 0; }
    if (values.version === true) { process.stdout.write(`${packageInfo.version}\n`); return 0; }
    const [command, fileName] = positionals;
    if ((command !== "validate" && command !== "render") || fileName === undefined || positionals.length !== 2)
      throw new ArchloomError("USAGE", "use 'validate <graph.json>' or 'render <graph.json>'; see --help");
    if (command === "validate" && (values.out !== undefined || values.theme !== undefined || values.icons !== undefined || values.force !== undefined))
      throw new ArchloomError("USAGE", "render options do not apply to validate");
    const theme = ThemeSchema.safeParse(values.theme ?? "dark");
    if (!theme.success) throw new ArchloomError("USAGE", "--theme must be dark or light");
    const graph = await readGraph(resolve(fileName));
    if (command === "validate") {
      process.stdout.write(`Valid graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${graph.flows.length} flows\n`);
      return 0;
    }
    if (values.out === "") throw new ArchloomError("USAGE", "--out must name a directory");
    const out = resolve(typeof values.out === "string" ? values.out : ".archloom");
    const directory = await existing(out);
    if (directory !== undefined && !directory.isDirectory()) throw new ArchloomError("IO_ERROR", "output must be a directory, not a file or symlink");
    const icons = await loadIcons(values.icons);
    const diagrams = renderAll(graph, { theme: theme.data, icons });
    const artifacts = diagrams.map((diagram) => ({ name: `${diagram.id}.svg`, content: diagram.svg }));
    const atlas = {
      schemaVersion: "0.1.0", kind: "atlas", graph,
      diagrams: diagrams.map(({ svg: _svg, ...diagram }) => ({ ...diagram, file: `${diagram.id}.svg` })),
    };
    artifacts.push({ name: "atlas.json", content: `${JSON.stringify(atlas, null, 2)}\n` });
    artifacts.push({ name: "index.html", content: renderHtml(graph, { theme: theme.data, icons }) });
    for (const artifact of artifacts) {
      if (RESERVED_NAME.test(artifact.name)) throw new ArchloomError("IO_ERROR", "a view ID is a reserved device name on Windows; rename the view");
      const path = join(out, artifact.name);
      const found = await existing(path);
      if (found === undefined) continue;
      if (!found.isFile()) throw new ArchloomError("IO_ERROR", "refusing to overwrite a symlink or non-file artifact");
      if (values.force !== true) throw new ArchloomError("OUTPUT_EXISTS", "output exists; choose another directory or use --force");
    }
    await mkdir(out, { recursive: true });
    // The checks above can race a swapped-in symlink; never write through one.
    const flags = constants.O_WRONLY | constants.O_CREAT | (constants.O_NOFOLLOW ?? 0) | (values.force === true ? constants.O_TRUNC : constants.O_EXCL);
    for (const artifact of artifacts) {
      const file = await open(join(out, artifact.name), flags, 0o666);
      try { await file.writeFile(artifact.content); } finally { await file.close(); }
    }
    process.stdout.write(`Rendered ${diagrams.length} SVGs, atlas.json and index.html to ${JSON.stringify(out)}\n`);
    return 0;
  } catch (error) {
    const failure = error instanceof ArchloomError ? error : new ArchloomError("IO_ERROR", error instanceof Error ? error.message : "operation failed");
    process.stderr.write(`${failure.code}: ${clean(failure.message)}\n`);
    for (const issue of failure.issues) process.stderr.write(`  ${clean(issue.path) || "graph"}: ${clean(issue.message)}\n`);
    return 1;
  }
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href)
  void main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
