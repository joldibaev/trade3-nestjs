// Global setup for E2E tests to suppress error logs
import { Logger } from '@nestjs/common';

// Suppress NestJS error logs in test environment
Logger.overrideLogger(['warn']);
