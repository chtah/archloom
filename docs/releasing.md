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
   workflow `release.yml` and environment `npm`.
3. Keep 2FA enabled on the npm account. No npm token is created or stored: the
   workflow authenticates with a short-lived OIDC identity.

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
   `pnpm test:package`, packs the checked build, prints its SHA-512, publishes
   that tarball with provenance, and creates the GitHub release from the
   changelog section.

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
- **After publish**: do not unpublish and do not move the tag. Fix forward with a
  new version. If only the GitHub release job failed, re-run that job.
- Do not change package access, npm settings or the environment's rules to get a
  run through without the owner's approval.
