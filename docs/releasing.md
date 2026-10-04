# Releasing Archloom

This is an operator checklist, not an automatic release workflow. CI checks code
and packages; it never publishes. Local preparation, npm login, publishing,
Git tags/releases and deployment are separate actions requiring owner approval.

## Preconditions

- Publish the root package only: `@chtah/archloom`. The scope belongs to the
  maintainer's personal npm account, not an organization. The current target is
  `0.2.0`; private schema/renderer workspaces are not published.
- Use the owner-reviewed, merged commit with passing CI. Confirm `package.json`
  name/version/repository/homepage and the exact public version being released.
- The owner must verify their npm email and enable 2FA. Do not ask for passwords,
  tokens, one-time codes or recovery codes in chat.
- Check that GitHub private vulnerability reporting remains enabled and
  `SECURITY.md` points to the correct repository.
- Review packed contents, the retained upstream MIT copyright, third-party
  notices, optional icon permissions and fictional examples. No private data.
- Check the public registry for the target version. A missing public entry does
  not prove publishing permissions; confirm the authenticated npm identity later.

## Prepare locally (no credentials or publication)

Use Node.js 22+ and the pinned pnpm version. From the approved source checkout:

```bash
pnpm install --frozen-lockfile
pnpm verify
pnpm test:package
mkdir -p .archloom/release
npm pack . --ignore-scripts --pack-destination .archloom/release
sha512sum .archloom/release/chtah-archloom-0.2.0.tgz
```

The pack command skips lifecycle scripts because the build and complete checks
already ran. `.archloom/` is ignored. The resulting tarball is a local artifact,
not a registry release. `pnpm test:package` additionally exercises core/browser
exports, CLI/declarations and optional peers in isolated offline consumers.

A publication dry-run may inspect the tarball without uploading it:

```bash
dry_run_config=$(mktemp "${TMPDIR:-/tmp}/archloom-npm-dry-run.XXXXXX")
npm publish .archloom/release/chtah-archloom-0.2.0.tgz \
  --dry-run --ignore-scripts --access public --userconfig "$dry_run_config" \
  --registry https://registry.npmjs.org/
rm -f -- "$dry_run_config"
```

Do not edit or rebuild the approved artifact after recording its checksum.
Changes require rebuilding, rechecking and approving the replacement artifact.

## Authenticate and publish (separate explicit approval)

The owner should approve the exact package, version, checksum, public access and
registry. Publication uploads all tarball contents to a public registry; a
published name/version cannot be replaced with different bytes.

Use an isolated temporary npm user config outside the repo so personal login
cannot overwrite a work registry or global credentials:

```bash
npm_user_config=$(mktemp "${TMPDIR:-/tmp}/archloom-npm.XXXXXX")
chmod 600 "$npm_user_config"
npm login --userconfig "$npm_user_config" --registry https://registry.npmjs.org/
npm whoami --userconfig "$npm_user_config" --registry https://registry.npmjs.org/
```

Complete browser sign-in and 2FA privately. `npm whoami` must report `chtah`.
Never display the config contents or paste an authentication link/code into chat.
Do not assume account creation, a GitHub identity or a scope string grants access.
After approval and identity verification, publish the exact checked artifact:

```bash
npm publish .archloom/release/chtah-archloom-0.2.0.tgz \
  --ignore-scripts --access public --userconfig "$npm_user_config" \
  --registry https://registry.npmjs.org/
```

After the operation (including failure), log out of that isolated session and remove its auth file;
do not remove or change any global/work configuration:

```bash
npm logout --userconfig "$npm_user_config" --registry https://registry.npmjs.org/
rm -f -- "$npm_user_config"
```

## Verify the public result

Read registry metadata for `@chtah/archloom@0.2.0`, verify version/integrity against
the approved artifact, and install that exact version in a fresh consumer to run
API, CLI and browser smoke checks. Report actual results, not just publish output.
If publication or verification fails, stop and preserve evidence; do not
unpublish, publish another version or change access/settings without approval.
Only then document the actual release and propose any separately approved
Git tag/release or homelab migration. No production changes are part of this guide.
