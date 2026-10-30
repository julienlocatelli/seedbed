# seedbed

A GitHub template repository with Forest's base toolchain: mise, bun workspaces, ESLint, Prettier, knip, Markdown and Gherkin lints, and a required `checks` workflow on pull requests. It holds no application code.

## Start a project

1. On GitHub, open this repository and choose **Use this template → Create a new repository**.
2. Clone the new repository, then install the tools and the dependencies:

   ```sh
   mise install
   bun install
   ```

3. Make the `checks` workflow a required status check on `main`, as described in [.github/README.md](.github/README.md).

## Layout

| Path        | Content                                     |
| ----------- | ------------------------------------------- |
| `apps/`     | Applications, one bun workspace each        |
| `packages/` | Shared packages, one bun workspace each     |
| `features/` | Gherkin scenarios of the stories            |
| `.claude/`  | Skills, and the lint rules of the stories   |
| `.github/`  | The `checks` workflow and its documentation |

## Scripts

| Command                | Checks                                                 |
| ---------------------- | ------------------------------------------------------ |
| `bun run lint`         | ESLint, with the TypeScript rules                      |
| `bun run format`       | Formats the files with Prettier                        |
| `bun run format:check` | Fails when a file is not formatted                     |
| `bun run knip`         | Unused files, exports and dependencies                 |
| `bun run lint:story`   | Markdown files given as arguments, with Forest's rules |
| `bun run lint:gherkin` | `.feature` files, with Forest's rules                  |

To lint every Markdown file like the CI does:

```sh
bun run lint:story "**/*.md" "#node_modules"
```
