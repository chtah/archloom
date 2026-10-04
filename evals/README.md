# Skill evaluations

These measure whether an agent using [`skills/archloom`](../skills/archloom/) reads a
codebase and writes a graph that is true to it. They are run by hand: this
repository calls no model, so CI tests only the grader.

## What is here

| Path | Contents |
| --- | --- |
| `fixtures/` | Small fictional codebases. `shop-update` also holds the diagram an update starts from. |
| `cases/` | One JSON file per case: the prompt and the answer key. |
| `grade.ts` | The grader. It compares a graph with an answer key; no model is involved. |
| `run.mjs` | Prepares workspaces and grades a finished run. |

| Case | What it tests |
| --- | --- |
| `shop` | Several services in Docker Compose, a queue and two outside providers. |
| `telemetry` | A workspace with a queue, object storage, two APIs and infrastructure code. |
| `notes` | One process with an in-process scheduled job: no worker or queue should appear. |
| `booking` | A disabled service, dead code, a test double, a retired directory and a README that is wrong. |
| `shop-update` | The code changed: update the existing graph, keep its IDs, add what is new, remove what is gone. |
| `described-web`, `described-jobs` | A system described in words, with no code to read. |

## Running

Use a built checkout (`pnpm build`) and Node.js 22.18 or newer.

```bash
node evals/run.mjs prepare /tmp/archloom-run     # outside the repository
```

For each directory in the run, start a new agent session with that directory as
its working directory, the skill under test installed, and no access to this
repository. Give it the text of `PROMPT.txt` and nothing else. Then:

```bash
node evals/run.mjs grade /tmp/archloom-run
```

The grader finds the one `*.archloom.json` in each workspace, prints a table and
writes `scores.json` to the run directory. It exits 1 unless every case passes.

A fresh session per case matters: an agent that has seen `cases/` or another
case's output is no longer being tested.

## What a case checks

- **Validity.** The graph passes `parseGraph`.
- **Components.** Every component in the key is a node. A node is recognised by
  the terms in its ID and label, so `orders-api` and "Backend API" both count as
  the API.
- **Connections.** At least 80% of the expected connections exist, in the right
  direction. Where a direction is a matter of convention, such as a worker and
  the queue it consumes, the key accepts either.
- **Nothing invented.** No node for a decoy in the key, no connection the key
  rules out, and at most one node the key cannot explain.
- **Size.** The node count is inside the case's range.
- **Updates.** The IDs of the existing graph are kept.
- **Flows.** At least one data-flow, where the prompt asks for one.

The table also reports the share of nodes with a summary and of flow messages
with a note. Those do not decide a pass.

## Limits

- Fixtures are small. A pass here does not show that the skill copes with a large
  repository; try it on a real project as well, and keep those results private.
- Matching is by name. A correct component with an unexpected name counts as
  unexplained; read the failure list before trusting a fail, and add the term to
  the key if the name is reasonable.
- The grader does not judge summaries, lane choice, flow correctness or how the
  diagram looks. Open the rendered canvas for that.
- One run is one sample. Agents vary between runs, so compare skill versions over
  several runs before drawing a conclusion.

## Results

Record each run here: the date, the skill version (commit), the agent and model,
and the pass count, with a note on any failure.

| Date | Skill | Agent | Passed | Notes |
| --- | --- | --- | --- | --- |
| 2026-10-04 | `48ac0ef` (0.2.0 skill) | Claude Code subagents, Claude Opus 5.5 | 6 of 7 | `notes` failed: 8 nodes for a one-process app; the scheduler, the digest function and a forecast client were drawn as nodes. |
| 2026-10-04 | 0.3.0 skill, with the codebase and sharing references | Claude Code subagents, Claude Opus 5.5 | 7 of 7 | `notes` passed with 5 nodes. One run per case; the agents were told nobody could answer questions. |

Both rows are single runs on small fixtures by one model. They show that the
rewrite fixed the over-splitting seen in `notes`; they do not show how either
version behaves on a large repository or with another agent.
