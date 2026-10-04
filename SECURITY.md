# Security

Archloom is a local ESM library and CLI with an offline, read-only viewer. There
is no Archloom backend, hosted canvas, model integration or graph-upload service.
Historical upstream integrations are inactive and not distributed with the root
package. Their contacts and hosted-service policies are not Archloom resources.

## Input and output boundaries

The public parser rejects unknown fields and checks IDs, references, text,
collection sizes and view nesting. It rejects cyclic input objects and applies
tree size/depth limits. The CLI accepts regular JSON files up to 4 MiB. These
Label placement spends a fixed work budget per diagram and then leaves the
remaining labels at the middle of their lines, and the HTML canvas refuses view
sets that would embed more than 16 MiB of SVG. These bounds reduce
malformed-input and resource-exhaustion risks; they are not a promise that
arbitrary input or dependencies are harmless.

Graph prose is escaped in SVG/HTML and displayed as text in the detail popup.
Icons use validated structured geometry with allowlisted shapes and attributes,
not raw SVG, scripts or external resource references. Built-in adapters resolve
installed local peers and do not fetch source URLs. Custom resolver functions are
application code, not sandboxed input: use only resolvers and dependencies you trust.

The generated HTML embeds a bundled client whose exact bytes are authorized by
a SHA-256 Content Security Policy hash. The policy defaults to no resources,
disables network connections, and blocks forms, objects and base-URL changes;
it allows inline styling and data/blob images for local presentation. SVG output
contains no scripts. Browser mounting uses an iframe with scripts/downloads
allowed but without `allow-same-origin`; UI and popup state are isolated from the
host. The host CSP can impose additional restrictions. These protections apply
to generated output, not arbitrary HTML edits, compromised dependencies or a
consuming application's own code.

The CLI refuses existing output artifacts unless `--force` is requested and
rejects detected symlink/non-file artifacts. `--force` overwrites generated
files, not the entire output directory. Use output directories you control;
these checks are not a filesystem sandbox or a guarantee against concurrent
filesystem changes.

HTML and atlas contain the whole graph even when views select only a subset.
The viewer provides no authentication, encryption or redaction. Sanitize a
separate graph before sharing artifacts; see [PRIVACY.md](PRIVACY.md).

## Reporting a vulnerability

GitHub private vulnerability reporting is enabled for Archloom. Open
[Security Advisories](https://github.com/chtah/archloom/security/advisories) and
choose **Report a vulnerability** to send a private report before posting
technical details publicly. GitHub sign-in is required.

Include the affected checkout/version, impact and a minimal fictional
reproduction. Do not include credentials, private graphs or customer data in the
report; never post exploit details in a public issue or pull request. Archloom
has no separate security email. No response-time or remediation-time guarantee
is made.
