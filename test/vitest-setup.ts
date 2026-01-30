import { Logger } from '@nestjs/common';
import { vi } from 'vitest';

// Suppress NestJS error logs in test environment
Logger.overrideLogger(['error', 'warn']);

// Set global timeout for E2E tests
vi.setConfig({ testTimeout: 60000 });
