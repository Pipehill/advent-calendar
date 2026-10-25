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

const versionCases = [
  ['node', 'v24.1.0', true], ['node', 'v20.11.0', false], ['node', 'v26.0.0', false],
  ['python', 'Python 3.14.8', true], ['python', 'Python 3.13.0', false],
  ['dotnet', '10.0.401', true], ['dotnet', '10.0.400', false],
];
for (const [tool, version, expected] of versionCases) {
  test(`Given ${tool} version ${version}, When compatibility is checked, Then it is ${expected ? 'accepted' : 'rejected'}`, () => {
    // Given a tool version and the repository's pinned compatibility policy.
    const detected = version;

    // When that detected version is checked.
    const result = compatible(tool, detected);

    // Then compatibility matches the supported baseline.
    assert.equal(result, expected);
  });
}

for (const [pin, expectedEqual] of [['pre_commit==4.6.2', true], ['pre_commit==4.6.1', false]]) {
  test(`Given package pin ${pin}, When names are normalized, Then versions remain ${expectedEqual ? 'equal' : 'distinct'}`, () => {
    // Given a differently spelled package name and the required version.
    const required = 'pre-commit==4.6.2';

    // When both dependency pins are normalized.
    const actual = normalizePin(pin);
    const expected = normalizePin(required);

    // Then package spelling is normalized without discarding version differences.
    assert.equal(actual === expected, expectedEqual);
  });
}

const runtimeCases = [
  { condition: 'a fresh clone', settings: undefined, env: {}, expected: 'docker' },
  { condition: 'a saved Podman path', settings: '{"runtime":"/path with spaces/podman"}', env: {}, expected: '/path with spaces/podman' },
  { condition: 'an explicit engine override', settings: '{"runtime":"podman"}', env: { QUALITY_CONTAINER_RUNTIME: 'docker' }, expected: 'docker' },
  { condition: 'CI with saved local settings', settings: '{"runtime":"podman"}', env: { CI: 'true' }, expected: 'docker' },
  { condition: 'CI with malformed local settings', settings: '{bad', env: { CI: 'true' }, expected: 'docker' },
];
for (const scenario of runtimeCases) {
  test(`Given ${scenario.condition}, When the runtime is selected, Then ${scenario.expected} is used`, t => {
    // Given local settings and environment variables for this selection scenario.
    const directory = fixture(t);
    if (scenario.settings !== undefined) {
      fs.writeFileSync(path.join(directory, '.quality-cache/development.json'), scenario.settings);
    }

    // When runtime selection resolves the configured precedence.
    const runtime = selectRuntime(directory, scenario.env);

    // Then the expected runtime is selected.
    assert.equal(runtime, scenario.expected);
  });
}

test('Given malformed local settings, When a local runtime is selected, Then invalid JSON is rejected', t => {
  // Given a local settings file that cannot be parsed.
  const directory = fixture(t);
  fs.writeFileSync(path.join(directory, '.quality-cache/development.json'), '{bad');

  // When local runtime selection is attempted.
  const select = () => selectRuntime(directory, {});

  // Then corrupt settings produce an error.
  assert.throws(select);
});

const installationCases = [
  ['win32', '', 'winget', 'Python.Python.3.14'],
  ['darwin', '', 'brew', 'python@3.14'],
  ['linux', 'ID=debian', 'apt-get', 'python3.14-venv'],
];
for (const [platform, release, manager, identifier] of installationCases) {
  test(`Given ${platform} with its package manager, When Python installation is planned, Then the explicit package identifier is used`, () => {
    // Given a supported platform with an available package manager.
    const available = () => true;

    // When the Python installation command is resolved.
    const command = installationCommand(platform, 'python', available, release);

    // Then it uses the platform manager and explicit pinned-major package identifier.
    assert.equal(command[0], manager);
    assert(command[1].includes(identifier));
    if (platform === 'darwin') {
      assert.deepEqual(command, ['brew', ['install', 'python@3.14']]);
    }
  });
}

for (const [platform, release] of [['win32', ''], ['darwin', ''], ['linux', 'ID=ubuntu']]) {
  test(`Given ${platform} without a package manager, When Git installation is planned, Then installation is rejected`, () => {
    // Given a supported platform whose package manager is missing.
    const unavailable = () => false;

    // When a Git installation command is requested.
    const planInstallation = () => installationCommand(platform, 'git', unavailable, release);

    // Then installation refuses to proceed without its manager.
    assert.throws(planInstallation);
  });
}

