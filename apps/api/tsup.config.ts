import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { server: 'src/server.ts' },
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  dts: false,
  noExternal: [/.*/],
  outExtension() {
    return { js: '.mjs' };
  },
});
