import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Create mock client with proper types
interface MockState {
  roomName: string | null;
  isConnected: boolean;
  participants: any[];
  chatMessages: any[];
  isRecording: boolean;
  recordingPath: string | null;
}

const mockClientState: MockState = {
  roomName: null,
  isConnected: false,
  participants: [],
  chatMessages: [],
  isRecording: false,
  recordingPath: null,
};

const mockClient = {
  initialize: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  joinMeeting: jest.fn<(opts: any) => Promise<MockState>>().mockImplementation(async (opts: any) => {
    mockClientState.roomName = opts.roomName;
    mockClientState.isConnected = true;
    return mockClientState;
  }),
  leaveMeeting: jest.fn<() => Promise<void>>().mockImplementation(async () => {
    mockClientState.roomName = null;
    mockClientState.isConnected = false;
  }),
  sendChatMessage: jest.fn<(msg: string) => Promise<void>>().mockResolvedValue(undefined),
  getChatHistory: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
  getParticipants: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
  startRecording: jest.fn<() => Promise<string>>().mockImplementation(async () => {
    if (!mockClientState.isConnected) throw new Error('Not connected');
    if (mockClientState.isRecording) throw new Error('Already recording');
    mockClientState.isRecording = true;
    mockClientState.recordingPath = '/path/to/recording.webm';
    return mockClientState.recordingPath;
  }),
  stopRecording: jest.fn<() => Promise<string | null>>().mockImplementation(async () => {
    const path = mockClientState.recordingPath;
    mockClientState.isRecording = false;
    mockClientState.recordingPath = null;
    return path;
  }),
  toggleMute: jest.fn<(mute?: boolean) => Promise<{ muted: boolean }>>().mockResolvedValue({ muted: true }),
  toggleVideo: jest.fn<(videoOff?: boolean) => Promise<{ videoOff: boolean }>>().mockResolvedValue({ videoOff: false }),
  takeScreenshot: jest.fn<() => Promise<{ data: string; mimeType: string }>>().mockResolvedValue({ 
    data: 'base64data', 
    mimeType: 'image/png' 
  }),
  getState: jest.fn<() => MockState>().mockReturnValue(mockClientState),
  close: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  on: jest.fn(),
  off: jest.fn(),
};

// Tool handlers (simulating what the MCP server does)
const toolHandlers = {
  jitsi_join_meeting: async (args: { roomName: string; displayName?: string }) => {
    const state = await mockClient.joinMeeting(args);
    return { success: true, state };
  },
  
  jitsi_leave_meeting: async () => {
    await mockClient.leaveMeeting();
    return { success: true };
  },
  
  jitsi_send_chat: async (args: { message: string }) => {
    if (!mockClientState.isConnected) {
      throw new Error('Not connected to a meeting');
    }
    await mockClient.sendChatMessage(args.message);
    return { success: true };
  },
  
  jitsi_get_chat_history: async () => {
    const messages = await mockClient.getChatHistory();
    return { success: true, messages };
  },
  
  jitsi_get_participants: async () => {
    const participants = await mockClient.getParticipants();
    return { success: true, participants };
  },
  
  jitsi_start_recording: async () => {
    const filepath = await mockClient.startRecording();
    return { success: true, filepath };
  },
  
  jitsi_stop_recording: async () => {
    const filepath = await mockClient.stopRecording();
    return { success: true, filepath };
  },
  
  jitsi_toggle_mute: async (args?: { mute?: boolean }) => {
    const result = await mockClient.toggleMute(args?.mute);
    return { success: true, muted: result.muted };
  },
  
  jitsi_toggle_video: async (args?: { videoOff?: boolean }) => {
    const result = await mockClient.toggleVideo(args?.videoOff);
    return { success: true, videoOff: result.videoOff };
  },
  
  jitsi_take_screenshot: async () => {
    const result = await mockClient.takeScreenshot();
    return { success: true, data: result.data, mimeType: result.mimeType };
  },
  
  jitsi_get_meeting_state: async () => {
    const state = mockClient.getState();
    return { success: true, state };
  },
};

