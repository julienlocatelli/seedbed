// Creates a project's Notion databases for the development flow and writes
// the configuration the skills read (.claude/notion.json).

export const NOTION_VERSION = '2026-03-11';
const API = 'https://api.notion.com/v1';

export type NotionConfig = {
  project: string;
  parentPage: string;
  backlog: { database: string; dataSource: string; idProperty: string };
  stories: { database: string; dataSource: string };
  tasks: { database: string; dataSource: string };
};

export type SetupIo = {
  token: string | undefined;
  readConfig: () => string | undefined;
  writeConfig: (content: string) => void;
  ask: (question: string) => Promise<string>;
  log: (line: string) => void;
  fetch: typeof fetch;
};

export class SetupError extends Error {}

const ACCESS_HELP = `To give the setup access to Notion:

1. In Notion, open Settings → Connections → Develop or manage integrations (or https://www.notion.so/profile/integrations),
   choose New integration, pick your workspace, and give it the Read, Update and Insert content capabilities.
2. Copy its Internal Integration Secret.
3. Open the Notion page that will hold the project's databases, then ••• → Connections → add the integration.
4. Run the setup again with the secret:

   NOTION_TOKEN=<secret> bun run setup`;

const BACKLOG_ID = 'ID';

export async function setUpNotion(io: SetupIo): Promise<NotionConfig> {
  const existing = readExistingConfig(io);
  if (existing) {
    io.log(`${existing.project} is already set up: nothing changed.`);
    printLinks(io, existing);
    return existing;
  }
  if (!io.token)
    throw new SetupError(`NOTION_TOKEN is not set.\n\n${ACCESS_HELP}`);

  const notion = client(io.token, io.fetch);
  const project = (await io.ask('Project name: ')).trim();
  if (!project) throw new SetupError('The project name is required.');
  const parentId = parsePageId(
    await io.ask('Notion parent page (URL or ID): '),
  );
  const parent = await notion('GET', `/pages/${parentId}`);

  const created: string[] = [];
  try {
    return await createAll(
      io,
      notion,
      project,
      parentId,
      String(parent.url ?? ''),
      created,
    );
  } catch (error) {
    if (error instanceof SetupError && created.length > 0) {
      throw new SetupError(
        `${error.message}\n\nThese databases were created before the failure. Delete them in Notion before running the setup again:\n${created.map((url) => `- ${url}`).join('\n')}`,
      );
    }
    throw error;
  }
}

async function createAll(
  io: SetupIo,
  notion: Notion,
  project: string,
  parentId: string,
  parentUrl: string,
  created: string[],
): Promise<NotionConfig> {
  const createDatabase = async (
    ...args: Parameters<typeof createDatabaseIn>
  ) => {
    const database = await createDatabaseIn(...args);
    created.push(database.url);
    return database;
  };

  const tasks = await createDatabase(
    notion,
    parentId,
    `${project} Tasks`,
    '✅',
    {
      Name: { title: {} },
      '#': { number: { format: 'number' } },
      Slice: { rich_text: {} },
      Status: {
        status: {
          options: [
            { name: 'To Do', color: 'red', group: 'To-do' },
            { name: 'Doing', color: 'yellow', group: 'In progress' },
            { name: 'Done', color: 'green', group: 'Complete' },
          ],
        },
      },
    },
    `Technical tasks of the ${project} stories, written by /plan and moved by /implement.`,
  );

  const stories = await createDatabase(
    notion,
    parentId,
    `${project} Stories`,
    '🍃',
    {
      Name: { title: {} },
      TASK: { unique_id: { prefix: 'TASK' } },
      Status: {
        select: {
          options: [
            { name: 'To Define', color: 'purple' },
            { name: 'To Do', color: 'red' },
            { name: 'Doing', color: 'yellow' },
            { name: 'Review', color: 'default' },
            { name: 'Done 🙌', color: 'green' },
          ],
        },
      },
      Branch: { rich_text: {} },
      'Date Created': { created_time: {} },
      Tasks: {
        relation: {
          data_source_id: tasks.dataSourceId,
          type: 'dual_property',
          dual_property: {},
        },
      },
    },
    `User stories of ${project}: /specification writes them, /plan splits them into tasks, /implement and /pull-request deliver them.`,
  );
  await nameSyncedRelation(
    notion,
    tasks.dataSourceId,
    stories.dataSourceId,
    'Story',
  );

  const backlog = await createDatabase(
    notion,
    parentId,
    `${project} Backlog`,
    '💡',
    {
      Name: { title: {} },
      [BACKLOG_ID]: { unique_id: { prefix: 'BL' } },
      Status: {
        status: {
          options: [
            { name: 'To define', color: 'default', group: 'To-do' },
            { name: 'In progress', color: 'blue', group: 'In progress' },
            { name: 'Done', color: 'green', group: 'Complete' },
          ],
        },
      },
      Assign: { people: {} },
      Date: { date: {} },
    },
    `Ideas and tickets of ${project}, turned into stories by /specification.`,
  );

  const config: NotionConfig = {
    project,
    parentPage:
      parentUrl || `https://www.notion.so/${parentId.replaceAll('-', '')}`,
    backlog: {
      database: backlog.url,
      dataSource: `collection://${backlog.dataSourceId}`,
      idProperty: BACKLOG_ID,
    },
    stories: {
      database: stories.url,
      dataSource: `collection://${stories.dataSourceId}`,
    },
    tasks: {
      database: tasks.url,
      dataSource: `collection://${tasks.dataSourceId}`,
    },
  };
  io.writeConfig(`${JSON.stringify(config, null, 2)}\n`);
  io.log(
    `Set up Notion for ${project} and wrote .claude/notion.json. Commit it.`,
  );
  printLinks(io, config);
  return config;
}

