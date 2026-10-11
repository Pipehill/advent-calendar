// Shared setup and diagnostics. Commands use argument arrays, never a shell.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { baseline, compatible, imageName, pinnedDependencies, normalizePin } from './requirements.mjs';
import { installTool } from './adapters.mjs';
import { readLocalSettings, preCommitPath } from '../quality/local-settings.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '../..');

// Doctor collects failures instead of stopping at the first missing prerequisite.
export function diagnose(root = repositoryRoot, platform = process.platform, run = command) {
  const settings = readLocalSettings(root);
  const checks = [];
  const context = { root, platform, run, settings, checks };

  const node = checkExecutable(context, {
    name: 'node',
    candidates: ['node'],
    expected: 'Node.js 24 LTS on committing process PATH',
    remedy: 'Install/select Node.js 24 LTS in persistent PATH; restart terminal and IDE. '
      + 'Existing incompatible installations are preserved.',
  });
  const git = checkExecutable(context, {
    name: 'git',
    candidates: ['git'],
    expected: 'working supported Git',
    remedy: 'Run setup to install Git; restart terminal/IDE after installation.',
  });
  checkAdvisoryAnalyzer(context, node);
  const python = checkExecutable(context, {
    name: 'python',
    candidates: pythonCandidates(root, settings, platform, run),
    expected: 'Python 3.14 (PATH or repository-local managed host)',
    remedy: 'Run setup to install Python 3.14. '
      + 'Disable Windows Python App Execution Aliases if they shadow Python.',
  });

  const venvPython = virtualEnvironmentPython(root, platform);
  checkPythonEnvironment(context, venvPython);
  checkPinnedDependencies(context, venvPython);
  checkPreCommitExecutable(context);

  if (git) {
    checkCommitHook(context, git, venvPython);
  }

  const runtime = findRuntime(context);
  const image = imageName(root);
  checkContainerRuntime(context, runtime, image);

  return { checks, node, git, python, venvPython, runtime, image };
}

// Keep setup's work order visible here; each phase owns its preparation details.
export function setup(root = repositoryRoot, platform = process.platform, run = command) {
  let state = diagnose(root, platform, run);

  // Selecting a different Node installation is an explicit developer choice.
  if (!state.node) {
    throw new Error(
      'Node on PATH is incompatible. Select Node.js 24 LTS, '
      + 'restart terminal/IDE, and rerun setup.',
    );
  }

  const context = {
    root,
    platform,
    run,
    available: executable => Boolean(discover(executable, platform, run)),
  };

  installMissingHostTools(context, state);
  state = diagnose(root, platform, run);

  if (!state.git || !state.python) {
    throw new Error(
      'Installed tools are not visible. Restart terminal/IDE '
      + 'to refresh persistent PATH and rerun setup.',
    );
  }

  const runtimePath = prepareSelectedRuntime(context, state.runtime);
  saveSettings(root, { runtime: runtimePath, python: state.python });

  preparePythonEnvironment(context, state);
  prepareAdvisoryAnalyzer(context, state.node);
  prepareQualityImage(context, runtimePath);
  installCommitHooks(context, state.git);

  return printDiagnosis(diagnose(root, platform, run));
}

export function checkAdvisoryAnalyzer({ root, run, checks }, node) {
  const expected = `jscpd ${baseline.jscpd}, MCP handshake/refresh and CLI health on authored source`;
  let result = { status: 1, output: 'Compatible Node unavailable' };
  if (node) {
    result = run(node, [path.join(root, 'tools/quality/health.mjs'), 'doctor']);
  }
  checks.push({
    name: 'Advisory code health analyzer', passed: result.status === 0,
    detected: result.output || result.stdout || 'No readiness evidence', expected,
    remedy: 'Run setup to install the lockfile-pinned analyzer; check platform binary, MCP and source scope diagnostics.',
  });
}

export function prepareAdvisoryAnalyzer({ root, run }, node) {
  const result = run(node, [path.join(root, 'tools/quality/install-analysis.mjs')], true);
  if (result.status !== 0) throw new Error('jscpd installation failed; readiness is unavailable.');
}