for (const [label, release, expected] of [
  ['quoted Ubuntu ID', 'ID="ubuntu"', true],
  ['Fedora with Debian ancestry', 'ID=fedora\nID_LIKE=debian', false],
]) {
  test(`Given ${label}, When Linux support is checked, Then the distribution is ${expected ? 'accepted' : 'rejected'}`, () => {
    // Given OS release contents identifying the distribution.
    const osRelease = release;

    // When native Linux installation support is checked.
    const supported = linuxSupported(osRelease);

    // Then support follows the explicit distribution policy.
    assert.equal(supported, expected);
  });
}

test('Given Arch Linux, When Git installation is planned, Then the unsupported distribution is rejected', () => {
  // Given an available package manager on an unsupported distribution.
  const release = 'ID=arch';

  // When native installation is requested.
  const planInstallation = () => installationCommand('linux', 'git', () => true, release);

  // Then unsupported Linux installation is rejected.
  assert.throws(planInstallation);
});

test('Given denied installer elevation, When Git installation is attempted, Then the failure propagates without retrying', () => {
  // Given an installer that reports denied elevation on its first invocation.
  const calls = [];
  const installationContext = {
    platform: 'win32',
    available: () => true,
    run: (executable, argumentsList) => {
      calls.push([executable, argumentsList]);
      throw new Error('elevation denied');
    },
  };


  // When Git installation is attempted.
  const install = () => installTool(installationContext, 'git');

  // Then the original failure propagates and no reset or recovery invocation is added.
  assert.throws(install, /elevation denied/);
  assert.equal(calls.length, 1);
});

for (const [runtime, platform] of [['docker', 'darwin'], ['podman', 'linux']]) {
  test(`Given unreachable ${runtime} on ${platform}, When runtime preparation is attempted, Then it fails without resetting data`, () => {
    // Given an engine that reports failure for every invocation.
    const calls = [];
    const run = (_executable, args) => {
      calls.push(args);
      return { status: 1 };
    };

    // When engine readiness is requested.
    const prepare = () => prepareRuntime(runtime, platform, run);

    // Then unavailability is reported without destructive reset commands.
    assert.throws(prepare, /unreachable/);
    assert(!calls.some(args => args.includes('reset') || args.includes('rm')));
  });
}

test('Given a stopped selected Podman machine, When Windows runtime preparation runs, Then the existing machine starts without reset', () => {
  // Given a selected existing machine whose engine becomes ready only after start.
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


  // When the Windows Podman runtime is prepared.
  prepareRuntime('podman', 'win32', runRuntimeCommand);

  // Then the selected machine is started and no initialization, deletion or reset occurs.
  assert(calls.some(args => args.join(' ') === 'machine start existing'));
  assert(!calls.some(args => args.includes('init') || args.includes('reset') || args.includes('rm')));
});

test('Given missing prerequisites, When doctor runs, Then it reports failures without installing or changing files', t => {
  // Given a clone whose prerequisite commands all report missing tools.
  clearRuntimeOverride(t);
  const directory = fixture(t);
  copyQualityRequirements(directory);

  const calls = [];
  const before = fs.readdirSync(path.join(directory, '.quality-cache'));
  const runMissingCommand = (executable, argumentsList) => {
    calls.push([executable, argumentsList]);
    return { status: 1, stdout: '', output: 'missing' };
  };


  // When doctor diagnoses the environment.
  const result = diagnose(directory, 'linux', runMissingCommand);

  // Then all missing checks are reported and no repair or file mutation is performed.
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
});

for (const [platform, executable] of [
  ['linux', 'bin/pre-commit'], ['win32', 'Scripts/pre-commit.exe'],
]) {
  test(`Given ${platform}, When the hook executable is resolved, Then its platform-specific venv path is returned`, t => {
    // Given a repository root on the selected platform.
    const directory = fixture(t);

    // When the pre-commit executable path is resolved.
    const actual = preCommitPath(directory, platform);

    // Then the path targets the correct venv executable.
    assert.equal(actual, path.join(directory, '.quality-cache/venv', executable));
  });
}

