# Releasing Archloom

A release is published by `.github/workflows/release.yml`, never from a
workstation. Pushing a `v<version>` tag starts the workflow; it then waits for
the owner to approve the `npm` environment. CI (`ci.yml`) only checks and never
publishes.

Only the root package `@chtah/archloom` is published. The private schema and
renderer workspaces are bundled into it and are not separate releases.

## One-time setup (owner)

These are account settings, so the owner does them in the browser.

1. **GitHub environment.** Repository Settings → Environments → new environment
   `npm`. Add yourself as a required reviewer, and under deployment branches and
   tags allow only the tag pattern `v*`.
2. **npm trusted publisher.** On npmjs.com, open `@chtah/archloom` → Settings →
   Trusted Publisher → GitHub Actions, with owner `chtah`, repository `archloom`,
   workflow `release.yml` and environment `npm`. Under permissions, allow
   `npm publish`. With only `npm stage publish`, the workflow's publish step fails
   with `403 ... OIDC permission denied for this action`.
3. Keep 2FA enabled on the npm account, and under Publishing access choose
   "Require two-factor authentication and disallow bypass 2fa tokens". No npm
   token is created or stored: the workflow authenticates with a short-lived
   OIDC identity, which that setting does not affect.

A deleted and recreated repository needs both steps again.

## Prepare the release (pull request)

1. Decide the version. Below 1.0, a minor release may change behavior; say so in
   the changelog.
2. In one pull request: set `version` in `package.json`, add a `## <version>`
   section to `CHANGELOG.md`, and update version numbers in the documentation.
3. Review what will ship. No private data, fictional examples only, the retained
   upstream MIT copyright and the third-party notices in place.

   ```bash
   pnpm install --frozen-lockfile
   pnpm verify
   pnpm test:package
   npm pack . --dry-run --ignore-scripts
   ```

4. Check the registry: the version must not exist yet. A published name and
   version can never be replaced with different bytes.

   ```bash
   npm view @chtah/archloom versions
   ```

5. Merge the pull request after CI passes.

## Publish (owner approval)

1. Tag the merged commit on `main` and push the tag. This is the step that starts
   a publication, so it needs the owner's approval for that exact version.

   ```bash
   git switch main && git pull --ff-only
   git tag v<version>
   git push origin v<version>
   ```

2. The workflow stops at the `npm` environment. Open the run under Actions,
   check that the tag and commit are the intended ones, and approve it.
3. The workflow then refuses to continue unless the tag is a commit on `main`,
   matches `package.json` and has a changelog section. It runs `pnpm verify` and
   `pnpm test:package`, packs the checked build, prints its SHA-512, and publishes
   that tarball with provenance. npm's own output in the log shows the `shasum`
   the registry will list.
4. The second job waits until the registry serves the new version, for up to 30
   minutes, and only then creates the GitHub release from the changelog section.
   A new tarball can take several minutes to become downloadable after the
   publish step reports success. If npm holds the version for confirmation, it
   shows as pending on the package page: compare its checksum with the one in
   the workflow log, then confirm it.

## Verify the result

```bash
npm view @chtah/archloom@<version> version dist.integrity dist.attestations
```

Check that the version and provenance attestation are present, then install that
exact version in a fresh directory and run the CLI and an import. Report what was
actually observed, not only that the workflow was green.

## If something fails

- **Before publish** (a check or the tag validation fails): fix it through a pull
  request, delete the tag, and tag the new commit. Nothing reached npm.
- **Publish fails with `OIDC permission denied`**: the trusted publisher lacks the
  `npm publish` permission or does not match the workflow. Fix the setting on
  npmjs.com and use "Re-run failed jobs"; the tag stays as it is.
- **The release job times out waiting for the registry**: nothing is wrong with
  the tag. Check the package page for a pending version, confirm it if there is
  one, then re-run that job only. Do not re-run the publish job.
- **After publish**: do not unpublish and do not move the tag. Fix forward with a
  new version. If only the GitHub release job failed, re-run that job.
- Do not change package access, npm settings or the environment's rules to get a
  run through without the owner's approval.
