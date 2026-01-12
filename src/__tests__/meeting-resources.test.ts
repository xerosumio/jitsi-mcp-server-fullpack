import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { MeetingResources, RESOURCE_DEFINITIONS } from '../resources/meeting-resources.js';
import { mockMeetingState, mockParticipants, mockChatMessages } from './mocks/puppeteer-mock.js';

// Create a mock JitsiClient
const createMockJitsiClient = () => ({
  getState: jest.fn<() => typeof mockMeetingState>().mockReturnValue(mockMeetingState),
  getParticipants: jest.fn<() => Promise<typeof mockParticipants>>().mockResolvedValue(mockParticipants),
  getChatHistory: jest.fn<() => Promise<typeof mockChatMessages>>().mockResolvedValue(mockChatMessages),
  takeScreenshot: jest.fn<() => Promise<Buffer>>().mockResolvedValue(Buffer.from('fake-screenshot')),
});

describe('MeetingResources', () => {
  let mockClient: ReturnType<typeof createMockJitsiClient>;
  let resources: MeetingResources;

  beforeEach(() => {
    mockClient = createMockJitsiClient();
    resources = new MeetingResources(mockClient as any);
  });

  describe('Resource Definitions', () => {
    it('should define all 4 resources', () => {
      expect(RESOURCE_DEFINITIONS).toHaveLength(4);
    });

    it('should have required properties for each resource', () => {
      for (const resource of RESOURCE_DEFINITIONS) {
        expect(resource).toHaveProperty('uri');
        expect(resource).toHaveProperty('name');
        expect(resource).toHaveProperty('description');
        expect(resource).toHaveProperty('mimeType');
        expect(resource.uri).toMatch(/^jitsi:\/\//);
      }
    });

    it('should include all expected resources', () => {
      const uris = RESOURCE_DEFINITIONS.map((r) => r.uri);
      expect(uris).toContain('jitsi://meeting/state');
      expect(uris).toContain('jitsi://meeting/participants');
      expect(uris).toContain('jitsi://meeting/chat');
      expect(uris).toContain('jitsi://meeting/screenshot');
    });
  });

  describe('listResources', () => {
    it('should return all resource definitions', () => {
      const list = resources.listResources();
      expect(list).toEqual(RESOURCE_DEFINITIONS);
    });
  });

  describe('jitsi://meeting/state', () => {
    it('should return meeting state as JSON', async () => {
      const result = await resources.handleResource('jitsi://meeting/state');

      expect(mockClient.getState).toHaveBeenCalled();
      expect(result.mimeType).toBe('application/json');

      const parsed = JSON.parse(result.content);
      expect(parsed.roomName).toBe(mockMeetingState.roomName);
      expect(parsed.isConnected).toBe(mockMeetingState.isConnected);
      expect(parsed.isRecording).toBe(mockMeetingState.isRecording);
      expect(parsed.participants).toHaveLength(mockMeetingState.participants.length);
      expect(parsed.chatMessages).toHaveLength(mockMeetingState.chatMessages.length);
    });
  });

  describe('jitsi://meeting/participants', () => {
    it('should return participants as JSON', async () => {
      const result = await resources.handleResource('jitsi://meeting/participants');

      expect(mockClient.getParticipants).toHaveBeenCalled();
      expect(result.mimeType).toBe('application/json');

      const parsed = JSON.parse(result.content);
      expect(parsed.participants).toEqual(mockParticipants);
      expect(parsed.count).toBe(mockParticipants.length);
    });
  });

  describe('jitsi://meeting/chat', () => {
    it('should return chat history as JSON', async () => {
      const result = await resources.handleResource('jitsi://meeting/chat');

      expect(mockClient.getChatHistory).toHaveBeenCalled();
      expect(result.mimeType).toBe('application/json');

      const parsed = JSON.parse(result.content);
      expect(parsed.messages).toHaveLength(mockChatMessages.length);
      expect(parsed.count).toBe(mockChatMessages.length);
      // Check structure
      expect(parsed.messages[0]).toHaveProperty('id');
      expect(parsed.messages[0]).toHaveProperty('sender');
      expect(parsed.messages[0]).toHaveProperty('message');
    });
  });

  describe('jitsi://meeting/screenshot', () => {
    it('should return screenshot as base64 PNG', async () => {
      const result = await resources.handleResource('jitsi://meeting/screenshot');

      expect(mockClient.takeScreenshot).toHaveBeenCalled();
      expect(result.mimeType).toBe('image/png');
      expect(result.content).toBe(Buffer.from('fake-screenshot').toString('base64'));
    });
  });

  describe('Error handling', () => {
    it('should throw for unknown resource URI', async () => {
      await expect(
        resources.handleResource('jitsi://unknown/resource')
      ).rejects.toThrow('Unknown resource: jitsi://unknown/resource');
    });

    it('should propagate client errors', async () => {
      mockClient.takeScreenshot.mockRejectedValueOnce(new Error('Screenshot failed'));

      await expect(
        resources.handleResource('jitsi://meeting/screenshot')
      ).rejects.toThrow('Screenshot failed');
    });
  });
});
