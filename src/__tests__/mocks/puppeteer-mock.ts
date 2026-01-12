import { jest } from '@jest/globals';
import { EventEmitter } from 'events';

// Mock CDP Session
export const createMockCDPSession = () => ({
  send: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  on: jest.fn(),
  off: jest.fn(),
  detach: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
});

// Mock Page
export const createMockPage = () => {
  const emitter = new EventEmitter();
  
  return {
    goto: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    waitForSelector: jest.fn<() => Promise<{ click: () => void }>>().mockResolvedValue({
      click: jest.fn(),
    }),
    evaluate: jest.fn<() => Promise<any>>().mockResolvedValue(undefined),
    click: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    type: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    screenshot: jest.fn<() => Promise<Buffer>>().mockResolvedValue(Buffer.from('fake-screenshot')),
    keyboard: {
      press: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      type: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    },
    createCDPSession: jest.fn<() => Promise<ReturnType<typeof createMockCDPSession>>>().mockResolvedValue(createMockCDPSession()),
    on: (event: string, handler: (...args: any[]) => void) => emitter.on(event, handler),
    off: (event: string, handler: (...args: any[]) => void) => emitter.off(event, handler),
    emit: (event: string, ...args: any[]) => emitter.emit(event, ...args),
    close: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    isClosed: jest.fn().mockReturnValue(false),
  };
};

// Mock Browser
export const createMockBrowser = (mockPage = createMockPage()) => ({
  newPage: jest.fn<() => Promise<ReturnType<typeof createMockPage>>>().mockResolvedValue(mockPage),
  close: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  isConnected: jest.fn().mockReturnValue(true),
});

// Mock puppeteer launch
export const mockPuppeteerLaunch = (mockBrowser = createMockBrowser()) => {
  return jest.fn<() => Promise<ReturnType<typeof createMockBrowser>>>().mockResolvedValue(mockBrowser);
};

// Mock data for tests
export const mockMeetingState = {
  roomName: 'test-room',
  isConnected: true,
  participants: [
    { id: '1', displayName: 'User 1', isLocal: false, hasAudio: true, hasVideo: true },
    { id: '2', displayName: 'Bot', isLocal: true, hasAudio: true, hasVideo: false },
  ],
  chatMessages: [
    { id: 'msg-1', sender: 'User 1', message: 'Hello', timestamp: new Date(), isPrivate: false },
    { id: 'msg-2', sender: 'Bot', message: 'Hi there!', timestamp: new Date(), isPrivate: false },
  ],
  isRecording: false,
  recordingPath: null,
};

export const mockParticipants = [
  { id: '1', displayName: 'User 1', isLocal: false, hasAudio: true, hasVideo: true },
  { id: '2', displayName: 'Bot', isLocal: true, hasAudio: true, hasVideo: false },
];

export const mockChatMessages = [
  { id: 'msg-1', sender: 'User 1', message: 'Hello', timestamp: new Date(), isPrivate: false },
  { id: 'msg-2', sender: 'Bot', message: 'Hi there!', timestamp: new Date(), isPrivate: false },
];
