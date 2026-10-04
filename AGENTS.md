# Contributor and agent instructions

These tool-neutral instructions apply throughout this checkout. Read any more
specific instructions before editing a subdirectory.

## Scope and boundaries

Archloom is one ESM library and CLI for architecture and data-flow diagrams,
with an offline, read-only HTML canvas. There is no backend, graph upload, model
provider or PR integration in the public API. Do not add those dependencies as
incidental features. Public input has no PR fields.

The root package is `@chtah/archloom`, using the maintainer's personal npm scope;
`0.2.0` is the current release target. Confirm authenticated npm identity and the
registry version before every approved publication; neither the version field
nor a merge proves publication. Private schema and renderer workspaces retain
`@coldtea/pr-lens-*` names for compatibility; they are not separate Archloom
releases.

## Before editing

1. Read `README.md`, `package.json` and the relevant source bodies and callers.
2. Check local Git status and preserve changes you did not make.
3. State the intended behavior and a scoped verification plan. Ask about unclear
   API or compatibility requirements rather than inventing them.
4. Work only inside this checkout. Do not inspect private sibling repositories,
   credential stores, private account data or production systems without explicit
   permission. Never print secrets or copy them into code, examples or chat.

Local edits and checks do not authorize commits, pushes, merges, package
publication, skill installation, repository settings or cloud changes. Obtain
explicit approval for each such action. Do not change global or work-related Git
configuration. Use the contributor's configured identity; do not add model
co-authorship or private session links.

## Repository map

| Path | Responsibility |
| --- | --- |
| `src/index.ts` | Public library exports. |
| `src/graph.ts`, `src/errors.ts` | Public graph validation, limits, types and errors. |
| `src/render.ts`, `src/internal/adapter.ts` | Public render API, scoped styling, atlas and private-engine translation. |
| `src/cli.ts` | Local validation and artifact writing. |
| `src/browser.ts` | Native browser mounting, isolated iframe and update/destroy lifecycle. |
| `src/icons.ts`, `src/icons/` | Structured icon validation and lazy optional peer adapters. |
| `src/viewer.ts`, `src/viewer/client.ts` | Offline HTML and read-only browser interactions. |
| `scripts/build-viewer.mjs` | Generates the embedded viewer client and its CSP hash. |
| `scripts/emit-schema.mjs`, `schema/graph.schema.json` | Public schema generation and output. |
| `packages/schema/src/`, `packages/renderer/src/` | Private compatibility engine contracts, layout and SVG drawing. |
| `test/`, engine `test/` directories | Public and private-engine regression tests. |
| `scripts/test-browser.mjs`, `scripts/test-embed.mjs` | Local Chrome checks of native popup, browser mounting and real viewer. |
| `.github/workflows/ci.yml` | PR/main checks with Node 24, locked dependencies, Chrome and packed consumers; no publication or deploy. |
| `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `.github/ISSUE_TEMPLATE/`, `.github/pull_request_template.md` | What outside contributors may send, and the issue and pull request forms. |
| `.github/workflows/dependency-review.yml`, `scorecard.yml`, `.github/dependabot.yml` | Dependency vulnerability review on PRs, weekly OpenSSF Scorecard, and weekly dependency and action update PRs. |
| `skills/archloom/` | Active installable skill and public graph reference. |
| `examples/`, `docs/archloom/` | Fictional graphs and generated visual assets. |

The public graph contract is `src/graph.ts`, documented in
`skills/archloom/references/graph.md`; it is not the private engine's PR-era schema.

## Implementation rules

- Keep changes surgical. Avoid unrelated refactoring, renaming, upgrades and
  lockfile churn.
- Edit source, not `dist/` JavaScript or declarations. Edit `src/viewer/client.ts`,
  not `src/viewer/client.generated.ts`; rebuild to regenerate its bytes and hash.
  Emit the public schema through the build rather than editing it by hand.
- Use existing TypeScript conventions, discriminated unions and exhaustive
  handling. Avoid `any` and casts that hide invalid states.
- Validate at public boundaries; preserve strict unknown-field rejection,
  reference checks and resource limits.
- Keep rendering deterministic: equal input and options produce equal SVG bytes.
  No clocks, randomness, network calls or persistent/unscoped process-global
  style mutation. Pass per-render styles through supported synchronous scoped
  engine hooks, restoring the previous scope even when a callback throws.
- Keep SVGs self-contained and script-free; CSS/SMIL animation is allowed.
  Escape prose and attributes. Do not treat graph summaries as HTML.
- Icons are structured, allowlisted geometry, never raw SVG or fetched URLs.
  Load optional peers only on request. Preserve notices and brand colors;
  absent license metadata is not clearance, and explicit non-CC0 brand licenses
  remain refused by the built-in adapter.
- Preserve the viewer's deny-by-default CSP and exact generated script hash.
  Keep network connections disabled and popup prose as text. Browser mounts reuse
  the same viewer in a sandboxed iframe without `allow-same-origin`; avoid duplicate
  controllers or styles. Do not weaken these controls to make a test pass.
- Test atlas alignment: boxes are final coordinates, paths/pills need `shift`,
  repeated flow headings use `nodeInstances`, and message line IDs include the
  flow ID. A node map alone is insufficient for repeated instances.
- Treat public exports, graph fields and artifacts as compatibility boundaries.
  Document intentional changes and test public entry points.

## Checks

Use the pnpm version in `package.json`. Runtime support starts at Node.js 20.11;
recommend Node.js 22+ for development with current Vitest/Vite tooling. Do not
change global runtimes or download tools without permission.

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
pnpm verify
```

