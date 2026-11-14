import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildImages, command, dotnet, startStack } from './smoke-runtime.mjs';
import { verifyBrowser } from './smoke-browser.mjs';
import { verifyDatabase } from './smoke-database.mjs';

// No production configuration is consumed: this harness owns every credential,
// container and volume it creates, and deliberately provisions isolated fixtures.
buildImages();
command(dotnet, ['restore', 'tools/frontend/browser-fixture/BrowserFixture.csproj', '--locked-mode'], { stdio: 'inherit' });
command(dotnet, ['build', 'tools/frontend/browser-fixture/BrowserFixture.csproj', '-c', 'Release', '--no-restore'], { stdio: 'inherit' });
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'advent-production-'));
let stack;
try {
  stack = await startStack(directory);
  const { calendarId } = await verifyBrowser(stack);
  await verifyDatabase(stack, directory, calendarId);
} finally {
  await stack?.cleanup();
  fs.rmSync(directory, { recursive: true });
}