function readExistingConfig(io: SetupIo): NotionConfig | undefined {
  const raw = io.readConfig();
  if (raw === undefined) return undefined;
  let config: Partial<NotionConfig>;
  try {
    config = JSON.parse(raw) as Partial<NotionConfig>;
  } catch {
    throw new SetupError(
      '.claude/notion.json is not valid JSON. Fix it, or delete it to set up Notion again.',
    );
  }
  const complete =
    config.backlog?.dataSource &&
    config.backlog.idProperty !== undefined &&
    config.stories?.dataSource &&
    config.tasks?.dataSource;
  if (!complete) {
    throw new SetupError(
      '.claude/notion.json is incomplete. Fix it, or delete it to set up Notion again.',
    );
  }
  return config as NotionConfig;
}

function printLinks(io: SetupIo, config: NotionConfig) {
  io.log(`- Backlog: ${config.backlog.database ?? config.backlog.dataSource}`);
  io.log(`- Stories: ${config.stories.database ?? config.stories.dataSource}`);
  io.log(`- Tasks:   ${config.tasks.database ?? config.tasks.dataSource}`);
}

export function parsePageId(input: string): string {
  const match = input
    .trim()
    .replaceAll('-', '')
    .match(/([0-9a-f]{32})(?:[?#].*)?$/i);
  if (!match)
    throw new SetupError(`"${input.trim()}" is not a Notion page URL or ID.`);
  const id = match[1]!.toLowerCase();
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

type Json = Record<string, unknown>;
type Notion = (method: string, path: string, body?: Json) => Promise<Json>;

function client(token: string, fetcher: typeof fetch): Notion {
  return async (method, path, body) => {
    const response = await fetcher(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await response.json().catch(() => ({}))) as Json;
    if (response.ok) return data;
    if (response.status === 401) {
      throw new SetupError(
        `Notion rejected NOTION_TOKEN: it is invalid or revoked.\n\n${ACCESS_HELP}`,
      );
    }
    if (response.status === 403 || response.status === 404) {
      throw new SetupError(
        `The integration cannot reach the parent page: share the page with it.\n\n${ACCESS_HELP}`,
      );
    }
    throw new SetupError(
      `Notion API ${method} ${path} failed (${response.status}): ${String(data.message ?? 'no message')}`,
    );
  };
}

async function createDatabaseIn(
  notion: Notion,
  parentId: string,
  title: string,
  emoji: string,
  properties: Json,
  description: string,
): Promise<{ url: string; dataSourceId: string }> {
  const database = await notion('POST', '/databases', {
    parent: { type: 'page_id', page_id: parentId },
    title: [{ type: 'text', text: { content: title } }],
    description: [{ type: 'text', text: { content: description } }],
    icon: { type: 'emoji', emoji },
    initial_data_source: { properties },
  });
  const dataSources = database.data_sources as { id: string }[] | undefined;
  const dataSourceId = dataSources?.[0]?.id;
  if (!dataSourceId)
    throw new SetupError(
      `Notion created "${title}" without returning its data source.`,
    );
  return { url: String(database.url), dataSourceId };
}

// The relation's synced property gets the stories database's title by default; Forest names it Story.
async function nameSyncedRelation(
  notion: Notion,
  dataSourceId: string,
  targetId: string,
  name: string,
) {
  const dataSource = await notion('GET', `/data_sources/${dataSourceId}`);
  const properties = (dataSource.properties ?? {}) as Record<
    string,
    { type: string; relation?: { data_source_id?: string } }
  >;
  const synced = Object.entries(properties).find(
    ([, property]) =>
      property.type === 'relation' &&
      property.relation?.data_source_id === targetId,
  );
  if (!synced)
    throw new SetupError(
      'Notion did not create the tasks side of the Tasks relation.',
    );
  if (synced[0] === name) return;
  await notion('PATCH', `/data_sources/${dataSourceId}`, {
    properties: { [synced[0]]: { name } },
  });
}
