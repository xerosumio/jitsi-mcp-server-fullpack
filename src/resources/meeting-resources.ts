import { JitsiClient } from '../lib/jitsi-client.js';

// Resource definitions for MCP
export const RESOURCE_DEFINITIONS = [
  {
    uri: 'jitsi://meeting/state',
    name: 'Meeting State',
    description: 'Current state of the Jitsi meeting (room, participants, recording status)',
    mimeType: 'application/json',
  },
  {
    uri: 'jitsi://meeting/participants',
    name: 'Meeting Participants',
    description: 'List of current participants in the meeting',
    mimeType: 'application/json',
  },
  {
    uri: 'jitsi://meeting/chat',
    name: 'Chat History',
    description: 'Chat message history from the current meeting',
    mimeType: 'application/json',
  },
  {
    uri: 'jitsi://meeting/screenshot',
    name: 'Meeting Screenshot',
    description: 'Current screenshot of the meeting view',
    mimeType: 'image/png',
  },
];

// Resource handler class
export class MeetingResources {
  constructor(private client: JitsiClient) {}

  async handleResource(uri: string): Promise<{ content: string; mimeType: string }> {
    switch (uri) {
      case 'jitsi://meeting/state': {
        const state = this.client.getState();
        return {
          content: JSON.stringify(state, null, 2),
          mimeType: 'application/json',
        };
      }

      case 'jitsi://meeting/participants': {
        const participants = await this.client.getParticipants();
        return {
          content: JSON.stringify({ participants, count: participants.length }, null, 2),
          mimeType: 'application/json',
        };
      }

      case 'jitsi://meeting/chat': {
        const messages = await this.client.getChatHistory();
        return {
          content: JSON.stringify({ messages, count: messages.length }, null, 2),
          mimeType: 'application/json',
        };
      }

      case 'jitsi://meeting/screenshot': {
        const screenshot = await this.client.takeScreenshot();
        return {
          content: screenshot.toString('base64'),
          mimeType: 'image/png',
        };
      }

      default:
        throw new Error(`Unknown resource: ${uri}`);
    }
  }

  listResources() {
    return RESOURCE_DEFINITIONS;
  }
}
