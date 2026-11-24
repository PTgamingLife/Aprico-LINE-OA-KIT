import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
// One number per build: baked into the scripts and published as version.json, so an old
// cached page can tell that a newer build exists (src/fresh.js).
const BUILD = Date.now();
const versionFile = {
  name: 'aprico-version-file',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: String(BUILD) }) });
  },
};
export default defineConfig({
  define: { __BUILD__: JSON.stringify(String(BUILD)) },
  plugins: [versionFile],
  base: '/Aprico-LINE-OA-KIT/',
  build: {
    rollupOptions: {
      input: Object.fromEntries(
        [
          'index',
          'build',
          'admin',
          'intro',
          'showcase',
          'member',
        ].map((n) => [n, fileURLToPath(new URL(`./${n}.html`, import.meta.url))]),
      ),
    },
  },
});
