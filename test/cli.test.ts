import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile, readFile, readdir, rm, symlink } from "node:fs/promises";
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
