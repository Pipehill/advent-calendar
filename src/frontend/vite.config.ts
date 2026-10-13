import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
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
