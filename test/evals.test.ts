import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { grade, type Case } from "../evals/grade.js";
import { parseGraph, type GraphInput } from "../src/graph.js";

const cases = new Map<string, Case>();
for (const name of await readdir("evals/cases")) {
  const definition = JSON.parse(await readFile(join("evals/cases", name), "utf8")) as Case;
  cases.set(definition.id, definition);
}
const the = (id: string) => cases.get(id)!;

// A graph from "id:Label" nodes and "from>to" edges, with one flow so minFlows holds.
const graph = (nodes: string[], edges: string[], summaries = true) => {
  const parsed = nodes.map((node) => { const [id, label] = node.split(":"); return { id: id!, label: label ?? id! }; });
  const input: GraphInput = {
    title: "Answer", lanes: [{ id: "all", label: "All" }],
    nodes: parsed.map((node) => ({ ...node, lane: "all", ...(summaries ? { summary: "What it does." } : {}) })),
    edges: edges.map((edge, index) => { const [from, to] = edge.split(">"); return { id: `e${index}`, from: from!, to: to! }; }),
    flows: [{ id: "main", title: "Main", participants: [parsed[0]!.id, parsed[1]!.id], messages: [{ id: "one", from: parsed[0]!.id, to: parsed[1]!.id, label: "Go", note: "Why." }] }],
  };
  return parseGraph(input);
};

const shopNodes = ["web:Web storefront", "api:Orders API", "worker:Fulfilment worker", "pg:PostgreSQL", "redis:Redis queue", "paygate:PayGate", "mailhop:MailHop"];
const shopEdges = ["web>api", "api>pg", "api>paygate", "api>redis", "redis>worker", "worker>pg", "worker>mailhop"];

describe("skill evaluation cases", () => {
  it("are well formed and point at fixtures that exist", async () => {
    expect([...cases.keys()].sort()).toEqual(["booking", "described-jobs", "described-web", "notes", "shop", "shop-update", "telemetry"]);
    for (const definition of cases.values()) {
      const keys = new Set([...definition.components, ...(definition.optional ?? [])].map((component) => component.key));
      for (const edge of [...definition.edges, ...(definition.forbiddenEdges ?? [])])
        for (const key of [edge.from, edge.to].flat()) expect(keys.has(key), `${definition.id}: ${key}`).toBe(true);
      expect(definition.nodeRange[0]).toBeGreaterThanOrEqual(definition.components.length);
      if (definition.fixture !== undefined) expect((await stat(join("evals/fixtures", definition.fixture))).isDirectory()).toBe(true);
    }
  });

  it("keeps fixtures free of answer graphs, except the diagram an update case starts from", async () => {
    const graphs = (await readdir("evals/fixtures", { recursive: true })).filter((path) => path.endsWith(".archloom.json"));
    expect(graphs).toEqual([join("shop-update", the("shop-update").existing!)]);
  });
});

