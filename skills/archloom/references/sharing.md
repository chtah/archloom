# Committing, embedding and sharing diagrams

## Where files live

| File | Location | Commit |
| --- | --- | --- |
| Graph source `<name>.archloom.json` | `docs/architecture/`, or where the project already keeps it | Yes |
| `<view>.light.svg`, `<view>.dark.svg` from `archloom markdown` | Beside the graph | Yes |
| `index.html`, `atlas.json`, single-theme SVGs from `archloom render` | `.archloom/<name>/` | No |

If the project has no ignore rule for `.archloom/`, offer to add one.

## What each file reveals

- The **graph** is the whole system as written: every node, edge, summary and
  note, including anything no view shows.
- **`index.html` and `atlas.json`** embed that whole graph.
- An **SVG** holds what its view shows, including labels and IDs in the markup.

A named view is presentation, not redaction. Write every field as if it will be
published. When part of a system must stay private, keep it in a separate graph
file that is not committed or shared.

Never put these in a graph: secret values, tokens, personal data, customer
names. Ask before including internal hostnames, IP addresses, account IDs or
bucket names; some projects publish them deliberately and many must not.

## Confirm before publishing

Before the first commit of a graph, and before any diagram goes into a comment
or another place outside the repository:

1. List every lane, node and edge with its label and summary, and every flow
   note, in plain text.
2. Say where it will go and who can see that place.
3. Wait for the user to agree.

Later updates to a committed graph go through the project's normal review; the
diff of the JSON shows what changed.

## In a Markdown file

`archloom markdown` prints one snippet per view:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/architecture/architecture.dark.svg">
  <img alt="Example system" src="docs/architecture/architecture.light.svg">
</picture>
```

Paste it where the diagram belongs. The paths are relative to the directory you
ran the command in, which suits a README at the repository root when you run it
there. For a Markdown file elsewhere, pass `--base` with the path from that file
to the SVG directory, for example `--base ../architecture`.

GitHub shows the dark image to readers on a dark theme and the light image
otherwise. A renderer that ignores `<source>` shows the light image.

## In a comment

A comment cannot hold an image; it needs a URL, and an agent cannot upload a file
to a GitHub comment.

1. Commit and push the SVGs on the branch the comment is about.
2. Run `archloom markdown` again with `--base` set to the URL of the SVG
   directory at that commit, for example
   `--base https://github.com/<owner>/<repo>/raw/<commit-sha>/docs/architecture`.
   Use the commit SHA, not the branch name, so the comment keeps showing the
   diagram it was written about.
3. Paste the snippet into the comment, after the confirmation above.

Not verified by this skill's authors: images in comments of a private GitHub
repository, and `<picture>` in GitLab. In a private repository, check that the
image shows before relying on it. On GitLab, upload the light SVG through the
project uploads API and use the Markdown it returns.

Archloom posts nothing itself. Posting the comment is a separate action that
needs the user's approval.

## Keeping the diagram current

After the first diagram is committed, offer to add one line to the project's
agent instructions (`AGENTS.md` or its equivalent), and add it only if the user
agrees:

> When a change adds, removes or rewires a service, datastore, queue or outside
> dependency, update `docs/architecture/<name>.archloom.json` and run
> `archloom markdown docs/architecture/<name>.archloom.json --force`.

Also offer the check for CI or a pre-commit hook:

```bash
npx archloom markdown docs/architecture/<name>.archloom.json --check
```

It fails when the committed SVGs differ from a fresh render of the graph. It
does not know whether the graph still matches the code.