// Executable discovery and command execution.
export function command(
  executable,
  argumentsList,
  inheritOutput = false,
  environment = process.env,
  root = repositoryRoot,
) {
  const result = spawnSync(executable, argumentsList, {
    cwd: root,
    env: environment,
    encoding: 'utf8',
    stdio: inheritOutput ? 'inherit' : 'pipe',
    maxBuffer: 16 * 1024 * 1024,
    timeout: inheritOutput ? undefined : 60000,
  });
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const executionError = result.error?.message || '';
  const output = (stdout + stderr + executionError).trim();

  if (inheritOutput && result.status !== 0) {
    const failure = result.status ?? result.error?.message;
    throw new Error(
      executable + ' failed (' + failure + '). '
      + 'Resolve privileges, connectivity or pending reboot and rerun setup.',
    );
  }

  return { status: result.status, stdout, output };
}

export function discover(executable, platform = process.platform, run = command) {
  if (path.isAbsolute(executable)) {
    return fs.existsSync(executable) ? executable : undefined;
  }

  const discoveryCommand = platform === 'win32' ? 'where.exe' : 'which';
  const result = run(discoveryCommand, [executable]);
  if (result.status !== 0) {
    return undefined;
  }

  // The first PATH match is also the executable a terminal or IDE would invoke.
  return result.stdout.trim().split(/\r?\n/)[0];
}

export function pythonCandidates(root, settings = {}, platform = process.platform, run = command) {
  const defaultPython = platform === 'win32' ? 'python' : 'python3.14';
  const candidates = [settings.python, defaultPython, 'python3'];

  if (platform === 'win32') {
    const launcher = run('py', ['-3.14', '-c', 'import sys; print(sys.executable)']);
    if (launcher.status === 0) {
      candidates.unshift(launcher.stdout.trim());
    }
  }

  // An existing venv records its base interpreter even when PATH contains aliases.
  const configurationPath = path.join(root, '.quality-cache/venv/pyvenv.cfg');
  if (fs.existsSync(configurationPath)) {
    const configuration = fs.readFileSync(configurationPath, 'utf8');
    const pythonHome = configuration.match(/^home\s*=\s*(.+)$/m)?.[1].trim();

    if (pythonHome) {
      const executableName = platform === 'win32' ? 'python.exe' : 'python3.14';
      candidates.push(path.join(pythonHome, executableName));
    }
  }

  return [...new Set(candidates.filter(Boolean))];
}

function virtualEnvironmentPython(root, platform) {
  const executablePath = platform === 'win32' ? 'Scripts/python.exe' : 'bin/python';
  return path.join(root, '.quality-cache/venv', executablePath);
}

// Individual readiness checks never install or repair tools.
function checkExecutable(context, requirement) {
  const { platform, run, checks } = context;
  const { name, candidates, expected, remedy } = requirement;
  const attempts = [];

  for (const candidate of candidates) {
    const executable = discover(candidate, platform, run);
    if (!executable) {
      continue;
    }

    const result = run(executable, ['--version']);
    attempts.push(executable + ': ' + result.output);

    if (result.status === 0 && compatible(name, result.stdout)) {
      checks.push({ name, passed: true, detected: attempts.join('; '), expected, remedy });
      return executable;
    }
  }

  checks.push({
    name,
    passed: false,
    detected: attempts.join('; ') || 'missing',
    expected,
    remedy,
  });
}

function checkPythonEnvironment({ run, checks }, venvPython) {
  const version = run(venvPython, ['--version']);
  checks.push({
    name: 'Python environment',
    passed: version.status === 0 && compatible('python', version.stdout),
    detected: venvPython + ': ' + version.output,
    expected: 'repository-local Python 3.14 venv',
    remedy: 'Run setup; an incompatible existing venv is preserved and must be relocated manually.',
  });
}

