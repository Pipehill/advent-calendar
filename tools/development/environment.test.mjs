import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compatible, normalizePin, imageName, pinnedDependencies } from './requirements.mjs';
import { installationCommand, linuxSupported, installTool } from './adapters.mjs';
import { prepareRuntime, prepareAdvisoryAnalyzer } from './environment.mjs';
import { diagnose, checkAdvisoryAnalyzer } from './diagnostics.mjs';
import { selectRuntime, preCommitPath } from '../quality/local-settings.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, '../..');

// Each scenario owns a temporary directory, including paths with spaces.
function fixture(testContext) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'development test '));
  testContext.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(directory, '.quality-cache'), { recursive: true });
  return directory;
}

function copyQualityRequirements(directory) {
  const target = path.join(directory, 'tools/quality');
  fs.mkdirSync(target, { recursive: true });
  for (const name of ['Dockerfile', 'package.json', 'package-lock.json', 'requirements.txt', 'pre-commit-requirements.txt']) {
    fs.copyFileSync(path.join(root, 'tools/quality', name), path.join(target, name));
  }
}

function clearRuntimeOverride(testContext) {
  const originalOverride = process.env.QUALITY_CONTAINER_RUNTIME;
  delete process.env.QUALITY_CONTAINER_RUNTIME;

  testContext.after(() => {
    if (originalOverride) {
      process.env.QUALITY_CONTAINER_RUNTIME = originalOverride;
    }
  });
}

test('baseline versions and normalized package names reject incompatible tools', () => {
  assert(compatible('node', 'v24.1.0'));
  assert(!compatible('node', 'v20.11.0'));
  assert(!compatible('node', 'v26.0.0'));
  assert(compatible('python', 'Python 3.14.8'));
  assert(!compatible('python', 'Python 3.13.0'));
  assert(compatible('dotnet', '10.0.401'));
  assert(!compatible('dotnet', '10.0.400'));
  assert.equal(normalizePin('pre_commit==4.6.2'), normalizePin('pre-commit==4.6.2'));
  assert.notEqual(normalizePin('pre_commit==4.6.1'), normalizePin('pre-commit==4.6.2'));
});

test('runtime overrides win; CI ignores local settings; fresh clones use Docker', t => {
  const directory = fixture(t);
  assert.equal(selectRuntime(directory, {}), 'docker');
  const settingsPath = path.join(directory, '.quality-cache/development.json');
  const settings = { runtime: '/path with spaces/podman' };
  fs.writeFileSync(settingsPath, JSON.stringify(settings));
  assert.equal(selectRuntime(directory, {}), '/path with spaces/podman');
  assert.equal(selectRuntime(directory, { QUALITY_CONTAINER_RUNTIME: 'docker' }), 'docker');
  assert.equal(selectRuntime(directory, { CI: 'true' }), 'docker');
  fs.writeFileSync(settingsPath, '{bad');
  assert.throws(() => selectRuntime(directory, {}));
  assert.equal(selectRuntime(directory, { CI: 'true' }), 'docker');
});

test('platform adapters use explicit identifiers and reject missing managers/unsupported distributions', () => {
  assert.deepEqual(installationCommand('win32', 'python', () => true).slice(0, 1), ['winget']);
  assert(installationCommand('win32', 'python', () => true)[1].includes('Python.Python.3.14'));
  assert.deepEqual(installationCommand('darwin', 'python', () => true), ['brew', ['install', 'python@3.14']]);
  assert(installationCommand('linux', 'python', () => true, 'ID=debian')[1].includes('python3.14-venv'));
  const supportedPlatforms = [['win32', ''], ['darwin', ''], ['linux', 'ID=ubuntu']];
  for (const [platform, release] of supportedPlatforms) {
    assert.throws(() => installationCommand(platform, 'git', () => false, release));
  }
  assert(linuxSupported('ID="ubuntu"'));
  assert(!linuxSupported('ID=fedora\nID_LIKE=debian'));
  assert.throws(() => installationCommand('linux', 'git', () => true, 'ID=arch'));
});

