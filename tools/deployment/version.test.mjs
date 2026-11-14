import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { readVersion, updateVersion, validateVersion } from './version.mjs';

const fixtures = [];
afterEach(() => {
  for (const directory of fixtures.splice(0)) fs.rmSync(directory, { recursive: true });
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'advent-version-'));
  fixtures.push(root);
  fs.mkdirSync(path.join(root, 'src/frontend'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/contract'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/frontend/package.json'), '{"name":"frontend"}');
  fs.writeFileSync(path.join(root, 'src/contract/openapi.json'), '{"openapi":"3.0.3","info":{}}');
  return root;
}

test('Given coordinated versions, When a reviewed version bump runs, Then mirrors change together and the OpenAPI format stays unchanged', () => {
  // Given an isolated source tree with separate format metadata.
  const root = fixture();
  updateVersion('1.0.0', root);

  // When the owner selects a later release version.
  updateVersion('2.10.3', root);
  const version = readVersion(root);

  // Then all application mirrors agree without changing the specification dialect.
  assert.equal(version, '2.10.3');
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'src/contract/openapi.json'))).openapi, '3.0.3');
});

test('Given a stale version mirror, When a build validates it, Then drift fails without rewriting source', () => {
  // Given a canonical version with one deliberately stale package mirror.
  const root = fixture();
  updateVersion('1.0.0', root);
  fs.writeFileSync(path.join(root, 'VERSION'), '1.0.1\n');
  const before = fs.readFileSync(path.join(root, 'src/frontend/package.json'), 'utf8');

  // When a build performs the read-only check.
  const check = () => readVersion(root);

  // Then the build rejects drift and retains the authored files.
  assert.throws(check, /drift/);
  assert.equal(fs.readFileSync(path.join(root, 'src/frontend/package.json'), 'utf8'), before);
});

for (const version of ['01.0.0', '1.0', 'v1.0.0', '1.0.0-beta', '1.0.0+build', '-1.2.3']) {
  test(`Given invalid stable version ${version}, When selected, Then validation rejects it`, () => {
    // Given a version outside the initial stable-only policy.
    const candidate = version;

    // When the version is validated.
    const check = () => validateVersion(candidate);

    // Then no source update is permitted.
    assert.throws(check, /MAJOR.MINOR.PATCH/);
  });
}
