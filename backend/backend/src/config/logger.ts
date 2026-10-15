import pino from 'pino';
import { env } from './env';

// Secrets, tokens and credentials must never reach the logs.
export const logger = pino({
  level: env.isProd ? 'info' : 'debug',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.newPassword',
      '*.currentPassword',
      '*.token',
      '*.accessToken',
      '*.refreshToken',
      '*.apiKey',
    ],
    censor: '[redacted]',
  },
  transport: env.isProd ? undefined : { target: 'pino-pretty', options: { colorize: true } },
});