test('installer failures propagate without attempting recovery/reset', () => {
  const calls = [];
  const installationContext = {
    platform: 'win32',
    available: () => true,
    run: (executable, argumentsList) => {
      calls.push([executable, argumentsList]);
      throw new Error('elevation denied');
    },
  };

  assert.throws(() => installTool(installationContext, 'git'), /elevation denied/);
  assert.equal(calls.length, 1);
});

test('native and Docker readiness failures never reset data; stopped selected Podman machine starts', () => {
  assert.throws(() => prepareRuntime('docker', 'darwin', () => ({ status: 1 })), /unreachable/);
  assert.throws(() => prepareRuntime('podman', 'linux', () => ({ status: 1 })), /unreachable/);

  const calls = [];
  let started = false;
  const runRuntimeCommand = (executable, argumentsList) => {
    calls.push(argumentsList);

    if (argumentsList[0] === 'info') {
      return { status: started ? 0 : 1 };
    }
    if (argumentsList[0] === 'compose') {
      return { status: 1, stdout: '', output: 'provider missing' };
    }
    if (argumentsList[1] === 'list') {
      const machines = [{ Name: 'existing', Running: false }];
      return { status: 0, stdout: JSON.stringify(machines) };
    }
    if (argumentsList[0] === 'system') {
      const connections = [{ Name: 'existing-root', Default: true }];
      return { status: 0, stdout: JSON.stringify(connections) };
    }
    if (argumentsList[1] === 'start') {
      started = true;
      return { status: 0 };
    }

    throw new Error('Unexpected mutation');
  };

  prepareRuntime('podman', 'win32', runRuntimeCommand);
  assert(calls.some(args => args.join(' ') === 'machine start existing'));
  assert(!calls.some(args => args.includes('init') || args.includes('reset') || args.includes('rm')));
});

test('doctor reports all missing prerequisites, runs no installation, and preserves files', t => {
  clearRuntimeOverride(t);
  const directory = fixture(t);
  copyQualityRequirements(directory);

  const calls = [];
  const before = fs.readdirSync(path.join(directory, '.quality-cache'));
  const runMissingCommand = (executable, argumentsList) => {
    calls.push([executable, argumentsList]);
    return { status: 1, stdout: '', output: 'missing' };
  };

  const result = diagnose(directory, 'linux', runMissingCommand);
  assert(result.checks.some(check => check.name === 'node' && !check.passed));
  assert(result.checks.some(check => check.name === 'Quality dependency image' && !check.passed));
  assert(!result.checks.some(check => check.passed));
  const attemptedRepair = calls.some(([, argumentsList]) => {
    return argumentsList.includes('install')
      || argumentsList.includes('start')
      || argumentsList.includes('build');
  });
  assert(!attemptedRepair);
  assert.deepEqual(fs.readdirSync(path.join(directory, '.quality-cache')), before);
  assert.equal(preCommitPath(directory, 'linux'), path.join(directory, '.quality-cache/venv/bin/pre-commit'));
  assert.equal(preCommitPath(directory, 'win32'), path.join(directory, '.quality-cache/venv/Scripts/pre-commit.exe'));
});

test('image key uses the quality runner dependency inputs', () => {
  assert.match(imageName(root), /^localhost\/advent-quality:[a-f0-9]{20}$/);
});