test('Given pinned quality dependencies, When the image key is calculated, Then it contains a deterministic dependency hash', () => {
  // Given the repository's quality dependency inputs.
  const directory = root;

  // When the dependency image name is calculated.
  const image = imageName(directory);

  // Then it names the quality image with a 20-character hexadecimal key.
  assert.match(image, /^localhost\/advent-quality:[a-f0-9]{20}$/);
});

test('Given an incomplete environment with working Node and engine, When doctor runs, Then failed prerequisites have recovery instructions', t => {
  // Given working core tools but stale dependencies, missing hooks, image and analyzer.
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


  // When doctor inspects the incomplete environment.
  const result = diagnose(directory, 'linux', runIncompleteEnvironment);

  // Then only the missing prerequisites fail and each explains how to recover.
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

for (const platform of ['win32', 'darwin', 'linux']) {
  test(`Given a failing analyzer on ${platform}, When readiness is checked, Then the failure identifies the version and recovery`, () => {
    // Given a compatible Node executable and an analyzer that fails MCP initialization.
    const checks = [];
    const run = () => ({ status: 1, output: 'MCP initialization failed' });
    const context = { root, platform, checks, run };

    // When doctor checks the advisory analyzer.
    checkAdvisoryAnalyzer(context, '/compatible/node');

    // Then the failed check names the pinned version, diagnostic and setup recovery.
    assert.equal(checks[0].passed, false);
    assert.match(checks[0].detected, /MCP initialization failed/);
    assert.match(checks[0].expected, /5.4.1/);
    assert.match(checks[0].remedy, /setup/);
  });

  test(`Given a failing analyzer installer on ${platform}, When setup prepares the analyzer, Then installation failure propagates`, () => {
    // Given an analyzer installation command that exits unsuccessfully.
    const calls = [];
    const run = (executable, args) => {
      calls.push({ executable, args });
      return { status: 1, output: 'MCP initialization failed' };
    };
    const context = { root, platform, checks: [], run };

    // When analyzer preparation is attempted.
    const prepare = () => prepareAdvisoryAnalyzer(context, '/compatible/node');

    // Then the installer was invoked and its failure propagates.
    assert.throws(prepare, /installation failed/);
    assert(calls[0].args[0].endsWith('install-analysis.mjs'));
  });
}

const bashTestOptions = { skip: process.platform === 'win32' };
test('Given missing Node and a Bash script path with spaces, When doctor starts, Then it fails without changing files', bashTestOptions, t => {
  // Given a copied Bash bootstrap on a PATH containing dirname but no Node.
  const directory = fixture(t);
  const scripts = path.join(directory, 'scripts with spaces');
  fs.mkdirSync(scripts);
  const bootstrapSource = path.join(root, 'tools/development/bootstrap.sh');
  const bootstrapCopy = path.join(scripts, 'bootstrap.sh');
  fs.copyFileSync(bootstrapSource, bootstrapCopy);
  const dirname = spawnSync('which', ['dirname'], { encoding: 'utf8' }).stdout.trim();
  fs.symlinkSync(dirname, path.join(directory, 'dirname'));

  // When doctor is launched from an unrelated working directory.
  const result = spawnSync('/bin/bash', [bootstrapCopy, 'doctor'], {
    cwd: '/',
    env: { PATH: directory },
    encoding: 'utf8',
  });

  // Then it reports missing Node and leaves the script directory unchanged.
  assert.equal(result.status, 1);
  assert.match(result.stderr, /FAIL Node/);
  assert.deepEqual(fs.readdirSync(scripts), ['bootstrap.sh']);
});

const powerShellTestOptions = { skip: process.platform !== 'win32' };
test('Given missing Node on Windows, When PowerShell doctor starts, Then it fails without installing dependencies', powerShellTestOptions, t => {
  // Given a PowerShell bootstrap whose PATH contains no Node executable.
  const directory = fixture(t);
  const shell = path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const doctorScript = path.join(root, 'tools/development/doctor.ps1');
  const argumentsList = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', doctorScript];

  // When doctor is launched.
  const result = spawnSync(shell, argumentsList, {
    cwd: directory,
    env: { ...process.env, PATH: directory },
    encoding: 'utf8',
  });

  // Then Node is reported missing and the dependency directory remains empty.
  assert.equal(result.status, 1);
  assert.match(`${result.stdout}${result.stderr}`, /Node is missing/);
  assert.deepEqual(fs.readdirSync(path.join(directory, '.quality-cache')), []);
});