describe('MCP Meeting Tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset state
    mockClientState.roomName = null;
    mockClientState.isConnected = false;
    mockClientState.participants = [];
    mockClientState.chatMessages = [];
    mockClientState.isRecording = false;
    mockClientState.recordingPath = null;
  });

  describe('jitsi_join_meeting', () => {
    it('should join a meeting and return state', async () => {
      const result = await toolHandlers.jitsi_join_meeting({ 
        roomName: 'test-room' 
      });

      expect(result.success).toBe(true);
      expect(result.state.roomName).toBe('test-room');
      expect(result.state.isConnected).toBe(true);
      expect(mockClient.joinMeeting).toHaveBeenCalledWith({ roomName: 'test-room' });
    });

    it('should accept custom display name', async () => {
      await toolHandlers.jitsi_join_meeting({ 
        roomName: 'test-room',
        displayName: 'Custom Bot'
      });

      expect(mockClient.joinMeeting).toHaveBeenCalledWith({
        roomName: 'test-room',
        displayName: 'Custom Bot'
      });
    });
  });

  describe('jitsi_leave_meeting', () => {
    it('should leave the meeting', async () => {
      await toolHandlers.jitsi_join_meeting({ roomName: 'test-room' });
      const result = await toolHandlers.jitsi_leave_meeting();

      expect(result.success).toBe(true);
      expect(mockClient.leaveMeeting).toHaveBeenCalled();
    });
  });

  describe('jitsi_send_chat', () => {
    it('should send a chat message when connected', async () => {
      await toolHandlers.jitsi_join_meeting({ roomName: 'test-room' });
      const result = await toolHandlers.jitsi_send_chat({ 
        message: 'Hello everyone!' 
      });

      expect(result.success).toBe(true);
      expect(mockClient.sendChatMessage).toHaveBeenCalledWith('Hello everyone!');
    });

    it('should throw error when not connected', async () => {
      await expect(toolHandlers.jitsi_send_chat({ message: 'Hello' }))
        .rejects.toThrow('Not connected to a meeting');
    });
  });

  describe('jitsi_get_chat_history', () => {
    it('should return chat messages', async () => {
      mockClient.getChatHistory.mockResolvedValueOnce([
        { sender: 'User1', message: 'Hello', timestamp: new Date() }
      ]);

      const result = await toolHandlers.jitsi_get_chat_history();

      expect(result.success).toBe(true);
      expect(result.messages).toHaveLength(1);
    });
  });

  describe('jitsi_get_participants', () => {
    it('should return participant list', async () => {
      mockClient.getParticipants.mockResolvedValueOnce([
        { id: '1', displayName: 'User1', isLocal: false, hasAudio: true, hasVideo: true }
      ]);

      const result = await toolHandlers.jitsi_get_participants();

      expect(result.success).toBe(true);
      expect(result.participants).toHaveLength(1);
    });
  });

  describe('jitsi_start_recording', () => {
    it('should start recording when connected', async () => {
      await toolHandlers.jitsi_join_meeting({ roomName: 'test-room' });
      const result = await toolHandlers.jitsi_start_recording();

      expect(result.success).toBe(true);
      expect(result.filepath).toContain('recording');
    });

    it('should throw error when not connected', async () => {
      await expect(toolHandlers.jitsi_start_recording())
        .rejects.toThrow('Not connected');
    });

    it('should throw error when already recording', async () => {
      await toolHandlers.jitsi_join_meeting({ roomName: 'test-room' });
      await toolHandlers.jitsi_start_recording();

      await expect(toolHandlers.jitsi_start_recording())
        .rejects.toThrow('Already recording');
    });
  });

  describe('jitsi_stop_recording', () => {
    it('should stop recording and return filepath', async () => {
      await toolHandlers.jitsi_join_meeting({ roomName: 'test-room' });
      await toolHandlers.jitsi_start_recording();
      const result = await toolHandlers.jitsi_stop_recording();

      expect(result.success).toBe(true);
      expect(result.filepath).toContain('recording');
    });
  });

  describe('jitsi_toggle_mute', () => {
    it('should toggle mute state', async () => {
      const result = await toolHandlers.jitsi_toggle_mute();

      expect(result.success).toBe(true);
      expect(typeof result.muted).toBe('boolean');
    });
  });

  describe('jitsi_toggle_video', () => {
    it('should toggle video state', async () => {
      const result = await toolHandlers.jitsi_toggle_video();

      expect(result.success).toBe(true);
      expect(typeof result.videoOff).toBe('boolean');
    });
  });

  describe('jitsi_take_screenshot', () => {
    it('should return base64 encoded image', async () => {
      const result = await toolHandlers.jitsi_take_screenshot();

      expect(result.success).toBe(true);
      expect(result.data).toBe('base64data');
      expect(result.mimeType).toBe('image/png');
    });
  });

  describe('jitsi_get_meeting_state', () => {
    it('should return current meeting state', async () => {
      await toolHandlers.jitsi_join_meeting({ roomName: 'test-room' });
      const result = await toolHandlers.jitsi_get_meeting_state();

      expect(result.success).toBe(true);
      expect(result.state.roomName).toBe('test-room');
      expect(result.state.isConnected).toBe(true);
    });
  });
});
