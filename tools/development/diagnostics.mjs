// Read-only prerequisite checks: collect every failure without attempting repair.
import fs from 'node:fs';
import path from 'node:path';
import { baseline, compatible, imageName, pinnedDependencies, normalizePin } from './requirements.mjs';
import { readLocalSettings, preCommitPath } from '../quality/local-settings.mjs';
import { command, discover, repositoryRoot } from './commands.mjs';

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
  const dotnet = checkExecutable(context, {
    name: 'dotnet',
    candidates: [process.env.DOTNET_EXE, settings.dotnet,
      path.join(root, '.quality-cache/dotnet', platform === 'win32' ? 'dotnet.exe' : 'dotnet'),
      'dotnet'].filter(Boolean),
    expected: `.NET SDK ${baseline.dotnet} (global.json)`,
    remedy: 'Run setup to install the pinned SDK alongside existing installations.',
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
  const compose = run(runtime, ['compose', 'version']);
  checks.push({
    name: 'Compose provider', passed: compose.status === 0,
    detected: compose.output, expected: 'Docker Compose v2+ compatible provider for the selected runtime',
    remedy: 'Run setup or install Docker Compose; Podman delegates to an external provider.',
  });

  return { checks, node, git, dotnet, python, venvPython, runtime, image };
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

function pythonCandidates(root, settings, platform, run) {
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
    'const cp = require("child_process");',
    'const tools = [["dotnet", "10.0.401"], ["csharpier", "1.3.0"], ["sqlfluff", "4.3.0"]];',
    'const toolsReady = tools.every(([tool, version]) => {',
    '  const result = cp.spawnSync(tool, ["--version"], {encoding: "utf8"});',
    '  return result.status === 0 && result.stdout.includes(version);',
    '});',
    'if (!isLinux || !mountReadable || !toolsReady) process.exit(1);',
  ].join('\n');

  return run(runtime, [
    'run', '--rm', '--pull=never', '--network=none',
    '--entrypoint', 'node',
    '-v', root + ':/workspace:ro',
    image, '-e', probeScript,
  ]);
}

export function printDiagnosis(result) {
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
