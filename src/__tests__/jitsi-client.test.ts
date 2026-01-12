import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { JitsiClient, MeetingState, ChatMessage, Participant } from '../lib/jitsi-client.js';

/**
 * JitsiClient Unit Tests
 *
 * These tests verify the JitsiClient's state management and behavior.
 * Integration tests with real browser are skipped by default.
 */

// Skip browser tests by default (they launch a real browser)
const RUN_BROWSER_TESTS = process.env.RUN_BROWSER_TESTS === 'true';
const conditionalIt = RUN_BROWSER_TESTS ? it : it.skip;

describe('JitsiClient', () => {
  let client: JitsiClient;

  beforeEach(() => {
    client = new JitsiClient();
  });

  afterEach(async () => {
    try {
      await client.close();
    } catch {
      // Ignore
    }
  });

  describe('Feature: State Management', () => {
    it('should have correct initial state', () => {
      const state = client.getState();

      expect(state).toEqual({
        roomName: null,
        isConnected: false,
        participants: [],
        chatMessages: [],
        isRecording: false,
        recordingPath: null,
      });
    });

    it('should be an EventEmitter', () => {
      expect(typeof client.on).toBe('function');
      expect(typeof client.emit).toBe('function');
    });
  });

  describe('Feature: Pre-initialization errors', () => {
    it('should throw when joining without initialization', async () => {
      await expect(client.joinMeeting('test-room')).rejects.toThrow(
        'Client not initialized'
      );
    });

    it('should throw when taking screenshot without initialization', async () => {
      await expect(client.takeScreenshot()).rejects.toThrow(
        'Client not initialized'
      );
    });
  });

  describe('Feature: Meeting Management (Browser Tests)', () => {
    conditionalIt('should initialize and join a meeting', async () => {
      await client.initialize();
      await client.joinMeeting('test-room-' + Date.now());

      const state = client.getState();
      expect(state.isConnected).toBe(true);
      expect(state.roomName).toMatch(/test-room/);
    }, 60000);

    conditionalIt('should leave a meeting', async () => {
      await client.initialize();
      await client.joinMeeting('test-room-' + Date.now());
      expect(client.getState().isConnected).toBe(true);

      await client.leaveMeeting();
      expect(client.getState().isConnected).toBe(false);
      expect(client.getState().roomName).toBeNull();
    }, 60000);

    conditionalIt('should emit events when joining and leaving', async () => {
      const joinHandler = jest.fn();
      const leftHandler = jest.fn();

      client.on('joined', joinHandler);
      client.on('left', leftHandler);

      await client.initialize();
      await client.joinMeeting('test-room-' + Date.now());

      expect(joinHandler).toHaveBeenCalledWith(
        expect.objectContaining({ roomName: expect.any(String) })
      );

      await client.leaveMeeting();
      expect(leftHandler).toHaveBeenCalled();
    }, 60000);
  });

  describe('Feature: Chat (Browser Tests)', () => {
    conditionalIt('should send chat messages', async () => {
      await client.initialize();
      await client.joinMeeting('test-room-' + Date.now());

      await client.sendChatMessage('Hello from test!');

      const state = client.getState();
      expect(state.chatMessages.some((m) => m.message === 'Hello from test!')).toBe(
        true
      );
    }, 60000);

    conditionalIt('should throw when sending chat without being in a meeting', async () => {
      await client.initialize();

      await expect(client.sendChatMessage('Hello')).rejects.toThrow(
        'Not connected to a meeting'
      );
    });
  });

  describe('Feature: Recording (Browser Tests)', () => {
    conditionalIt('should start and stop recording', async () => {
      await client.initialize();
      await client.joinMeeting('test-room-' + Date.now());

      const filepath = await client.startRecording();
      expect(client.getState().isRecording).toBe(true);
      expect(filepath).toMatch(/recording.*\.webm$/);

      await client.stopRecording();
      expect(client.getState().isRecording).toBe(false);
    }, 90000);

    conditionalIt('should throw when already recording', async () => {
      await client.initialize();
      await client.joinMeeting('test-room-' + Date.now());

      await client.startRecording();
      await expect(client.startRecording()).rejects.toThrow('Already recording');

      await client.stopRecording();
    }, 90000);

    conditionalIt('should throw when starting recording without being in a meeting', async () => {
      await client.initialize();

      await expect(client.startRecording()).rejects.toThrow(
        'Not connected to a meeting'
      );
    });
  });

  describe('Feature: Audio/Video Controls (Browser Tests)', () => {
    conditionalIt('should toggle mute', async () => {
      await client.initialize();
      await client.joinMeeting('test-room-' + Date.now());

      const muted = await client.toggleMute();
      expect(typeof muted).toBe('boolean');
    }, 60000);

    conditionalIt('should toggle video', async () => {
      await client.initialize();
      await client.joinMeeting('test-room-' + Date.now());

      const videoOff = await client.toggleVideo();
      expect(typeof videoOff).toBe('boolean');
    }, 60000);

    conditionalIt('should throw when toggling mute without being in a meeting', async () => {
      await client.initialize();

      await expect(client.toggleMute()).rejects.toThrow(
        'Not connected to a meeting'
      );
    });
  });

  describe('Feature: Screenshot (Browser Tests)', () => {
    conditionalIt('should take a screenshot', async () => {
      await client.initialize();
      await client.joinMeeting('test-room-' + Date.now());

      const screenshot = await client.takeScreenshot();
      expect(Buffer.isBuffer(screenshot)).toBe(true);
      expect(screenshot.length).toBeGreaterThan(0);
    }, 60000);
  });

  describe('Feature: Cleanup', () => {
    conditionalIt('should close browser on close()', async () => {
      await client.initialize();
      await client.close();

      // Trying to join should now fail
      await expect(client.joinMeeting('test')).rejects.toThrow();
    }, 30000);

    it('should handle close() when not initialized', async () => {
      await expect(client.close()).resolves.not.toThrow();
    });
  });
});

// Type tests (compile-time checks)
describe('JitsiClient Types', () => {
  it('should export correct types', () => {
    // These are compile-time type checks
    const state: MeetingState = {
      roomName: null,
      isConnected: false,
      participants: [],
      chatMessages: [],
      isRecording: false,
      recordingPath: null,
    };

    const message: ChatMessage = {
      id: 'test',
      sender: 'Test',
      message: 'Hello',
      timestamp: new Date(),
      isPrivate: false,
    };

    const participant: Participant = {
      id: 'test',
      displayName: 'Test User',
      isLocal: false,
      hasAudio: true,
      hasVideo: true,
    };

    expect(state).toBeDefined();
    expect(message).toBeDefined();
    expect(participant).toBeDefined();
  });
});
