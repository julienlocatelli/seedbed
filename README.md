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

| Path        | Content                                         |
| ----------- | ----------------------------------------------- |
| `apps/`     | Applications, one bun workspace each            |
| `packages/` | Shared packages, one bun workspace each         |
| `features/` | Gherkin scenarios of the stories                |
| `.claude/`  | Development-flow skills and their configuration |
| `.github/`  | The `checks` workflow and its documentation     |

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
bun run lint:story "**/*.md" "#node_modules" "#.claude/**/templates/**"
```

The skills' templates are left out: their `<placeholder>` lines fail the lint on purpose, so that a story or board drafted from them cannot pass with a placeholder left in.

## Development flow

The skills in `.claude/skills/` carry Forest's development flow, from a backlog ticket to a pull request:

| Skill                        | Does                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| `/specification <ticket-id>` | Turns a backlog ticket into user stories on the stories board                          |
| `/plan <story-id>`           | Splits a story into slices and task cards, and decides its branch                      |
| `/implement <story-id>`      | Implements the story slice by slice, then hands over to `/pull-request`                |
| `/pull-request <story-id>`   | Squashes the story's work into one commit and opens its pull request, ready for review |

They rely on `git-ticket-branch` and `pr`, and on the generic skills `code-review`, `tdd`, `writing-for-agents`, `codebase-design`, `diagnosing-bugs` and `domain-modeling`.

### Notion configuration

The skills read the project's Notion databases from `.claude/notion.json`, committed in the project:

```json
{
  "backlog": {
    "dataSource": "collection://<backlog data source id>",
    "idProperty": "<name of the backlog's ID property>"
  },
  "stories": {
    "dataSource": "collection://<stories data source id>",
    "template": "<page id of the stories' New Task template>"
  },
  "tasks": {
    "dataSource": "collection://<tasks data source id>"
  }
}
```

The template ships without this file: `bun run setup` creates the project's Notion databases and writes it. Until then, every process skill stops and asks you to run it.
