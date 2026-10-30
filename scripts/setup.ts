import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { SetupError, setUpNotion } from './notion-setup.ts';

const configPath = join(import.meta.dir, '..', '.claude', 'notion.json');

try {
  await setUpNotion({
    token: process.env.NOTION_TOKEN,
    readConfig: () =>
      existsSync(configPath) ? readFileSync(configPath, 'utf8') : undefined,
    writeConfig: (content) => {
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(configPath, content);
    },
    // Bun's prompt() reads one line at a time, from a terminal or a pipe.
    ask: async (question) => prompt(question) ?? '',
    log: (line) => console.log(line),
    fetch,
  });
} catch (error) {
  if (!(error instanceof SetupError)) throw error;
  console.error(error.message);
  process.exitCode = 1;
}
