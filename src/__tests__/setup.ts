// Jest setup file
import { jest } from '@jest/globals';

// Set test timeout
jest.setTimeout(10000);

// Mock environment variables for tests
process.env.JITSI_SERVER_URL = 'https://meet.jit.si';
process.env.JITSI_DISPLAY_NAME = 'Test Bot';
process.env.RECORDINGS_DIR = './test-recordings';
process.env.HEADLESS = 'true';

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});