function checkPinnedDependencies({ root, run, checks }, venvPython) {
  const freeze = run(venvPython, ['-m', 'pip', 'freeze', '--all']);
  const installedPins = freeze.stdout.split(/\r?\n/).map(normalizePin);
  const installedDependencies = new Set(installedPins);
  const missingDependencies = pinnedDependencies(root).filter(
    pin => !installedDependencies.has(normalizePin(pin)),
  );

  let detected = 'all pinned requirements installed';
  if (missingDependencies.length > 0) {
    detected = 'missing/mismatched: ' + missingDependencies.join(', ');
  }

  checks.push({
    name: 'Pinned hook dependencies',
    passed: freeze.status === 0 && missingDependencies.length === 0,
    detected,
    expected: 'tools/quality/pre-commit-requirements.txt',
    remedy: 'Run setup to install the pinned requirements.',
  });
}

function checkPreCommitExecutable({ root, platform, run, checks }) {
  const executable = preCommitPath(root, platform);
  const version = run(executable, ['--version']);
  checks.push({
    name: 'pre-commit',
    passed: version.status === 0,
    detected: executable + ': ' + version.output,
    expected: 'usable repository-local pre-commit executable',
    remedy: 'Run setup to prepare hook dependencies.',
  });
}

function checkCommitHook({ root, run, checks }, git, venvPython) {
  const hookConfiguration = run(git, ['config', '--get', 'core.hooksPath']);
  const hookLocation = run(git, ['rev-parse', '--git-path', 'hooks/pre-commit']);
  const hookPath = path.resolve(root, hookLocation.stdout.trim() || '.git/hooks/pre-commit');
  const hookContents = fs.existsSync(hookPath) ? fs.readFileSync(hookPath, 'utf8') : '';
  const interpreter = hookContents.match(/^INSTALL_PYTHON=['"](.+)['"]$/m)?.[1];
  const interpreterVersion = interpreter && run(interpreter, ['-m', 'pre_commit', '--version']);

  const interpreterWorks = interpreterVersion?.status === 0
    && path.resolve(interpreter) === path.resolve(venvPython);
  const usesDefaultHooksDirectory = hookConfiguration.status !== 0;
  const generatedByPreCommit = hookContents.includes('138fd403232d2ddd5efb44317e38bf03');
  const configuredHookPath = hookConfiguration.stdout.trim() || '(default)';

  checks.push({
    name: 'Commit hook',
    passed: Boolean(usesDefaultHooksDirectory && generatedByPreCommit && interpreterWorks),
    detected: `${hookPath}; core.hooksPath=${configuredHookPath}; Python=${interpreter || '(missing)'}`,
    expected: 'pre-commit hook using this clone venv and default hooks directory',
    remedy: 'Run setup. Resolve custom core.hooksPath yourself; '
      + 'setup preserves it and refuses to override it.',
  });
}

function findRuntime({ settings, platform, run }) {
  const configuredRuntime = process.env.QUALITY_CONTAINER_RUNTIME || settings.runtime;
  if (configuredRuntime) {
    return discover(configuredRuntime, platform, run) || configuredRuntime;
  }

  // Prefer a reachable existing engine before considering a new installation.
  const runtimeCandidates = ['podman', 'docker'];
  const reachableRuntime = runtimeCandidates.find(executable => {
    return discover(executable, platform, run) && run(executable, ['info']).status === 0;
  });
  const installedRuntime = reachableRuntime
    || runtimeCandidates.find(executable => discover(executable, platform, run));
  const selectedRuntime = installedRuntime || 'podman';

  return discover(selectedRuntime, platform, run) || selectedRuntime;
}

function checkContainerRuntime(context, runtime, image) {
  const { root, settings, run, checks } = context;
  const version = run(runtime, ['--version']);
  const connection = run(runtime, ['info']);
  const connectionDescription = connection.status === 0 ? 'connected' : connection.output;

  checks.push({
    name: 'Container runtime',
    passed: version.status === 0 && connection.status === 0,
    detected: runtime + ': ' + version.output + '; ' + connectionDescription,
    expected: 'reachable Docker or Podman Linux engine',
    remedy: 'Start Docker with Linux containers, or run podman machine start on Windows/macOS. '
      + 'Check virtualization/WSL2 and reboot if required. Never reset an existing machine.',
  });

  const override = process.env.QUALITY_CONTAINER_RUNTIME;
  const persistentRuntime = override ? 'environment override: ' + override : settings.runtime || 'not saved';
  checks.push({
    name: 'Persistent runtime',
    passed: Boolean(override || settings.runtime),
    detected: persistentRuntime,
    expected: 'runtime available to subsequent terminals and IDE hooks',
    remedy: 'Run setup to save a resolved runtime path in .quality-cache/development.json. '
      + 'Environment overrides must also exist in the committing process.',
  });

  let imageInspection = { status: 1, output: 'runtime unavailable' };
  if (connection.status === 0) {
    imageInspection = run(runtime, ['image', 'inspect', image]);
  }

  const imageDescription = imageInspection.status === 0 ? 'present' : imageInspection.output;
  checks.push({
    name: 'Quality dependency image',
    passed: imageInspection.status === 0,
    detected: image + ': ' + imageDescription,
    expected: 'current image derived from pinned dependency files',
    remedy: 'Run setup or node tools/quality/run.mjs setup with the selected runtime.',
  });

  let execution = { status: 1, output: 'current dependency image unavailable' };
  if (imageInspection.status === 0) {
    execution = checkLinuxExecution(root, runtime, image, run);
  }

  checks.push({
    name: 'Linux execution and mount',
    passed: execution.status === 0,
    detected: execution.output || 'Linux container and repository mount readable',
    expected: 'actual offline Linux execution with repository mounted read-only',
    remedy: 'Start/fix runtime and file sharing, then rerun setup. Check repository mount permissions.',
  });
}

function checkLinuxExecution(root, runtime, image, run) {
  const probeScript = [
    'const fs = require("fs");',
    'const isLinux = process.platform === "linux";',
    'const mountReadable = fs.existsSync("/workspace/.pre-commit-config.yaml");',
    'if (!isLinux || !mountReadable) process.exit(1);',
  ].join('\n');

  return run(runtime, [
    'run', '--rm', '--pull=never', '--network=none',
    '--entrypoint', 'node',
    '-v', root + ':/workspace:ro',
    image, '-e', probeScript,
  ]);
}

function printDiagnosis(result) {
  for (const check of result.checks) {
    const status = check.passed ? 'PASS' : 'FAIL';
    console.log(`${status} ${check.name}: ${check.detected}\n  Expected: ${check.expected}`);

    if (!check.passed) {
      console.log('  Remedy: ' + check.remedy);
    }
  }

  const ready = result.checks.every(check => check.passed);
  if (ready) {
    console.log('Ready for quality checks and commits.');
    return 0;
  }

  console.log('Not ready. Resolve the failures and rerun setup/doctor.');
  return 1;
}

// Setup phases. Only these functions install tools or write local settings.
function installMissingHostTools(context, state) {
  if (!state.git) {
    installTool(context, 'git');
  }

  if (!state.python) {
    console.log('No compatible Python found; installing Python 3.14 alongside existing Python versions.');
    const managedPython = installTool(context, 'python');

    if (managedPython) {
      saveSettings(context.root, { python: managedPython });
    }
  }
}

function prepareSelectedRuntime(context, runtime) {
  const { platform, run } = context;

  if (!discover(runtime, platform, run)) {
    const runtimeName = path.basename(runtime).replace(/\.exe$/i, '');
    if (!['podman', 'docker'].includes(runtimeName)) {
      throw new Error(
        'Selected runtime ' + runtime + ' is missing; correct QUALITY_CONTAINER_RUNTIME or local settings.',
      );
    }

    installTool(context, runtimeName);
    if (!discover(runtime, platform, run)) {
      throw new Error('Runtime installation requires a terminal/IDE restart. Rerun setup afterward.');
    }
  }

  prepareRuntime(runtime, platform, run);
  return discover(runtime, platform, run);
}

function preparePythonEnvironment({ root, run }, state) {
  const environmentDirectory = path.join(root, '.quality-cache/venv');

  if (fs.existsSync(environmentDirectory)) {
    const version = run(state.venvPython, ['--version']);
    if (version.status !== 0 || !compatible('python', version.stdout)) {
      throw new Error(
        'Existing venv is unusable/incompatible; '
        + 'relocate .quality-cache/venv manually, then rerun setup.',
      );
    }
  } else {
    run(state.python, ['-m', 'venv', environmentDirectory], true);
  }

  const requirementsPath = path.join(root, 'tools/quality/pre-commit-requirements.txt');
  run(state.venvPython, ['-m', 'pip', 'install', '-r', requirementsPath], true);
}

function prepareQualityImage({ root, run }, runtimePath) {
  const runnerPath = path.join(root, 'tools/quality/run.mjs');
  const environment = { ...process.env, QUALITY_CONTAINER_RUNTIME: runtimePath };
  run(process.execPath, [runnerPath, 'setup'], true, environment);
}

function installCommitHooks({ root, platform, run }, git) {
  const hookConfiguration = run(git, ['config', '--get', 'core.hooksPath']);
  if (hookConfiguration.status === 0) {
    throw new Error(
      'Custom core.hooksPath is preserved. Resolve it explicitly before installing pre-commit hooks.',
    );
  }

  run(preCommitPath(root, platform), ['install', '--install-hooks'], true);
}

function saveSettings(root, values) {
  const settingsPath = path.join(root, '.quality-cache/development.json');
  const settings = { ...readLocalSettings(root), ...values };
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}

export function prepareRuntime(runtime, platform, run) {
  if (run(runtime, ['info']).status === 0) {
    return;
  }

  const isPodman = /podman(?:\.exe)?$/i.test(runtime);
  if (!isPodman || platform === 'linux') {
    throw new Error(
      'Runtime unreachable. Start Docker/Linux engine and check permissions; '
      + 'setup does not reset existing runtimes.',
    );
  }

  const machineListing = run(runtime, ['machine', 'list', '--format', 'json']);
  if (machineListing.status !== 0) {
    throw new Error(machineListing.output);
  }

  const machines = JSON.parse(machineListing.stdout);
  if (machines.length === 0) {
    run(runtime, ['machine', 'init'], true);
    run(runtime, ['machine', 'start'], true);
  } else {
    startSelectedMachine(runtime, machines, run);
  }

  if (run(runtime, ['info']).status !== 0) {
    throw new Error(
      'Podman is still unreachable. Check WSL2/virtualization, elevation and pending reboot; '
      + 'rerun setup after recovery.',
    );
  }
}

function startSelectedMachine(runtime, machines, run) {
  const connectionListing = run(runtime, ['system', 'connection', 'list', '--format', 'json']);
  if (connectionListing.status !== 0) {
    throw new Error(connectionListing.output);
  }

  const connections = JSON.parse(connectionListing.stdout);
  const defaultConnection = connections.find(connection => connection.Default);
  const selectedMachine = machines.find(machine => {
    if (!defaultConnection) {
      return false;
    }

    const rootConnectionName = machine.Name + '-root';
    return defaultConnection.Name === machine.Name || defaultConnection.Name === rootConnectionName;
  });

  if (!selectedMachine || selectedMachine.Running) {
    throw new Error(
      'Existing Podman connection is unreachable. Check podman system connection list and machine list; '
      + 'setup will not change/reset your connection.',
    );
  }

  run(runtime, ['machine', 'start', selectedMachine.Name], true);
}

function main() {
  try {
    const mode = process.argv[2];
    if (mode === 'setup') {
      return setup();
    }
    if (mode === 'doctor') {
      return printDiagnosis(diagnose());
    }

    throw new Error('Usage: node tools/development/environment.mjs setup|doctor');
  } catch (error) {
    console.error('FAIL: ' + error.message);
    return 1;
  }
}

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  process.exitCode = main();
}