`pnpm verify` includes build, root/private-engine type checks, root/schema/renderer
tests and actual local Chrome browser checks. `CHROME_BIN` selects Chrome's
executable (default `/usr/bin/google-chrome`); the tests do not download a browser.
`pnpm test:browser` requires a prior build. `pnpm demo` regenerates the demo assets
and requires local Chrome and ffmpeg.

CI runs `pnpm verify` and `pnpm test:package` on pull requests and `main` using
hosted Ubuntu 24.04, Node 24 and the runner's installed Chrome. Keep actions
pinned to reviewed commit SHAs, repository permissions read-only and checkout
credentials non-persistent. Never execute PR code with `pull_request_target`,
introduce secrets or add publishing/deployment to this check-only workflow.

For behavior changes, add regressions and exercise the public API or CLI. For
visual changes, inspect architecture and data-flow output in both themes, including
labels, routing, repeated headings, selection geometry and reduced-motion behavior.
Snapshots alone do not establish visual correctness. Check runnable documentation
examples and local links. Report the exact checks run and failures; never claim
verification that was not performed.

## Documentation, privacy and licensing

Write plain English and describe implemented behavior. Do not advertise an npm
installation, hosted service, security email or enabled private-reporting feature
that does not exist. Remote skill installation is only appropriate after the
implementation is merged and pushed; an external installer requires a user request.

Public examples must be fictional. HTML and atlas embed the entire graph,
including unselected entities; HTML also includes both diagram themes. Named views
are not redaction. Review generated artifacts before sharing them.

Retain the MIT license and Coldtea AI copyright, and credit PR Lens by name as the
upstream project. Keep third-party notices and review asset rights separately;
public availability and package-level CC0 do not clear brand rights. Do not reuse
upstream hosted-service policies or security contacts as Archloom resources.
Keep this file tool-neutral; `CLAUDE.md` points here.

Follow `docs/releasing.md` for release preparation. Before any explicitly
approved publication, confirm authenticated npm identity, scope ownership,
metadata, version, packed contents, licenses and reporting setup. Keep npm auth
in an isolated temporary user config outside the repository, never in a tracked
file or chat, and do not change a work registry or global credentials. Publishing
requires separate approval for the exact name, version, artifact and public access.
A `publishConfig` field is neither evidence of publication nor permission to publish.

## Handoff

Summarize changed paths, completed checks, checks not run and remaining limitations.
Do not describe local implementation as a published release or a deployed service.
