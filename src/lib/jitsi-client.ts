import puppeteer, { Browser, Page } from 'puppeteer';
import { EventEmitter } from 'events';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import config from '../config.js';

export interface ChatMessage {
  id: string;
  sender: string;
  message: string;
  timestamp: Date;
  isPrivate: boolean;
}

export interface Participant {
  id: string;
  displayName: string;
  isLocal: boolean;
  hasAudio: boolean;
  hasVideo: boolean;
}

export interface MeetingState {
  roomName: string | null;
  isConnected: boolean;
  participants: Participant[];
  chatMessages: ChatMessage[];
  isRecording: boolean;
  recordingPath: string | null;
}

export class JitsiClient extends EventEmitter {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private state: MeetingState = {
    roomName: null,
    isConnected: false,
    participants: [],
    chatMessages: [],
    isRecording: false,
    recordingPath: null,
  };
  private chatObserverSetup = false;
  private recordingStream: any = null;

  async initialize(): Promise<void> {
    console.log('[JitsiClient] Initializing browser...');

    this.browser = await puppeteer.launch({
      headless: config.headless,
      args: [
        '--use-fake-ui-for-media-stream', // Auto-accept camera/mic permissions
        '--use-fake-device-for-media-stream', // Use fake media devices
        '--disable-web-security',
        '--allow-running-insecure-content',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-features=IsolateOrigins,site-per-process',
        '--autoplay-policy=no-user-gesture-required',
      ],
    });

    this.page = await this.browser.newPage();

    // Set up console logging from the page
    this.page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.error('[Browser]', msg.text());
      }
    });

    // Grant permissions
    const context = this.browser.defaultBrowserContext();
    await context.overridePermissions(config.serverUrl, [
      'camera',
      'microphone',
    ]);

    console.log('[JitsiClient] Browser initialized');
  }

  async joinMeeting(roomName: string, options?: {
    displayName?: string;
    startMuted?: boolean;
    startWithVideoOff?: boolean;
  }): Promise<void> {
    if (!this.page) {
      throw new Error('Client not initialized. Call initialize() first.');
    }

    const displayName = options?.displayName || config.displayName;
    const startMuted = options?.startMuted ?? true;
    const startWithVideoOff = options?.startWithVideoOff ?? true;

    // Build URL with config parameters
    const configParams = [
      `config.prejoinPageEnabled=false`,
      `config.startWithAudioMuted=${startMuted}`,
      `config.startWithVideoMuted=${startWithVideoOff}`,
      `config.disableDeepLinking=true`,
      `config.disableInviteFunctions=true`,
      `userInfo.displayName=${encodeURIComponent(displayName)}`,
    ].join('&');

    const meetingUrl = `${config.serverUrl}/${roomName}#${configParams}`;
    console.log(`[JitsiClient] Joining meeting: ${meetingUrl}`);

    await this.page.goto(meetingUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    // Wait for the meeting to load
    await this.waitForMeetingLoad();

    // Set up chat observer
    await this.setupChatObserver();

    // Set up participant observer
    await this.setupParticipantObserver();

    this.state.roomName = roomName;
    this.state.isConnected = true;

    console.log(`[JitsiClient] Successfully joined room: ${roomName}`);
    this.emit('joined', { roomName });
  }

  private async waitForMeetingLoad(): Promise<void> {
    if (!this.page) return;

    // Wait for the main Jitsi interface to load
    // Try multiple selectors as Jitsi UI can vary
    try {
      await this.page.waitForSelector(
        '[class*="toolbox"], [class*="Toolbox"], #meetingContainer, .meeting-app',
        { timeout: 30000 }
      );

      // Give it a moment to fully initialize
      await new Promise(resolve => setTimeout(resolve, 3000));

      console.log('[JitsiClient] Meeting interface loaded');
    } catch (error) {
      console.warn('[JitsiClient] Could not detect standard toolbox, trying alternatives...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  private async setupChatObserver(): Promise<void> {
    if (!this.page || this.chatObserverSetup) return;

    await this.page.evaluate(() => {
      // Open chat panel if not open
      const chatButton = document.querySelector('[aria-label="Open chat"], [aria-label="Chat"], button[id*="chat"]') as HTMLElement;
      if (chatButton) {
        chatButton.click();
      }

      // Set up mutation observer for chat messages
      const observeChat = () => {
        const chatContainer = document.querySelector('[class*="chat-message"], [class*="ChatMessage"], .chat-container, #chatconversation');
        if (!chatContainer) {
          setTimeout(observeChat, 1000);
          return;
        }

        const observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
              if (node instanceof HTMLElement) {
                const messageData = {
                  type: 'newChatMessage',
                  sender: node.querySelector('[class*="display-name"], .display-name')?.textContent || 'Unknown',
                  message: node.querySelector('[class*="message-text"], .message-text, .message')?.textContent || node.textContent || '',
                  timestamp: new Date().toISOString(),
                };
                window.postMessage(messageData, '*');
              }
            });
          });
        });

        observer.observe(chatContainer.parentElement || chatContainer, {
          childList: true,
          subtree: true,
        });
      };

      observeChat();
    });

    // Listen for messages from the page
    await this.page.exposeFunction('onNewChatMessage', (message: ChatMessage) => {
      this.state.chatMessages.push(message);
      this.emit('chatMessage', message);
    });

    this.chatObserverSetup = true;
    console.log('[JitsiClient] Chat observer set up');
  }

  private async setupParticipantObserver(): Promise<void> {
    if (!this.page) return;

    // Periodically update participant list
    setInterval(async () => {
      if (this.page && this.state.isConnected) {
        try {
          await this.updateParticipants();
        } catch (e) {
          // Ignore errors during polling
        }
      }
    }, 5000);
  }

  private async updateParticipants(): Promise<void> {
    if (!this.page) return;

    const participants = await this.page.evaluate(() => {
      const participantElements = document.querySelectorAll(
        '[class*="participant"], [class*="Participant"], .videocontainer'
      );

      return Array.from(participantElements).map((el, index) => ({
        id: el.getAttribute('id') || `participant-${index}`,
        displayName: el.querySelector('[class*="display-name"], .displayname')?.textContent || `Participant ${index + 1}`,
        isLocal: el.classList.contains('local') || el.getAttribute('id')?.includes('local') || false,
        hasAudio: !el.querySelector('[class*="audio-muted"], .audioMuted'),
        hasVideo: !el.querySelector('[class*="video-muted"], .videoMuted'),
      }));
    });

    this.state.participants = participants;
  }

  async sendChatMessage(message: string, recipientId?: string): Promise<void> {
    if (!this.page || !this.state.isConnected) {
      throw new Error('Not connected to a meeting');
    }

    // Use Jitsi's keyboard shortcut 'c' to open/toggle chat panel
    // This is more reliable than trying to find and click buttons
    await this.page.keyboard.press('c');

    // Wait for chat panel to open
    await new Promise(r => setTimeout(r, 1500));

    // Try to find and focus the chat input
    const chatInputFound = await this.page.evaluate(() => {
      // Try multiple selectors for the chat input
      const chatInputSelectors = [
        '#usermsg',
        'textarea[placeholder*="message" i]',
        'input[placeholder*="message" i]',
        '[class*="chat"] textarea',
        '[class*="Chat"] textarea',
        '[class*="chat"] input[type="text"]',
        '[id*="chat"] textarea',
        '.chat-input textarea',
        '.chat-input input',
        // More specific Jitsi selectors
        '[data-testid="chat-input"]',
        '.chatroom textarea',
        '.chatroom input',
      ];

      for (const selector of chatInputSelectors) {
        const input = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
        if (input) {
          input.focus();
          input.click();
          return { found: true, selector };
        }
      }

      // Debug: find any visible textareas or inputs
      const allTextareas = Array.from(document.querySelectorAll('textarea'));
      const visibleTextareas = allTextareas.filter(t => {
        const rect = t.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });

      if (visibleTextareas.length > 0) {
        visibleTextareas[0].focus();
        visibleTextareas[0].click();
        return { found: true, selector: 'visible-textarea-fallback' };
      }

      return { found: false, debugInfo: { textareas: allTextareas.length, visibleTextareas: visibleTextareas.length } };
    });

    if (!chatInputFound.found) {
      console.log('[JitsiClient] Chat input debug:', chatInputFound);
      throw new Error('Could not find chat input');
    }

    console.log(`[JitsiClient] Found chat input with: ${chatInputFound.selector}`);

    // Small delay to ensure focus
    await new Promise(r => setTimeout(r, 200));

    // Type the message using Puppeteer's keyboard (more reliable)
    await this.page.keyboard.type(message);

    // Small delay before sending
    await new Promise(r => setTimeout(r, 100));

    // Press Enter to send
    await this.page.keyboard.press('Enter');

    // Add to local state
    const chatMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: config.displayName,
      message,
      timestamp: new Date(),
      isPrivate: !!recipientId,
    };
    this.state.chatMessages.push(chatMsg);
    this.emit('chatMessage', chatMsg);

    console.log(`[JitsiClient] Sent message: ${message}`);
  }

  async getChatHistory(): Promise<ChatMessage[]> {
    if (!this.page || !this.state.isConnected) {
      return [];
    }

    // Try to read existing chat messages from the DOM
    const messages = await this.page.evaluate(() => {
      const messageElements = document.querySelectorAll(
        '[class*="chat-message-group"], [class*="ChatMessage"], .message, #chatconversation > div'
      );

      return Array.from(messageElements).map((el, index) => ({
        id: `msg-${index}`,
        sender: el.querySelector('[class*="display-name"], .display-name, .nickname')?.textContent || 'Unknown',
        message: el.querySelector('[class*="message-text"], .message-text, .message-content')?.textContent || el.textContent || '',
        timestamp: new Date().toISOString(),
        isPrivate: el.classList.contains('private') || false,
      }));
    });

    return messages.map(m => ({
      ...m,
      timestamp: new Date(m.timestamp),
    }));
  }

  async startRecording(): Promise<string> {
    if (!this.page || !this.state.isConnected) {
      throw new Error('Not connected to a meeting');
    }

    if (this.state.isRecording) {
      throw new Error('Already recording');
    }

    // Ensure recordings directory exists
    await mkdir(config.recordingsDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `recording-${this.state.roomName}-${timestamp}.${config.recordingFormat}`;
    const filepath = join(config.recordingsDir, filename);

    // Use Chrome's screen capture API via CDP
    const client = await this.page.createCDPSession();

    // Start screen recording using Page.startScreencast
    await client.send('Page.startScreencast', {
      format: 'png',
      quality: 80,
      maxWidth: 1920,
      maxHeight: 1080,
    });

    // Store the CDP client for later
    this.recordingStream = {
      client,
      filepath,
      frames: [] as Buffer[],
      startTime: Date.now(),
    };

    // Handle incoming frames
    client.on('Page.screencastFrame', async (frame) => {
      if (this.recordingStream) {
        const buffer = Buffer.from(frame.data, 'base64');
        this.recordingStream.frames.push(buffer);
        await client.send('Page.screencastFrameAck', { sessionId: frame.sessionId });
      }
    });

    this.state.isRecording = true;
    this.state.recordingPath = filepath;

    console.log(`[JitsiClient] Started recording to: ${filepath}`);
    this.emit('recordingStarted', { filepath });

    return filepath;
  }

  async stopRecording(): Promise<string | null> {
    if (!this.state.isRecording || !this.recordingStream) {
      return null;
    }

    const { client, filepath, frames } = this.recordingStream;

    // Stop the screencast
    await client.send('Page.stopScreencast');

    // Write frames to a file (in production, you'd use ffmpeg to create a video)
    // For now, we'll save the raw frames info
    const { writeFile } = await import('fs/promises');

    // Create a simple metadata file with frame count
    const metadata = {
      filepath,
      frameCount: frames.length,
      duration: Date.now() - this.recordingStream.startTime,
      format: config.recordingFormat,
    };

    await writeFile(
      filepath.replace(`.${config.recordingFormat}`, '.json'),
      JSON.stringify(metadata, null, 2)
    );

    // In production, you would pipe frames through ffmpeg here
    // For now, save frames as a tar-like concatenation or use a proper video encoder
    console.log(`[JitsiClient] Recorded ${frames.length} frames`);

    this.recordingStream = null;
    this.state.isRecording = false;
    const recordedPath = this.state.recordingPath;
    this.state.recordingPath = null;

    console.log(`[JitsiClient] Stopped recording. Saved to: ${recordedPath}`);
    this.emit('recordingStopped', { filepath: recordedPath });

    return recordedPath;
  }

  async leaveMeeting(): Promise<void> {
    if (!this.page || !this.state.isConnected) {
      return;
    }

    // Stop recording if active
    if (this.state.isRecording) {
      await this.stopRecording();
    }

    // Click the hangup button
    await this.page.evaluate(() => {
      const hangupButton = document.querySelector(
        '[aria-label="Leave the meeting"], [aria-label="Hangup"], button[id*="hangup"], .hangup-button'
      ) as HTMLElement;
      if (hangupButton) {
        hangupButton.click();
      }
    });

    this.state.isConnected = false;
    this.state.roomName = null;
    this.state.participants = [];

    console.log('[JitsiClient] Left the meeting');
    this.emit('left');
  }

  async toggleMute(mute?: boolean): Promise<boolean> {
    if (!this.page || !this.state.isConnected) {
      throw new Error('Not connected to a meeting');
    }

    const isMuted = await this.page.evaluate((shouldMute?: boolean) => {
      const muteButton = document.querySelector(
        '[aria-label*="mute"], [aria-label*="Mute"], button[id*="audio"]'
      ) as HTMLElement;

      if (!muteButton) {
        throw new Error('Could not find mute button');
      }

      const currentlyMuted = muteButton.getAttribute('aria-pressed') === 'true' ||
        muteButton.classList.contains('muted');

      if (shouldMute === undefined || currentlyMuted !== shouldMute) {
        muteButton.click();
        return !currentlyMuted;
      }

      return currentlyMuted;
    }, mute);

    return isMuted;
  }

  async toggleVideo(disable?: boolean): Promise<boolean> {
    if (!this.page || !this.state.isConnected) {
      throw new Error('Not connected to a meeting');
    }

    const isDisabled = await this.page.evaluate((shouldDisable?: boolean) => {
      const videoButton = document.querySelector(
        '[aria-label*="camera"], [aria-label*="Camera"], [aria-label*="video"], button[id*="video"]'
      ) as HTMLElement;

      if (!videoButton) {
        throw new Error('Could not find video button');
      }

      const currentlyDisabled = videoButton.getAttribute('aria-pressed') === 'true' ||
        videoButton.classList.contains('disabled');

      if (shouldDisable === undefined || currentlyDisabled !== shouldDisable) {
        videoButton.click();
        return !currentlyDisabled;
      }

      return currentlyDisabled;
    }, disable);

    return isDisabled;
  }

  getState(): MeetingState {
    return { ...this.state };
  }

  async getParticipants(): Promise<Participant[]> {
    await this.updateParticipants();
    return [...this.state.participants];
  }

  async takeScreenshot(): Promise<Buffer> {
    if (!this.page) {
      throw new Error('Client not initialized');
    }

    const screenshot = await this.page.screenshot({ type: 'png', fullPage: false });
    return Buffer.from(screenshot);
  }

  async close(): Promise<void> {
    if (this.state.isConnected) {
      await this.leaveMeeting();
    }

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }

    console.log('[JitsiClient] Client closed');
  }
}

export default JitsiClient;
