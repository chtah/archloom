# Contributing to Archloom

Archloom has one maintainer. Issues are welcome; pull requests are welcome within
the limits below. No response time is promised.

## Issues

- **Bugs:** use the bug report form. Include the Archloom version, the command or
  API call, and the smallest graph that reproduces the problem.
- **Ideas:** use the feature request form and describe the problem before the
  solution.
- **Security:** do not open a public issue. Follow [SECURITY.md](SECURITY.md).

Graphs, screenshots and generated files attached to an issue are public. Use a
fictional system: no credentials, private endpoints, customer names or internal
infrastructure. See [PRIVACY.md](PRIVACY.md).

## Pull requests

- **Small bug fixes and documentation fixes:** open a pull request directly.
- **Features, new graph fields, new CLI commands or output changes:** open an issue
  first and wait for agreement. Graph fields, public exports and generated
  artifacts are compatibility boundaries, so unrequested changes to them are
  usually declined.
- **Out of scope:** a backend, graph upload, a model provider or an integration
  that posts to pull requests.

[AGENTS.md](AGENTS.md) holds the repository map and the implementation rules
(deterministic rendering, script-free SVG, the viewer's Content Security Policy,
structured icons). They apply to every contributor, human or agent.

## Development

```bash
pnpm install --frozen-lockfile
pnpm verify
```

Use the pnpm version in `package.json` and Node.js 22 or newer. `pnpm verify`
builds, type-checks and runs the unit and browser tests. The browser tests need a
local Chromium-based browser; point `CHROME_BIN` at its executable.

For a behavior change, add a regression test that goes through the public API or
the CLI. For a visual change, look at the architecture and data-flow output in
both themes; snapshots alone do not show that a diagram is correct. Add a line to
[CHANGELOG.md](CHANGELOG.md) for anything a user would notice.

`main` is protected: changes arrive through a pull request with passing CI.

## License

Contributions are accepted under the [MIT license](LICENSE) of this repository.
