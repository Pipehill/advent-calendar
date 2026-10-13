// Stable Nitro 2 packages Start's fetch entry without the Nitro 3 beta Vite plugin.
import { build, copyPublicAssets, createNitro, prepare } from 'nitropack';
import path from 'node:path';

const nitro = await createNitro({
  rootDir: process.cwd(),
  preset: 'node-server',
  compatibilityDate: '2026-10-13',
  handlers: [{ route: '/**', handler: path.resolve('server/entry.mjs').replaceAll('\\', '/') }],
  publicAssets: [{ dir: path.resolve('dist/client').replaceAll('\\', '/'), maxAge: 0 }],
});
try {
  await prepare(nitro);
  await copyPublicAssets(nitro);
  await build(nitro);
} finally {
  await nitro.close();
}
