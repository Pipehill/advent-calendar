// Install the exact SDK privately; preserve system SDKs and their PATH selection.
import fs from 'node:fs';
import path from 'node:path';
import { installTool, installBackendSdk } from './adapters.mjs';

export function prepareBackendTools(context, detectedDotnet, runtime) {
  const { root, run } = context;
  let dotnet = detectedDotnet;
  if (!dotnet) {
    dotnet = installBackendSdk(context);
  }
  const settingsPath = path.join(root, '.quality-cache/development.json');
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  fs.writeFileSync(settingsPath, JSON.stringify({ ...settings, dotnet }, null, 2) + '\n');
  if (run(runtime, ['compose', 'version']).status !== 0) {
    installTool(context, 'compose');
    if (run(runtime, ['compose', 'version']).status !== 0) {
      throw new Error('Compose provider not visible. Refresh PATH/restart terminal and rerun setup.');
    }
  }
  // npm's executable is a batch script on Windows; invoke its JS entry point.
  const npmCli = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  const npmArgs = ['ci', '--prefix', path.join(root, 'src/contract')];
  if (fs.existsSync(npmCli)) {
    run(process.execPath, [npmCli, ...npmArgs], true);
  } else {
    run('npm', npmArgs, true);
  }
  const environment = {
    ...process.env,
    DOTNET_EXE: dotnet,
    PATH: path.dirname(dotnet) + path.delimiter + process.env.PATH,
  };
  run(process.execPath, [path.join(root, 'tools/backend/check.mjs'), 'restore'], true, environment);
}