describe("grader", () => {
  it("passes a correct graph and accepts either direction only where the key allows it", () => {
    const score = grade(the("shop"), graph(shopNodes, shopEdges));
    expect(score).toMatchObject({ pass: true, failures: [], nodes: 7, componentRecall: 1, edgeRecall: 1, summaryCoverage: 1, noteCoverage: 1 });
    expect(grade(the("shop"), graph(shopNodes, shopEdges.map((edge) => (edge === "redis>worker" ? "worker>redis" : edge)))).pass).toBe(true);
    const reversed = grade(the("shop"), graph(shopNodes, shopEdges.map((edge) => (edge === "web>api" ? "api>web" : edge))));
    expect(reversed.missingEdges).toEqual(["web -> api"]);
    expect(reversed.pass).toBe(true); // six of seven connections is above the required share
  });

  it("fails on a missing component, too few connections, an extra connection and a wrong size", () => {
    const missing = grade(the("shop"), graph(shopNodes.slice(0, 6), shopEdges.slice(0, 6)));
    expect(missing.pass).toBe(false);
    expect(missing.missingComponents).toEqual(["mailhop"]);
    expect(grade(the("shop"), graph(shopNodes, shopEdges.slice(0, 4))).failures.join()).toContain("missing connections");
    expect(grade(the("shop"), graph(shopNodes, [...shopEdges, "web>pg"])).forbiddenEdges).toEqual(["web -> postgres|redis|paygate"]);
    const padded = grade(the("shop"), graph([...shopNodes, "auth:Auth", "cdn:CDN", "logs:Logging"], shopEdges));
    expect(padded.unexplained).toEqual(["auth", "cdn", "logs"]);
    expect(padded.failures.join()).toContain("10 nodes, expected 7-9");
    expect(grade(the("shop"), graph(shopNodes, shopEdges, false)).summaryCoverage).toBe(0);
  });

  it("names a node by the first component it matches, so a provider's API is not the system's API", () => {
    const score = grade(the("booking"), graph(["site:nginx site", "api:Booking API", "db:PostgreSQL", "cardly:Cardly API"], ["site>api", "api>db", "api>cardly"]));
    expect(score.pass).toBe(true);
  });

  it("fails every decoy in the booking fixture", () => {
    const base = ["site:nginx site", "api:Booking API", "db:PostgreSQL", "cardly:Cardly"];
    const edges = ["site>api", "api>db", "api>cardly"];
    for (const decoy of ["search:Elasticsearch", "kafka:Kafka", "sms:Textwave SMS", "soap:SOAP gateway", "fake:Fake Cardly"]) {
      const score = grade(the("booking"), graph([...base, decoy], edges));
      expect(score.pass, decoy).toBe(false);
      expect(score.forbidden, decoy).toHaveLength(1);
    }
  });

  it("requires an update to keep IDs, add what is new and drop what is gone", async () => {
    const update = the("shop-update");
    const existing = parseGraph(JSON.parse(await readFile(join("evals/fixtures/shop-update", update.existing!), "utf8")));
    const untouched = grade(update, existing);
    expect(untouched.pass).toBe(false);
    expect(untouched.missingComponents).toEqual(["notifier"]);
    expect(untouched.forbidden).toHaveLength(1);
    expect(untouched.forbiddenEdges).toEqual(["worker -> mailhop"]);

    const nodes = ["storefront:Web storefront", "orders-api:API", "fulfilment-worker:Worker", "shop-db:PostgreSQL", "order-queue:Redis queue", "email-provider:MailHop", "notifier:Notifier"];
    const edges = ["storefront>orders-api", "orders-api>shop-db", "orders-api>order-queue", "order-queue>fulfilment-worker", "fulfilment-worker>shop-db", "fulfilment-worker>notifier", "notifier>email-provider"];
    expect(grade(update, graph(nodes, edges)).pass).toBe(true);
    const renamed = grade(update, graph(nodes.map((node) => node.replace("orders-api:", "api:")), edges.map((edge) => edge.replace(/orders-api/g, "api"))));
    expect(renamed.lostIds).toEqual(["orders-api"]);
    expect(renamed.pass).toBe(false);
  });

  it("has a passing answer for every remaining case", () => {
    expect(grade(the("telemetry"), graph(
      ["dashboard:Dashboard", "query:Query API", "ingest:Ingest API", "aggregator:Aggregator", "queue:Batch queue", "bucket:Raw readings bucket", "tsdb:Timeseries database", "devices:Devices"],
      ["devices>ingest", "dashboard>query", "query>tsdb", "ingest>bucket", "ingest>queue", "queue>aggregator", "aggregator>bucket", "aggregator>tsdb"])).pass).toBe(true);
    expect(grade(the("notes"), graph(
      ["app:Trail Notes app", "sqlite:SQLite", "skycast:SkyCast", "postbird:Postbird", "digest:Morning digest job"],
      ["app>sqlite", "app>skycast", "digest>skycast", "digest>postbird", "digest>sqlite"])).pass).toBe(true);
    expect(grade(the("notes"), graph(["app:App", "sqlite:SQLite", "skycast:SkyCast", "postbird:Postbird", "worker:Digest worker"], ["app>sqlite", "app>skycast", "app>postbird"])).pass).toBe(false);
    expect(grade(the("described-web"), graph(["browser:Browser", "api:API", "database:Database"], ["browser>api", "api>database"])).pass).toBe(true);
    expect(grade(the("described-jobs"), graph(["scheduler:Scheduler", "queue:Queue", "worker:Worker", "store:Object Store"], ["scheduler>queue", "queue>worker", "worker>store"])).pass).toBe(true);
  });
});
