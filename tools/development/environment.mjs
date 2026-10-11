// Shared setup orchestration; diagnosis is read-only and installation stays explicit.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compatible } from './requirements.mjs';
import { installTool } from './adapters.mjs';
import { readLocalSettings, preCommitPath } from '../quality/local-settings.mjs';
import { command, discover, repositoryRoot } from './commands.mjs';
import { diagnose, printDiagnosis } from './diagnostics.mjs';

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

export function prepareAdvisoryAnalyzer({ root, run }, node) {
  const result = run(node, [path.join(root, 'tools/quality/install-analysis.mjs')], true);
  if (result.status !== 0) throw new Error('jscpd installation failed; readiness is unavailable.');
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
