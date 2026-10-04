# Privacy

Archloom's library, CLI and generated viewer run locally. They do not send
telemetry, upload graphs, call model providers or contact a hosted Archloom
service. Rendering and built-in icon resolution make no network requests. The
HTML viewer is self-contained and its Content Security Policy disables network
connections. It is read-only: interactions do not update the source graph.
`mountCanvas` embeds this same viewer in a sandboxed iframe, without granting it
same-origin access to the host page. Custom hosting code and host CSP are separate
boundaries; embedding does not redact the graph.

Dependency installation is separate from rendering. Package managers and an
optional external skills installer may contact their registries or repositories
and run installation code. Installing a peer package or skill is a user choice,
not an automatic rendering step. An embedding application or custom icon resolver
is separate code and must be reviewed for its own data handling.

## Generated files contain your data

- **HTML embeds the entire parsed graph**, including descriptions and entities
  excluded from named views, plus rendered diagrams and metadata for both themes.
- **`atlas.json` embeds the entire parsed graph**, including unselected entities,
  and diagram geometry/notices for the CLI's selected theme.
- **SVG shares the selected diagram's visible details**, including labels and
  identifiers in markup, as well as icon attribution/license comments. Review the
  file itself, not only its appearance, before sharing it.

Named views control presentation, **not redaction or access control**. Switching
to a narrow view does not remove confidential data from HTML or atlas. Create a
separately sanitized graph before generating public artifacts. Local files can
still be read by anyone with filesystem access or by a recipient you share them
with; Archloom does not encrypt them or manage access permissions.

Do not include credentials, private endpoints, customer data or sensitive
infrastructure descriptions in public graphs, screenshots, demos or bug reports.
The repository's public examples describe fictional systems.

## Icons and attribution

Icons come from installed local peers or a supplied resolver. Icon source and
brand-guideline URLs are attribution text; the built-in adapters do not fetch
them. Notices may be embedded in SVGs and displayed by the viewer. Keep required
license notices when sharing generated assets. Third-party brand permissions
remain your responsibility; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

The hosted-service policies of PR Lens, the upstream project, do not describe
Archloom. For security concerns, see [SECURITY.md](SECURITY.md).
