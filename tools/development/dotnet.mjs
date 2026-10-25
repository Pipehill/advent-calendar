// Select the contributor's SDK; dotnet/MSBuild own every command and build step.
import path from 'node:path';
import { readLocalSettings } from '../quality/local-settings.mjs';
import { command, repositoryRoot } from './commands.mjs';

try {
  const dotnet = process.env.DOTNET_EXE || readLocalSettings(repositoryRoot).dotnet || 'dotnet';
  const env = { ...process.env };
  // Windows resolves Path/PATH on process.env, but a copied object is case-sensitive.
  if (path.isAbsolute(dotnet)) env.PATH = path.dirname(dotnet) + path.delimiter + process.env.PATH;
  const result = command(dotnet, process.argv.slice(2), true, env, process.cwd());
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
