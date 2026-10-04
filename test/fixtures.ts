import example from "../examples/web-system.archloom.json" with { type: "json" };
import { parseGraph } from "../src/graph.js";

export const webSystem = parseGraph(example);