test('doctor distinguishes stale images, dependency versions, and missing hooks with recovery instructions', t => {
  clearRuntimeOverride(t);
  const directory = fixture(t);
  copyQualityRequirements(directory);
  fs.writeFileSync(path.join(directory, '.quality-cache/development.json'), '{"runtime":"podman"}');

  const runIncompleteEnvironment = (executable, argumentsList) => {
    const success = stdout => ({ status: 0, stdout, output: stdout });

    if (executable === 'which') {
      return success(path.join(directory, 'executables', argumentsList[0]));
    }
    if (argumentsList.includes('freeze')) {
      const installedPins = pinnedDependencies(root).filter(pin => !pin.startsWith('pre-commit=='));
      installedPins.push('pre_commit==4.6.1');
      return success(installedPins.join('\n'));
    }
    if (argumentsList[0] === 'config' || argumentsList[0] === 'image') {
      return { status: 1, stdout: '', output: 'not present' };
    }
    if (argumentsList[1] === 'doctor') {
      return { status: 1, stdout: '', output: 'jscpd missing' };
    }
    if (argumentsList[0] === 'rev-parse') {
      return success('.git/hooks/pre-commit');
    }
    if (argumentsList[0] === 'info') {
      return success('Linux');
    }
    if (argumentsList[0] === '--version') {
      if (executable.includes('node')) {
        return success('v24.14.0');
      }
      if (executable.includes('python')) {
        return success('Python 3.14.8');
      }
      return success('working version');
    }

    if (argumentsList[0] === 'compose') {
      return { status: 1, stdout: '', output: 'provider missing' };
    }
    throw new Error(`Unexpected command: ${executable} ${argumentsList.join(' ')}`);
  };

  const result = diagnose(directory, 'linux', runIncompleteEnvironment);
  const expectedFailures = [
    'Pinned hook dependencies',
    'Commit hook',
    'Quality dependency image',
    'Linux execution and mount',
    'Advisory code health analyzer',
  ];
  for (const name of expectedFailures) {
    const check = result.checks.find(item => item.name === name);
    assert.equal(check.passed, false, name);
    assert(check.remedy.includes('setup'), name);
  }
  assert(result.checks.find(item => item.name === 'node').passed);
  assert(result.checks.find(item => item.name === 'Container runtime').passed);
});

test('analyzer readiness and installation failures are reported with their recovery', () => {
  for (const platform of ['win32', 'darwin', 'linux']) {
    const checks = [];
    const calls = [];
    const run = (executable, args) => {
      calls.push({ executable, args });
      return { status: 1, output: 'MCP initialization failed' };
    };
    const context = { root, platform, checks, run };
    checkAdvisoryAnalyzer(context, '/compatible/node');
    assert.equal(checks[0].passed, false);
    assert.match(checks[0].detected, /MCP initialization failed/);
    assert.match(checks[0].expected, /5.4.1/);
    assert.throws(() => prepareAdvisoryAnalyzer(context, '/compatible/node'), /installation failed/);
    assert(calls[1].args[0].endsWith('install-analysis.mjs'));
  }
});

const bashTestOptions = { skip: process.platform === 'win32' };
test('Bash doctor bootstrap handles missing Node and paths with spaces', bashTestOptions, t => {
  const directory = fixture(t);
  const scripts = path.join(directory, 'scripts with spaces');
  fs.mkdirSync(scripts);
  const bootstrapSource = path.join(root, 'tools/development/bootstrap.sh');
  const bootstrapCopy = path.join(scripts, 'bootstrap.sh');
  fs.copyFileSync(bootstrapSource, bootstrapCopy);
  const dirname = spawnSync('which', ['dirname'], { encoding: 'utf8' }).stdout.trim();
  fs.symlinkSync(dirname, path.join(directory, 'dirname'));
  const result = spawnSync('/bin/bash', [bootstrapCopy, 'doctor'], {
    cwd: '/',
    env: { PATH: directory },
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /FAIL Node/);
  assert.deepEqual(fs.readdirSync(scripts), ['bootstrap.sh']);
});

const powerShellTestOptions = { skip: process.platform !== 'win32' };
test('PowerShell doctor bootstrap reports missing Node without installing', powerShellTestOptions, t => {
  const directory = fixture(t);
  const shell = path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const doctorScript = path.join(root, 'tools/development/doctor.ps1');
  const argumentsList = ['-NoProfile', '-NonInteractive', '-File', doctorScript];
  const result = spawnSync(shell, argumentsList, {
    cwd: directory,
    env: { ...process.env, PATH: directory },
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(`${result.stdout}${result.stderr}`, /Node is missing/);
  assert.deepEqual(fs.readdirSync(path.join(directory, '.quality-cache')), []);
});
