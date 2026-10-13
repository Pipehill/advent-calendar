// Platform package-manager adapters and the repository-local Python fallback.
import fs from 'node:fs';
import path from 'node:path';
import { packages, baseline } from './requirements.mjs';

export function linuxSupported(osReleaseContents) {
  return /^ID="?(ubuntu|debian)"?$/m.test(osReleaseContents);
}

export function installationCommand(platform, tool, available, osRelease = '') {
  const packageName = packages[platform]?.[tool];
  if (!packageName) {
    throw new Error('Unsupported prerequisite/platform: ' + tool + '/' + platform);
  }

  if (platform === 'win32') {
    requirePackageManager('winget', available,
      'Install Microsoft App Installer (WinGet), restart terminal/IDE, and rerun setup.');

    return ['winget', [
      'install',
      '--id', packageName,
      '--exact',
      '--accept-package-agreements',
      '--accept-source-agreements',
    ]];
  }

  if (platform === 'darwin') {
    requirePackageManager('brew', available,
      'Install Homebrew: https://docs.brew.sh/Installation; then rerun setup.');

    if (tool === 'docker') {
      return ['brew', ['install', '--cask', 'docker']];
    }

    return ['brew', ['install', packageName]];
  }

  if (!linuxSupported(osRelease)) {
    throw new Error(
      'Automatic installation supports Ubuntu/Debian only; '
      + 'install the reported prerequisite with your distribution package manager.',
    );
  }

  requirePackageManager('apt-get', available,
    'apt-get is missing; ask your administrator to restore apt or install the prerequisite manually.');

  const argumentsList = ['install', '-y', packageName];
  if (tool === 'python') {
    argumentsList.push('python3.14-venv');
  }

  return ['apt-get', argumentsList];
}

export function installTool(context, tool) {
  const { platform, run, available } = context;
  let osRelease = '';
  if (platform === 'linux') {
    osRelease = fs.readFileSync('/etc/os-release', 'utf8');
  }

  const [executable, argumentsList] = installationCommand(platform, tool, available, osRelease);
  console.log('Installing missing ' + tool + '; administrator approval/sudo may be required.');

  if (platform === 'linux') {
    return installLinuxTool(context, tool, executable, argumentsList);
  }

  if (platform === 'darwin' && tool === 'podman') {
    console.log(
      'Homebrew Podman is community maintained. Upstream recommends its installer; '
      + 'see tools/development/README.md for recovery.',
    );
  }

  run(executable, argumentsList, true);
}

function requirePackageManager(executable, available, remedy) {
  if (!available(executable)) {
    throw new Error(remedy);
  }
}

function runElevated(context, executable, argumentsList) {
  const { run, available } = context;
  if (process.getuid?.() === 0) {
    return run(executable, argumentsList, true);
  }

  if (!available('sudo')) {
    throw new Error('sudo is missing; ask an administrator to install the prerequisite.');
  }

  return run('sudo', [executable, ...argumentsList], true);
}

function installLinuxTool(context, tool, executable, argumentsList) {
  runElevated(context, 'apt-get', ['update']);

  if (tool === 'python') {
    const packagePolicy = context.run('apt-cache', ['policy', 'python3.14']);
    const candidateVersion = packagePolicy.stdout.match(/Candidate:\s*(\S+)/)?.[1];
    const pythonAvailableInApt = candidateVersion && candidateVersion !== '(none)';

    // Older distributions may need managed Python alongside their system Python.
    if (!pythonAvailableInApt) {
      return installManagedPython(context);
    }
  }

  runElevated(context, executable, argumentsList);
}

function installManagedPython(context) {
  const { root, run, available } = context;
  if (!available('curl')) {
    runElevated(context, 'apt-get', ['install', '-y', 'curl', 'ca-certificates']);
  }

  const uvDirectory = path.join(root, '.quality-cache', 'uv');
  const uvExecutable = path.join(uvDirectory, 'uv');
  const environment = {
    ...process.env,
    UV_INSTALL_DIR: uvDirectory,
    UV_NO_MODIFY_PATH: '1',
    UV_PYTHON_INSTALL_DIR: path.join(root, '.quality-cache', 'python'),
  };

  fs.mkdirSync(uvDirectory, { recursive: true });

  if (!fs.existsSync(uvExecutable)) {
    installLocalUv(run, uvDirectory, environment);
  }

  const version = run(uvExecutable, ['--version']);
  const expectedVersionPrefix = 'uv ' + baseline.uv + ' ';
  if (!version.stdout.startsWith(expectedVersionPrefix)) {
    throw new Error(
      'Expected uv ' + baseline.uv + ' at ' + uvExecutable + '; '
      + 'preserve or relocate the incompatible installation and rerun.',
    );
  }

  run(uvExecutable, ['python', 'install', baseline.python], true, environment);

  const pythonLocation = run(
    uvExecutable,
    ['python', 'find', '--managed-python', baseline.python],
    false,
    environment,
  );
  if (pythonLocation.status !== 0) {
    throw new Error(pythonLocation.output);
  }

  return pythonLocation.stdout.trim();
}

function installLocalUv(run, uvDirectory, environment) {
  const installerPath = path.join(uvDirectory, 'install.sh');
  const installerUrl = 'https://astral.sh/uv/' + baseline.uv + '/install.sh';

  run('curl', ['--fail', '--location', '--output', installerPath, installerUrl], true);
  run('sh', [installerPath], true, environment);
}

export function installBackendSdk({ root, platform, run }) {
  const directory = path.join(root, '.quality-cache/dotnet');
  const windows = platform === 'win32';
  const extension = windows ? 'ps1' : 'sh';
  const installer = path.join(directory, `install.${extension}`);
  fs.mkdirSync(directory, { recursive: true });
  run('curl', [
    '--fail', '--location', '--output', installer,
    `https://dot.net/v1/dotnet-install.${extension}`,
  ], true);
  let executable = 'bash';
  let args = [installer, '--version', baseline.dotnet, '--install-dir', directory, '--no-path'];
  if (windows) {
    executable = 'powershell.exe';
    args = [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', installer,
      '-Version', baseline.dotnet, '-InstallDir', directory, '-NoPath',
    ];
  }
  run(executable, args, true);
  return path.join(directory, windows ? 'dotnet.exe' : 'dotnet');
}
