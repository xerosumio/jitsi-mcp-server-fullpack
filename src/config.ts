import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';

dotenvConfig();

export interface JitsiConfig {
  serverUrl: string;
  displayName: string;
  jwtAppId?: string;
  jwtSecret?: string;
  recordingsDir: string;
  recordingFormat: 'webm' | 'mp4';
  port: number;
  host: string;
  headless: boolean;
  anthropicApiKey?: string;
}

export const config: JitsiConfig = {
  serverUrl: process.env.JITSI_SERVER_URL || 'https://meet.jit.si',
  displayName: process.env.JITSI_DISPLAY_NAME || 'AI Assistant',
  jwtAppId: process.env.JITSI_JWT_APP_ID,
  jwtSecret: process.env.JITSI_JWT_SECRET,
  recordingsDir: resolve(process.env.RECORDINGS_DIR || './recordings'),
  recordingFormat: (process.env.RECORDING_FORMAT as 'webm' | 'mp4') || 'webm',
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  headless: process.env.HEADLESS !== 'false',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
};

export default config;
