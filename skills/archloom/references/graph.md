# Archloom graph contract (0.1.0)

Use this public contract, not the private compatibility engine's graph format.
Unknown fields are rejected. CLI validation also checks IDs, references and view
renderability; JSON Schema alone cannot express all those relationships.

## Minimal document

```json
{
  "schemaVersion": "0.1.0",
  "title": "Example system",
  "lanes": [{ "id": "application", "label": "Application" }],
  "nodes": [{ "id": "api", "label": "API", "lane": "application", "kind": "app" }]
}
```

`schemaVersion` defaults to `0.1.0`. `summary` is optional. `edges`, `flows` and
`views` default to empty arrays. `layout` is optional. At least one lane and node
are required. Labels are single-line, 1–120 characters; summaries/notes are plain
text, 1–2000 characters, and may contain newlines. Text must be valid XML Unicode.

IDs start with a lowercase letter and contain only lowercase letters, digits and
hyphens, up to 64 characters. IDs are unique within each collection; view IDs are
unique across the whole view tree. Message IDs are unique **inside their flow**,
so different flows can reuse `request` without ambiguity.

## Lanes and nodes

Lane: `id`, `label`, optional `subtitle`, `summary`, `color`.

Node: `id`, `label`, `lane`, optional `kind`, `subtitle`, `summary`, `color`, `icon`.
The lane must exist. Node kind defaults to `service`:

`service`, `app`, `module`, `function`, `route`, `job`, `queue`, `datastore`,
`cache`, `external`, `ui`, `config`, `test`, `package`, `other`.

Choose a coarse kind the reader understands; it drives appearance, not analysis.
Colors are six-digit hex, e.g. `#58a6ff`. Lanes get a faint tint; nodes may override
their kind's accent. Icon keys use `namespace:name`: Lucide names are lowercase
kebab-case; Simple Icons uses its package slug. Default glyphs need no icon peer.
Lucide requires `--icons lucide`; Simple Icons requires `--icons simple-icons`.
Brand colors are preserved, not forced to match node accents. Explicit non-CC0
brand license metadata is refused by the built-in adapter; review rights and
provide a separately reviewed local resolver if needed. Missing metadata is not
clearance. Raw SVG in JSON is not supported.

## Edges

```json
{ "id": "read", "from": "api", "to": "database", "kind": "data",
  "label": "Read records", "readOnly": true,
  "summary": "The API reads records without modifying them." }
```

Required: `id`, `from`, `to`. Endpoints must exist. Optional:

- `kind`: `call` (default), `http`, `rpc`, `event`, `queue`, `data`, `dependency`, `render`, `other`.
- `label`, `summary`: meaningful connection/action description.
- `animated`: defaults to `true`; travelling pulse in architecture.
- `emphasis`: `normal` (default), `hero`, `muted`.
- `readOnly`: defaults to `false`; dashed architecture line when true. Do not mark a write read-only.

Arrows express the declared relationship direction. For event systems, explain
whether a line means publishing, subscribing or delivery instead of guessing.

## Ordered flows

```json
{
  "id": "load-records", "title": "Load records",
  "participants": ["browser", "api", "database"],
  "messages": [
    { "id": "request", "from": "browser", "to": "api", "label": "GET /records" },
    { "id": "query", "from": "api", "to": "database", "label": "Read records" },
    { "id": "rows", "from": "database", "to": "api", "label": "Rows", "kind": "return" },
    { "id": "response", "from": "api", "to": "browser", "label": "JSON", "kind": "return" }
  ]
}
```

Flow: `id`, `title`, `participants`, `messages`, optional `summary`.
Participants are 2–12 distinct **node ID strings**, ordered left to right.
Messages have `id`, `from`, `to`, `label`; optional `kind`, `note`, `animated`.
Endpoints must be participants. Kind: `sync` (default), `async`, `return`, `self`.
`self` is required exactly when `from === to`. Animation defaults to true.
There are no explicit step numbers, payload samples or change statuses in 0.1.0.
The canvas can inspect messages in order; it is not a debugger or a flow editor.

## Views and layout

Without named views, output is an architecture overview and one data-flow view
per flow. Generated IDs are `architecture` and `flow-<flow-id>`.

```json
{
  "id": "api-detail", "title": "API detail", "lens": "architecture",
  "scope": { "kind": "selection", "nodes": ["api"] },
  "children": []
}
```

A view requires `id`, `title`, `lens` (`architecture` or `data-flow`). Optional:
`summary`, `scope` (defaults to `{ "kind": "all" }`), `children` (defaults to `[]`).
A selection may list `lanes`, `nodes`, `edges`, `flows`; omitted lists are empty.
Every reference must exist. Architecture views must contain a node; data-flow
selections need flows. A data-flow view cannot exist in a system without flows.
When views are provided, output contains those views and their descendants only.

Optional layout hints: `laneOrder` (list of known lane IDs, no duplicates) and
`rank` (known node IDs mapped to integers 0–256). These are layout hints, not
editable pixel positions. `direction` is `right` (default: lanes are columns
left to right and connections run down them) or `down` (lanes are bands stacked
top to bottom and connections run across them, left to right). It applies to
architecture views only; data-flow sequences always run top to bottom.

## Limits and artifacts

16 lanes, 256 nodes, 512 edges, 16 flows, 64 messages per flow, 32 total named
views, 8 view nesting levels. CLI input files are capped at 4 MiB. Prefer much
smaller diagrams for comprehension, not just staying below the caps.

Render output: `<view-id>.svg`, `atlas.json`, `index.html`. Markdown output
(`archloom markdown`): `<view-id>.light.svg` and `<view-id>.dark.svg` only. The atlas includes
final node/lane boxes, individual repeated-flow node instances, raw line paths
and label pills plus their canvas translation. No PR fields are present.
HTML is self-contained, read-only, includes both themes and a deny-by-default
network CSP. It may contain all graph descriptions and should not be shared
publicly merely because the viewer works offline.
