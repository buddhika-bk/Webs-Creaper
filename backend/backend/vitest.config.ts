import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      DB_USER: 'test', DB_PASSWORD: 'test', DB_NAME: 'test',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'test-secret-test-secret-test-secret-1',
      REFRESH_TOKEN_PEPPER: 'test-secret-test-secret-test-secret-2',
      DOWNLOAD_SIGNING_SECRET: 'test-secret-test-secret-test-secret-3',
      PHONE_HASH_SECRET: 'test-secret-test-secret-test-secret-4',
    },
  },
});
