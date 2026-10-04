import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { webSystem } from "./fixtures.js";

const entry = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
let directory: string;
const run = (...args: string[]) => spawnSync(process.execPath, [entry, ...args], { cwd: directory, encoding: "utf8" });
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "archloom-cli-"));
  await writeFile(join(directory, "system.json"), JSON.stringify(webSystem));
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

describe("offline CLI", () => {
  it("runs when the entry point is an npm-style executable symlink", async () => {
    const linkedEntry = join(directory, "archloom");
    await symlink(entry, linkedEntry);
    const result = spawnSync(process.execPath, [linkedEntry, "validate", "system.json"], { cwd: directory, encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Valid graph:");
  });

  it("validates a graph and writes SVG and geometry outputs", async () => {
    expect(run("validate", "system.json").status).toBe(0);
    const rendered = run("render", "system.json");
    expect(rendered.stderr).toBe("");
    expect(rendered.status).toBe(0);
    expect((await readdir(join(directory, ".archloom"))).sort()).toEqual(["architecture.svg", "atlas.json", "flow-load-records.svg", "index.html"]);
    const atlas = JSON.parse(await readFile(join(directory, ".archloom", "atlas.json"), "utf8"));
    expect(atlas.graph).not.toHaveProperty("provenance");
    expect(atlas.diagrams[0].atlas.nodes.api.width).toBeGreaterThan(0);
    expect(atlas.diagrams[0]).not.toHaveProperty("svg");
    expect(await readFile(join(directory, ".archloom", "index.html"), "utf8")).toContain("Archloom");
  });

  it("refuses overwrite by default and only overwrites generated paths with --force", async () => {
    expect(run("render", "system.json").status).toBe(0);
    await writeFile(join(directory, ".archloom", "keep.txt"), "keep me");
    expect(run("render", "system.json").stderr).toContain("OUTPUT_EXISTS");
    expect(run("render", "system.json", "--force", "--theme", "light").status).toBe(0);
    expect(await readFile(join(directory, ".archloom", "keep.txt"), "utf8")).toBe("keep me");
  });

  it("rejects malformed JSON, oversized files, unknown commands and unsupported options", async () => {
    await writeFile(join(directory, "bad.json"), "{ broken");
    expect(run("validate", "bad.json").stderr).toContain("INVALID_GRAPH");
    await writeFile(join(directory, "large.json"), " ".repeat(4 * 1024 * 1024 + 1));
    expect(run("validate", "large.json").stderr).toContain("4 MiB");
    expect(run("analyze", "system.json").stderr).toContain("USAGE");
    expect(run("render", "system.json", "--push").stderr).toContain("USAGE");
    expect(run("render", "system.json", "--theme", "neutral").stderr).toContain("USAGE");
    expect(run("validate", "system.json", "--force").stderr).toContain("USAGE");
    expect(run("render", "system.json", "--out", "").stderr).toContain("USAGE");
    expect(run("--help").stdout).not.toContain("https://prlens.dev");
  });

  it("writes both themes for Markdown and prints only the snippet on stdout", async () => {
    const result = run("markdown", "system.json", "--out", "docs/architecture");
    expect(result.status).toBe(0);
    expect((await readdir(join(directory, "docs", "architecture"))).sort()).toEqual([
      "architecture.dark.svg", "architecture.light.svg", "flow-load-records.dark.svg", "flow-load-records.light.svg",
    ]);
    expect(result.stdout.match(/<picture>/g)).toHaveLength(2);
    expect(result.stdout).toContain('srcset="docs/architecture/architecture.dark.svg"');
    expect(result.stdout).toContain('src="docs/architecture/flow-load-records.light.svg"');
    expect(result.stdout).not.toContain("Wrote");
    expect(result.stderr).toContain("Wrote 4 SVGs");
    const based = run("markdown", "system.json", "--out", "docs/architecture", "--force", "--base", "../architecture");
    expect(based.stdout).toContain('src="../architecture/architecture.light.svg"');
  });

  it("defaults the Markdown output to the graph's directory and refuses overwrite without --force", async () => {
    await mkdir(join(directory, "docs"));
    await writeFile(join(directory, "docs", "system.archloom.json"), JSON.stringify(webSystem));
    const result = run("markdown", "docs/system.archloom.json");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('src="docs/architecture.light.svg"');
    expect((await readdir(join(directory, "docs"))).sort()).toContain("architecture.dark.svg");
    expect(run("markdown", "docs/system.archloom.json").stderr).toContain("OUTPUT_EXISTS");
    expect(run("markdown", "docs/system.archloom.json", "--force").status).toBe(0);
  });

  it("checks committed SVGs against a fresh render without writing", async () => {
    const missing = run("markdown", "system.json", "--out", "out", "--check");
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("STALE_OUTPUT");
    expect(missing.stderr).toContain("architecture.light.svg: missing");
    expect(missing.stdout).toBe("");
    await expect(readdir(join(directory, "out"))).rejects.toThrow();
    expect(run("markdown", "system.json", "--out", "out").status).toBe(0);
    const fresh = run("markdown", "system.json", "--out", "out", "--check");
    expect(fresh.status).toBe(0);
    expect(fresh.stdout).toBe("");
    await writeFile(join(directory, "system.json"), JSON.stringify({ ...webSystem, title: "Renamed system" }));
    const stale = run("markdown", "system.json", "--out", "out", "--check");
    expect(stale.status).toBe(1);
    expect(stale.stderr).toContain("architecture.dark.svg: differs from a fresh render");
  });

  it("rejects options that do not belong to the command", () => {
    expect(run("markdown", "system.json", "--theme", "dark").stderr).toContain("USAGE");
    expect(run("markdown", "system.json", "--check", "--force").stderr).toContain("USAGE");
    expect(run("render", "system.json", "--check").stderr).toContain("USAGE");
    expect(run("validate", "system.json", "--base", "x").stderr).toContain("USAGE");
    expect(run("markdown", "system.json", "--base", "my docs").stderr).toContain("INVALID_OPTIONS");
  });

  it.skipIf(process.platform === "win32")("rejects named FIFO inputs without waiting for a writer", async () => {
    const fifo = join(directory, "pipe.json");
    expect(spawnSync("mkfifo", [fifo]).status).toBe(0);
    const result = spawnSync(process.execPath, [entry, "validate", fifo], {
      cwd: directory, encoding: "utf8", timeout: 1500, killSignal: "SIGKILL",
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("input must be a regular JSON file");
  });

  it("will not overwrite an artifact symlink, even with --force", async () => {
    const target = join(directory, "keep.txt");
    await writeFile(target, "keep me");
    await symlink(target, join(directory, "architecture.svg"));
    const result = run("render", "system.json", "--out", directory, "--force");
    expect(result.status).toBe(1);
    expect(await readFile(target, "utf8")).toBe("keep me");
  });
});
