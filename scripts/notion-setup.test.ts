import { describe, expect, test } from 'bun:test';

import {
  NOTION_VERSION,
  parsePageId,
  setUpNotion,
  SetupError,
  type SetupIo,
} from './notion-setup.ts';

const PARENT = '40974e4626fd8078ad29ff42d2f3acf0';
const PARENT_ID = '40974e46-26fd-8078-ad29-ff42d2f3acf0';

type Call = { method: string; path: string; body?: Record<string, unknown> };

// A fake Notion API: records calls and answers like the real one for the endpoints the setup uses.
function fakeNotion(
  options: { status?: number; failOnDatabase?: number } = {},
) {
  const calls: Call[] = [];
  const dataSources = new Map<string, Record<string, unknown>>();
  let databases = 0;
  const fetcher = (async (url: string, init: RequestInit) => {
    const path = url.replace('https://api.notion.com/v1', '');
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    const method = init.method ?? 'GET';
    calls.push({ method, path, body });
    expect((init.headers as Record<string, string>)['Notion-Version']).toBe(
      NOTION_VERSION,
    );
    const reply = (status: number, data: unknown) =>
      new Response(JSON.stringify(data), { status });
    if (options.status) return reply(options.status, { message: 'denied' });
    if (method === 'GET' && path === `/pages/${PARENT_ID}`)
      return reply(200, { url: `https://www.notion.so/Parent-${PARENT}` });
    if (method === 'POST' && path === '/databases') {
      databases += 1;
      if (databases === options.failOnDatabase)
        return reply(400, { message: 'invalid schema' });
      const id = `ds-${databases}`;
      const properties = structuredClone(
        body.initial_data_source.properties,
      ) as Record<string, unknown>;
      dataSources.set(id, properties);
      // A dual relation adds its synced property to the target, named after the source database.
      for (const property of Object.values(properties) as {
        relation?: { data_source_id: string };
      }[]) {
        if (property.relation) {
          dataSources.get(property.relation.data_source_id)![
            body.title[0].text.content
          ] = {
            relation: { data_source_id: id },
          };
        }
      }
      return reply(200, {
        url: `https://www.notion.so/db-${databases}`,
        data_sources: [{ id }],
      });
    }
    const dataSource = path.match(/^\/data_sources\/(.+)$/)?.[1];
    if (dataSource && method === 'GET') {
      const properties = Object.fromEntries(
        Object.entries(dataSources.get(dataSource)!).map(([name, value]) => [
          name,
          { type: Object.keys(value as object)[0], ...(value as object) },
        ]),
      );
      return reply(200, { properties });
    }
    if (dataSource && method === 'PATCH') {
      const properties = dataSources.get(dataSource)!;
      for (const [name, change] of Object.entries(
        body.properties as Record<string, { name: string }>,
      )) {
        properties[change.name] = properties[name];
        delete properties[name];
      }
      return reply(200, {});
    }
    return reply(404, { message: `unexpected ${method} ${path}` });
  }) as typeof fetch;
  return { calls, dataSources, fetch: fetcher };
}

function io(overrides: Partial<SetupIo> & { answers?: string[] } = {}) {
  const answers = [
    ...(overrides.answers ?? [
      'Acme',
      `https://www.notion.so/Parent-${PARENT}`,
    ]),
  ];
  const lines: string[] = [];
  let written: string | undefined;
  const value: SetupIo = {
    token: 'secret',
    readConfig: () => undefined,
    writeConfig: (content) => (written = content),
    ask: async () => answers.shift() ?? '',
    log: (line) => lines.push(line),
    fetch: fakeNotion().fetch,
    ...overrides,
  };
  return { value, lines, written: () => written };
}

