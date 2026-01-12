import { jest } from '@jest/globals';

// Mock CDP Session
export const createMockCDPSession = () => ({
  send: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  on: jest.fn(),
  off: jest.fn(),
  detach: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
});

// Mock Page
export const createMockPage = () => {
  const mockPage = {
    goto: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    waitForSelector: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    evaluate: jest.fn<() => Promise<any>>().mockResolvedValue(undefined),
    exposeFunction: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    setViewport: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    screenshot: jest.fn<() => Promise<Buffer>>().mockResolvedValue(Buffer.from('fake-screenshot')),
    createCDPSession: jest.fn<() => Promise<ReturnType<typeof createMockCDPSession>>>().mockResolvedValue(createMockCDPSession()),
    on: jest.fn(),
    off: jest.fn(),
    close: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };

  return mockPage;
};

// Mock Browser Context
export const createMockBrowserContext = () => ({
  overridePermissions: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
});

// Mock Browser
export const createMockBrowser = () => {
  const mockPage = createMockPage();
  const mockContext = createMockBrowserContext();

  return {
    newPage: jest.fn<() => Promise<ReturnType<typeof createMockPage>>>().mockResolvedValue(mockPage),
    defaultBrowserContext: jest.fn<() => ReturnType<typeof createMockBrowserContext>>().mockReturnValue(mockContext),
    close: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    _mockPage: mockPage,
    _mockContext: mockContext,
  };
};

// Mock Puppeteer module
export const createPuppeteerMock = () => {
  const mockBrowser = createMockBrowser();

  return {
    launch: jest.fn<() => Promise<ReturnType<typeof createMockBrowser>>>().mockResolvedValue(mockBrowser),
    _mockBrowser: mockBrowser,
  };
};

// Test fixtures
export const mockParticipants = [
  {
    id: 'participant-1',
    displayName: 'Test User 1',
    isLocal: false,
    hasAudio: true,
    hasVideo: true,
  },
  {
    id: 'participant-2',
    displayName: 'Test Bot',
    isLocal: true,
    hasAudio: false,
    hasVideo: false,
  },
];

export const mockChatMessages = [
  {
    id: 'msg-1',
    sender: 'Test User 1',
    message: 'Hello everyone!',
    timestamp: new Date('2024-01-01T10:00:00Z'),
    isPrivate: false,
  },
  {
    id: 'msg-2',
    sender: 'Test Bot',
    message: 'Hi there!',
    timestamp: new Date('2024-01-01T10:01:00Z'),
    isPrivate: false,
  },
];

export const mockMeetingState = {
  roomName: 'test-room',
  isConnected: true,
  participants: mockParticipants,
  chatMessages: mockChatMessages,
  isRecording: false,
  recordingPath: null,
};
