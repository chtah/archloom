# Reading a codebase for its architecture

The aim is the set of things that run and how they talk, backed by files. Work
in this order and stop when new files stop changing the picture.

## Where to look, most reliable first

1. **What declares the running system.** `compose.yaml`, Kubernetes manifests and
   Helm charts, Terraform or other infrastructure code, serverless and platform
   configuration, `Procfile`, CI deploy steps. These list services, datastores,
   queues and buckets, and often their connections through environment
   variables such as `DATABASE_URL`.
2. **What declares the code units.** Workspace manifests (`pnpm-workspace.yaml`,
   `Cargo.toml` workspaces, `go.work`), per-app manifests and Dockerfiles, and
   each app's entry point.
3. **What each unit calls.** In each entry point and the modules it imports:
   HTTP and RPC clients, database drivers and queries, queue producers and
   consumers, object storage clients, SDKs for outside providers. Search for the
   environment variables found in step 1 to see who uses them.
4. **Prose last.** READMEs, comments and architecture notes tell you where to
   look. Confirm each claim in code or configuration before drawing it.

## What becomes a node

| Evidence | Node |
| --- | --- |
| A service that is built, deployed or started | One node, kind `service`, `app`, `job` or `ui` |
| A database, cache or object store that is provisioned or connected to | One node per instance, kind `datastore` or `cache` |
| A queue, topic or stream that is provisioned or used | One node, kind `queue` |
| An outside provider reached over the network | One node, kind `external` |
| A browser, device or other caller the code clearly serves | Optional node at the edge, kind `ui` or `external` |

A library, a shared types package, a module, a route file, a scheduler running
inside a service, or a client class wrapping a provider is part of the node that
contains it. Mention it in that node's summary.

Name a node after what it is in this system (`orders-api`, `raw-readings
bucket`). When one product plays one role, such as Redis used only as a job
queue, draw the role once and name the product in the label or summary.

## What does not become a node

Check each candidate against these before drawing it:

- **Disabled or commented out.** A service commented out in a Compose file, a
  resource behind a flag that is off, a route that is never registered.
- **Dead code.** A module or client that nothing imports or calls. Search for
  its name before trusting that it is used.
- **Test code.** Fakes, mocks, stubs, fixtures and anything only test files
  import.
- **Retired or vendored material.** Directories marked legacy, deprecated or
  archived that no build or deploy step references.
- **Claims with no code.** A technology named in a README or comment with no
  dependency, configuration or call behind it.

Say what you left out, and why, in the report. When in doubt between "unused"
and "used in a way I have not found", search again, then ask.

## Edges

Draw an edge only when you found the call, query, publish or subscription.

| Found in code | Edge |
| --- | --- |
| HTTP or RPC request | caller to callee, kind `http` or `rpc` |
| Database query | service to datastore, kind `data`; `readOnly` only when every use is a read |
| Publish or enqueue | producer to queue, kind `queue` or `event` |
| Consume or subscribe | queue to consumer, kind `queue` or `event`; say in the summary that the consumer pulls |
| Object storage read or write | service to store, kind `data` |
| Reverse proxy or gateway route | proxy to upstream, kind `http` |

Do not add an edge because two services share a database, depend on each other
in a Compose file, or sit in the same directory. `depends_on` is start order, not
a call.

## Flows

Pick the journey the user asked for, or the one a newcomer most needs. Follow it
through the code and write the messages in the order they happen. One successful
path is enough; put branches and failures in notes. Every participant must be a
node, and every message must correspond to code you read. When a flow joins two
requests that are not triggered by each other, say so in the note.

## Before you finish

- Can you name a file for every node and every edge?
- Is anything on the "does not become a node" list in the graph?
- Is any node a part of another node's process?
- Would the count drop if you merged nodes a reader does not need to tell apart?
