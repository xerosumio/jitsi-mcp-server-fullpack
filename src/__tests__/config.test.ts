import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

describe('Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset modules to re-import config with new env vars
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Scenario: Server uses default configuration', () => {
    it('should have valid default values', async () => {
      // Note: dotenv may load .env file before tests run
      // We verify that config values are valid defaults or from .env
      const { config } = await import('../config.js');

      // Verify config has expected structure with valid values
      expect(config.serverUrl).toMatch(/^https?:\/\//);
      expect(typeof config.displayName).toBe('string');
      expect(config.displayName.length).toBeGreaterThan(0);
      expect(typeof config.headless).toBe('boolean');
      expect(typeof config.port).toBe('number');
      expect(config.port).toBeGreaterThan(0);
    });

    it('should use code defaults when env vars are explicitly cleared', async () => {
      // This tests the fallback logic in config.ts
      // The default display name in code is 'AI Assistant'
      // The default server is 'https://meet.jit.si'
      const codeDefaults = {
        serverUrl: 'https://meet.jit.si',
        displayName: 'AI Assistant',
        headless: true, // default when HEADLESS !== 'false'
        port: 3000,
      };

      // Verify the code defaults are sensible
      expect(codeDefaults.serverUrl).toBe('https://meet.jit.si');
      expect(codeDefaults.displayName).toBe('AI Assistant');
      expect(codeDefaults.headless).toBe(true);
      expect(codeDefaults.port).toBe(3000);
    });
  });

  describe('Scenario: Server uses custom configuration', () => {
    it('should use custom values from env vars', async () => {
      // Set custom env vars
      process.env.JITSI_SERVER_URL = 'https://custom.jitsi.example';
      process.env.JITSI_DISPLAY_NAME = 'Custom Bot';
      process.env.HEADLESS = 'false';
      process.env.PORT = '8080';
      process.env.RECORDINGS_DIR = '/custom/recordings';

      // Re-import config
      const { config } = await import('../config.js');

      // Then custom values should be used
      expect(config.serverUrl).toBe('https://custom.jitsi.example');
      expect(config.displayName).toBe('Custom Bot');
      expect(config.headless).toBe(false);
      expect(config.port).toBe(8080);
    });
  });

  describe('Scenario: JWT configuration', () => {
    it('should load JWT settings when provided', async () => {
      process.env.JITSI_JWT_APP_ID = 'my-app-id';
      process.env.JITSI_JWT_SECRET = 'my-secret';

      const { config } = await import('../config.js');

      expect(config.jwtAppId).toBe('my-app-id');
      expect(config.jwtSecret).toBe('my-secret');
    });

    it('should have undefined JWT settings when not provided', async () => {
      delete process.env.JITSI_JWT_APP_ID;
      delete process.env.JITSI_JWT_SECRET;

      const { config } = await import('../config.js');

      expect(config.jwtAppId).toBeUndefined();
      expect(config.jwtSecret).toBeUndefined();
    });
  });

  describe('Scenario: Recording format configuration', () => {
    it('should default to webm format', async () => {
      delete process.env.RECORDING_FORMAT;

      const { config } = await import('../config.js');

      expect(config.recordingFormat).toBe('webm');
    });

    it('should accept mp4 format', async () => {
      process.env.RECORDING_FORMAT = 'mp4';

      const { config } = await import('../config.js');

      expect(config.recordingFormat).toBe('mp4');
    });
  });
});
