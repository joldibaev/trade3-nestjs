import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts', 'test/e2e/**/*.e2e-spec.ts', 'scripts/**/*.spec.ts'],
    environment: 'node',
    setupFiles: ['./test/vitest-setup.ts'],
    alias: {
      '@src': path.resolve(__dirname, './src'),
    },
    fileParallelism: false,
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});
