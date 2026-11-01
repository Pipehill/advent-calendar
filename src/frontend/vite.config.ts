import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Bundle the imported icons so Nitro does not trace Lucide's different
  // Node/browser export targets into an incomplete standalone package.
  ssr: { noExternal: ['lucide-react'] },
  server: { port: 3000, strictPort: true },
  plugins: [
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/generated/paraglide',
      strategy: ['cookie', 'baseLocale'],
      emitTsDeclarations: true,
    }),
    tailwindcss(),
    tanstackStart(),
    react(),
  ],
});
