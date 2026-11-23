import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['test/**/*.test.ts'],
          exclude: ['test/web/**'],
        },
      },
      {
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['test/web/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
});