describe('setUpNotion', () => {
  test('creates the tasks, stories and backlog databases with Forest properties', async () => {
    const notion = fakeNotion();
    const run = io({ fetch: notion.fetch });

    await setUpNotion(run.value);

    const created = notion.calls.filter(
      (call) => call.method === 'POST' && call.path === '/databases',
    );
    expect(
      created.map(
        (call) =>
          (call.body!.title as { text: { content: string } }[])[0]!.text
            .content,
      ),
    ).toEqual(['Acme Tasks', 'Acme Stories', 'Acme Backlog']);
    expect(
      created.every(
        (call) =>
          (call.body!.parent as { page_id: string }).page_id === PARENT_ID,
      ),
    ).toBe(true);

    const [tasks, stories, backlog] = ['ds-1', 'ds-2', 'ds-3'].map((id) =>
      notion.dataSources.get(id)!,
    );
    expect(Object.keys(tasks!).sort()).toEqual([
      '#',
      'Name',
      'Slice',
      'Status',
      'Story',
    ]);
    expect(tasks!.Status).toEqual({
      status: {
        options: [
          { name: 'To Do', color: 'red', group: 'To-do' },
          { name: 'Doing', color: 'yellow', group: 'In progress' },
          { name: 'Done', color: 'green', group: 'Complete' },
        ],
      },
    });
    expect(tasks!.Story).toEqual({ relation: { data_source_id: 'ds-2' } });
    expect(Object.keys(stories!).sort()).toEqual([
      'Branch',
      'Date Created',
      'Name',
      'Status',
      'TASK',
      'Tasks',
    ]);
    expect(
      (
        stories!.Status as { select: { options: { name: string }[] } }
      ).select.options.map((o) => o.name),
    ).toEqual(['To Define', 'To Do', 'Doing', 'Review', 'Done 🙌']);
    expect(stories!.Tasks).toEqual({
      relation: {
        data_source_id: 'ds-1',
        type: 'dual_property',
        dual_property: {},
      },
    });
    expect(Object.keys(backlog!).sort()).toEqual([
      'Assign',
      'Date',
      'ID',
      'Name',
      'Status',
    ]);
  });

  test('writes the configuration and prints the links', async () => {
    const run = io();

    await setUpNotion(run.value);

    expect(JSON.parse(run.written()!)).toEqual({
      project: 'Acme',
      parentPage: `https://www.notion.so/Parent-${PARENT}`,
      backlog: {
        database: 'https://www.notion.so/db-3',
        dataSource: 'collection://ds-3',
        idProperty: 'ID',
      },
      stories: {
        database: 'https://www.notion.so/db-2',
        dataSource: 'collection://ds-2',
      },
      tasks: {
        database: 'https://www.notion.so/db-1',
        dataSource: 'collection://ds-1',
      },
    });
    expect(run.lines).toContain('- Stories: https://www.notion.so/db-2');
  });

  test('changes nothing on a configured project', async () => {
    const notion = fakeNotion();
    const run = io({
      fetch: notion.fetch,
      readConfig: () => JSON.stringify(configured),
    });

    await setUpNotion(run.value);

    expect(notion.calls).toEqual([]);
    expect(run.written()).toBeUndefined();
    expect(run.lines[0]).toBe('Acme is already set up: nothing changed.');
  });

  test('stops on an incomplete configuration instead of overwriting it', async () => {
    const run = io({ readConfig: () => JSON.stringify({ project: 'Acme' }) });

    await expect(setUpNotion(run.value)).rejects.toThrow(
      '.claude/notion.json is incomplete',
    );
  });

  test('without a token, says how to give access', async () => {
    const run = io({ token: undefined });

    await expect(setUpNotion(run.value)).rejects.toThrow(
      /NOTION_TOKEN is not set[\s\S]*Connections/,
    );
  });

  test.each([
    [401, 'Notion rejected NOTION_TOKEN'],
    [404, 'cannot reach the parent page'],
  ])(
    'when Notion answers %d, says how to give access',
    async (status, message) => {
      const run = io({ fetch: fakeNotion({ status }).fetch });

      await expect(setUpNotion(run.value)).rejects.toThrow(message);
      expect(run.written()).toBeUndefined();
    },
  );

  test('lists the databases already created when a later one fails', async () => {
    const run = io({ fetch: fakeNotion({ failOnDatabase: 3 }).fetch });

    const error = await setUpNotion(run.value).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SetupError);
    expect((error as Error).message).toContain('invalid schema');
    expect((error as Error).message).toContain(
      '- https://www.notion.so/db-1\n- https://www.notion.so/db-2',
    );
    expect(run.written()).toBeUndefined();
  });
});

describe('parsePageId', () => {
  test('reads the ID from a page URL or a bare ID', () => {
    expect(
      parsePageId(`https://www.notion.so/team/My-Page-${PARENT}?pvs=4`),
    ).toBe(PARENT_ID);
    expect(parsePageId(PARENT_ID)).toBe(PARENT_ID);
  });

  test('rejects anything else', () => {
    expect(() => parsePageId('not a page')).toThrow(SetupError);
  });
});

const configured = {
  project: 'Acme',
  parentPage: 'https://www.notion.so/p',
  backlog: {
    database: 'https://www.notion.so/b',
    dataSource: 'collection://b',
    idProperty: 'ID',
  },
  stories: {
    database: 'https://www.notion.so/s',
    dataSource: 'collection://s',
  },
  tasks: { database: 'https://www.notion.so/t', dataSource: 'collection://t' },
};
