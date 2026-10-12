import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import pkg from './package.json';

// The build is one self-contained HTML file: easy to host on GitHub Pages
// or publish as a single page, with no CDN at runtime.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  define: { __VERSION__: JSON.stringify(pkg.version) },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
});
