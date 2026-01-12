import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { MeetingTools, TOOL_DEFINITIONS } from '../tools/meeting-tools.js';
import { mockMeetingState, mockParticipants, mockChatMessages } from './mocks/puppeteer-mock.js';

// Create a mock JitsiClient
const createMockJitsiClient = () => ({
  initialize: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  joinMeeting: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  leaveMeeting: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  sendChatMessage: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  getChatHistory: jest.fn<() => Promise<typeof mockChatMessages>>().mockResolvedValue(mockChatMessages),
  getParticipants: jest.fn<() => Promise<typeof mockParticipants>>().mockResolvedValue(mockParticipants),
  getState: jest.fn<() => typeof mockMeetingState>().mockReturnValue(mockMeetingState),
  toggleMute: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
  toggleVideo: jest.fn<() => Promise<boolean>>().mockResolvedValue(false),
  startRecording: jest.fn<() => Promise<string>>().mockResolvedValue('/path/to/recording.webm'),
  stopRecording: jest.fn<() => Promise<string | null>>().mockResolvedValue('/path/to/recording.webm'),
  takeScreenshot: jest.fn<() => Promise<Buffer>>().mockResolvedValue(Buffer.from('fake-screenshot')),
  close: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  on: jest.fn(),
  emit: jest.fn(),
});

