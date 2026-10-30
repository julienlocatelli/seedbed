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
| `bun run test`         | Unit tests (`bun test`)                                |
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
    "dataSource": "collection://<stories data source id>"
  },
  "tasks": {
    "dataSource": "collection://<tasks data source id>"
  }
}
```

The setup also records the project name and the links of the parent page and of each database. The template ships without this file. Until `bun run setup` writes it, every process skill stops and asks you to run the setup.

### Set up Notion

`bun run setup` asks for the project name and a Notion page, and creates three databases under that page, with Forest's properties and statuses:

| Database | Properties                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------- |
| Backlog  | `Name`, `ID` (`BL-<n>`), `Status` (To define, In progress, Done), `Assign`, `Date`                                  |
| Stories  | `Name`, `TASK` (`TASK-<n>`), `Status` (To Define, To Do, Doing, Review, Done 🙌), `Branch`, `Date Created`, `Tasks` |
| Tasks    | `Name`, `#`, `Slice`, `Status` (To Do, Doing, Done), `Story`                                                        |

`Tasks` and `Story` are the two sides of one relation. Each story published by `/specification` gets a Kanban board of its own tasks under `# To Do`. The Notion API cannot create database templates, so the skill adds the board instead of a "New Task" template.

The setup reaches Notion through an integration token:

1. In Notion, open **Settings → Connections → Develop or manage integrations**, choose **New integration** and give it the **Read**, **Update** and **Insert content** capabilities.
2. Copy its **Internal Integration Secret**.
3. Open the page that will hold the databases, then **••• → Connections**, and add the integration.
4. Run the setup with the secret, then commit `.claude/notion.json`:

   ```sh
   NOTION_TOKEN=<secret> bun run setup
   ```

Running it again on a configured project changes nothing. Without a token, or without access to the page, it stops and prints these steps. If it fails after creating some databases, it lists them: delete them in Notion before running it again.
