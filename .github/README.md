# GitHub automation

## Checks

`workflows/checks.yml` runs the repository checks on every pull request into `main`: when it is opened, pushed to, reopened or marked ready for review. A new push cancels the run still going on the same pull request. The job needs no secret.

Each check is its own step, named in the run:

| Step               | Command                                                                   |
| ------------------ | ------------------------------------------------------------------------- |
| Lint               | `bun run lint`                                                            |
| Format check       | `bun run format:check`                                                    |
| Unused code (knip) | `bun run knip`                                                            |
| Unit tests         | `bun run test`                                                            |
| Markdown lint      | `bun run lint:story "**/*.md" "#node_modules" "#.claude/**/templates/**"` |
| Gherkin lint       | `bun run lint:gherkin`                                                    |

Run the same commands from the repository root to check a branch before pushing. Dependencies are installed with `bun install --frozen-lockfile --ignore-scripts`.

The `checks` job is a required status check on `main`: a pull request whose checks failed or have not finished cannot be merged. Repository admins can still bypass it from the merge button.

A project created from this template gets the workflow but not the rule. To make `checks` required in the new repository, open **Settings → Rules → Rulesets**, create a branch ruleset on the default branch, enable **Require status checks to pass** and add `checks`. Or run, from the new repository:

```sh
gh api repos/{owner}/{repo}/rulesets --method POST --input .github/checks-ruleset.json
```