describe('MeetingTools', () => {
  let mockClient: ReturnType<typeof createMockJitsiClient>;
  let tools: MeetingTools;

  beforeEach(() => {
    mockClient = createMockJitsiClient();
    tools = new MeetingTools(mockClient as any);
  });

  describe('Tool Definitions', () => {
    it('should define all 11 tools', () => {
      expect(TOOL_DEFINITIONS).toHaveLength(11);
    });

    it('should have required properties for each tool', () => {
      for (const tool of TOOL_DEFINITIONS) {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
        expect(tool.name).toMatch(/^jitsi_/);
      }
    });

    it('should include all expected tools', () => {
      const toolNames = TOOL_DEFINITIONS.map((t) => t.name);
      expect(toolNames).toContain('jitsi_join_meeting');
      expect(toolNames).toContain('jitsi_leave_meeting');
      expect(toolNames).toContain('jitsi_send_chat');
      expect(toolNames).toContain('jitsi_get_chat_history');
      expect(toolNames).toContain('jitsi_get_participants');
      expect(toolNames).toContain('jitsi_get_meeting_state');
      expect(toolNames).toContain('jitsi_toggle_mute');
      expect(toolNames).toContain('jitsi_toggle_video');
      expect(toolNames).toContain('jitsi_start_recording');
      expect(toolNames).toContain('jitsi_stop_recording');
      expect(toolNames).toContain('jitsi_take_screenshot');
    });
  });

  describe('jitsi_join_meeting', () => {
    it('should call client.joinMeeting with correct args', async () => {
      const result = await tools.handleTool('jitsi_join_meeting', {
        roomName: 'test-room',
        displayName: 'Test Bot',
        startMuted: true,
        startWithVideoOff: true,
      });

      expect(mockClient.joinMeeting).toHaveBeenCalledWith('test-room', {
        displayName: 'Test Bot',
        startMuted: true,
        startWithVideoOff: true,
      });

      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          message: expect.stringContaining('test-room'),
        })
      );
    });

    it('should use default values for optional params', async () => {
      await tools.handleTool('jitsi_join_meeting', {
        roomName: 'test-room',
      });

      expect(mockClient.joinMeeting).toHaveBeenCalledWith('test-room', {
        displayName: undefined,
        startMuted: true,
        startWithVideoOff: true,
      });
    });
  });

  describe('jitsi_leave_meeting', () => {
    it('should call client.leaveMeeting', async () => {
      const result = await tools.handleTool('jitsi_leave_meeting', {});

      expect(mockClient.leaveMeeting).toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          message: 'Left the meeting',
        })
      );
    });
  });

  describe('jitsi_send_chat', () => {
    it('should call client.sendChatMessage with message', async () => {
      const result = await tools.handleTool('jitsi_send_chat', {
        message: 'Hello everyone!',
      });

      expect(mockClient.sendChatMessage).toHaveBeenCalledWith(
        'Hello everyone!',
        undefined
      );
      expect(result).toEqual(
        expect.objectContaining({
          success: true,
        })
      );
    });

    it('should pass recipientId for private messages', async () => {
      await tools.handleTool('jitsi_send_chat', {
        message: 'Private message',
        recipientId: 'user-123',
      });

      expect(mockClient.sendChatMessage).toHaveBeenCalledWith(
        'Private message',
        'user-123'
      );
    });
  });

  describe('jitsi_get_chat_history', () => {
    it('should return chat messages', async () => {
      const result = (await tools.handleTool('jitsi_get_chat_history', {})) as any;

      expect(mockClient.getChatHistory).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.messages).toBeDefined();
      expect(result.count).toBeDefined();
    });

    it('should respect limit parameter', async () => {
      const result = (await tools.handleTool('jitsi_get_chat_history', {
        limit: 10,
      })) as any;

      expect(result.success).toBe(true);
    });
  });

  describe('jitsi_get_participants', () => {
    it('should return participant list', async () => {
      const result = (await tools.handleTool('jitsi_get_participants', {})) as any;

      expect(mockClient.getParticipants).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.participants).toEqual(mockParticipants);
      expect(result.count).toBe(mockParticipants.length);
    });
  });

  describe('jitsi_get_meeting_state', () => {
    it('should return full meeting state', async () => {
      const result = (await tools.handleTool('jitsi_get_meeting_state', {})) as any;

      expect(mockClient.getState).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.state).toEqual(mockMeetingState);
    });
  });

  describe('jitsi_toggle_mute', () => {
    it('should toggle mute and return new state', async () => {
      const result = (await tools.handleTool('jitsi_toggle_mute', {})) as any;

      expect(mockClient.toggleMute).toHaveBeenCalledWith(undefined);
      expect(result.success).toBe(true);
      expect(result.muted).toBe(true);
    });

    it('should pass explicit mute value', async () => {
      await tools.handleTool('jitsi_toggle_mute', { mute: false });

      expect(mockClient.toggleMute).toHaveBeenCalledWith(false);
    });
  });

  describe('jitsi_toggle_video', () => {
    it('should toggle video and return new state', async () => {
      const result = (await tools.handleTool('jitsi_toggle_video', {})) as any;

      expect(mockClient.toggleVideo).toHaveBeenCalledWith(undefined);
      expect(result.success).toBe(true);
      expect(result.videoOff).toBe(false);
    });

    it('should pass explicit disable value', async () => {
      await tools.handleTool('jitsi_toggle_video', { disable: true });

      expect(mockClient.toggleVideo).toHaveBeenCalledWith(true);
    });
  });

  describe('jitsi_start_recording', () => {
    it('should start recording and return filepath', async () => {
      const result = (await tools.handleTool('jitsi_start_recording', {})) as any;

      expect(mockClient.startRecording).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.filepath).toBe('/path/to/recording.webm');
    });
  });

  describe('jitsi_stop_recording', () => {
    it('should stop recording and return filepath', async () => {
      const result = (await tools.handleTool('jitsi_stop_recording', {})) as any;

      expect(mockClient.stopRecording).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.filepath).toBe('/path/to/recording.webm');
    });

    it('should handle case when no recording was active', async () => {
      mockClient.stopRecording.mockResolvedValueOnce(null);

      const result = (await tools.handleTool('jitsi_stop_recording', {})) as any;

      expect(result.success).toBe(true);
      expect(result.filepath).toBeNull();
    });
  });

  describe('jitsi_take_screenshot', () => {
    it('should take screenshot and return base64', async () => {
      const result = (await tools.handleTool('jitsi_take_screenshot', {})) as any;

      expect(mockClient.takeScreenshot).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.imageBase64).toBeDefined();
      expect(result.mimeType).toBe('image/png');
    });
  });

  describe('Error handling', () => {
    it('should throw for unknown tool', async () => {
      await expect(
        tools.handleTool('unknown_tool', {})
      ).rejects.toThrow('Unknown tool: unknown_tool');
    });

    it('should propagate client errors', async () => {
      mockClient.joinMeeting.mockRejectedValueOnce(new Error('Connection failed'));

      await expect(
        tools.handleTool('jitsi_join_meeting', { roomName: 'test' })
      ).rejects.toThrow('Connection failed');
    });
  });
});
