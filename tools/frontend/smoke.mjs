// Run browser tests separately from unit tests, against an already started stack.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const reports = fileURLToPath(new URL('../../quality-reports/frontend/', import.meta.url));
const suite = fileURLToPath(new URL('./browser/smoke.test.mjs', import.meta.url));
fs.mkdirSync(reports, { recursive: true });

const result = spawnSync(process.execPath, [
  '--test',
  '--test-reporter=spec',
  '--test-reporter-destination=stdout',
  '--test-reporter=junit',
  `--test-reporter-destination=${reports}/smoke.xml`,
  suite,
], { stdio: 'inherit' });

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
