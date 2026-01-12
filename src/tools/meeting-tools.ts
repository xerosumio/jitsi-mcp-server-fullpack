import { z } from 'zod';
import { JitsiClient } from '../lib/jitsi-client.js';

// Tool input schemas
export const JoinMeetingSchema = z.object({
  roomName: z.string().describe('The name of the Jitsi room to join'),
  displayName: z.string().optional().describe('Display name to use in the meeting'),
  startMuted: z.boolean().optional().default(true).describe('Start with microphone muted'),
  startWithVideoOff: z.boolean().optional().default(true).describe('Start with camera off'),
});

export const SendChatMessageSchema = z.object({
  message: z.string().describe('The message to send to the meeting chat'),
  recipientId: z.string().optional().describe('Optional participant ID for private message'),
});

export const ToggleMuteSchema = z.object({
  mute: z.boolean().optional().describe('True to mute, false to unmute, omit to toggle'),
});

export const ToggleVideoSchema = z.object({
  disable: z.boolean().optional().describe('True to disable video, false to enable, omit to toggle'),
});

export const GetChatHistorySchema = z.object({
  limit: z.number().optional().default(50).describe('Maximum number of messages to return'),
});

// Tool definitions for MCP
export const TOOL_DEFINITIONS = [
  {
    name: 'jitsi_join_meeting',
    description: 'Join a Jitsi Meet video conference room. The bot will join with audio/video muted by default.',
    inputSchema: {
      type: 'object',
      properties: {
        roomName: {
          type: 'string',
          description: 'The name of the Jitsi room to join (e.g., "my-meeting-room")',
        },
        displayName: {
          type: 'string',
          description: 'Display name to show in the meeting',
        },
        startMuted: {
          type: 'boolean',
          description: 'Start with microphone muted (default: true)',
          default: true,
        },
        startWithVideoOff: {
          type: 'boolean',
          description: 'Start with camera off (default: true)',
          default: true,
        },
      },
      required: ['roomName'],
    },
  },
  {
    name: 'jitsi_leave_meeting',
    description: 'Leave the current Jitsi meeting',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'jitsi_send_chat',
    description: 'Send a message to the meeting chat',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'The message to send',
        },
        recipientId: {
          type: 'string',
          description: 'Optional: participant ID for private message',
        },
      },
      required: ['message'],
    },
  },
  {
    name: 'jitsi_get_chat_history',
    description: 'Get the chat message history from the current meeting',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of messages to return (default: 50)',
          default: 50,
        },
      },
    },
  },
  {
    name: 'jitsi_get_participants',
    description: 'Get the list of participants in the current meeting',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'jitsi_get_meeting_state',
    description: 'Get the current state of the meeting (room name, connection status, recording status)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'jitsi_toggle_mute',
    description: 'Toggle or set the microphone mute state',
    inputSchema: {
      type: 'object',
      properties: {
        mute: {
          type: 'boolean',
          description: 'True to mute, false to unmute, omit to toggle',
        },
      },
    },
  },
  {
    name: 'jitsi_toggle_video',
    description: 'Toggle or set the camera on/off state',
    inputSchema: {
      type: 'object',
      properties: {
        disable: {
          type: 'boolean',
          description: 'True to turn off camera, false to turn on, omit to toggle',
        },
      },
    },
  },
  {
    name: 'jitsi_start_recording',
    description: 'Start recording the meeting (screen capture). Returns the path where the recording will be saved.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'jitsi_stop_recording',
    description: 'Stop the current recording and save the file',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'jitsi_take_screenshot',
    description: 'Take a screenshot of the current meeting view',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// Tool handler class
export class MeetingTools {
  constructor(private client: JitsiClient) {}

  async handleTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'jitsi_join_meeting': {
        const { roomName, displayName, startMuted, startWithVideoOff } = JoinMeetingSchema.parse(args);
        await this.client.joinMeeting(roomName, { displayName, startMuted, startWithVideoOff });
        return {
          success: true,
          message: `Successfully joined meeting: ${roomName}`,
          state: this.client.getState(),
        };
      }

      case 'jitsi_leave_meeting': {
        await this.client.leaveMeeting();
        return {
          success: true,
          message: 'Left the meeting',
        };
      }

      case 'jitsi_send_chat': {
        const { message, recipientId } = SendChatMessageSchema.parse(args);
        await this.client.sendChatMessage(message, recipientId);
        return {
          success: true,
          message: `Sent message: "${message}"`,
        };
      }

      case 'jitsi_get_chat_history': {
        const { limit } = GetChatHistorySchema.parse(args);
        const history = await this.client.getChatHistory();
        return {
          success: true,
          messages: history.slice(-limit),
          count: history.length,
        };
      }

      case 'jitsi_get_participants': {
        const participants = await this.client.getParticipants();
        return {
          success: true,
          participants,
          count: participants.length,
        };
      }

      case 'jitsi_get_meeting_state': {
        return {
          success: true,
          state: this.client.getState(),
        };
      }

      case 'jitsi_toggle_mute': {
        const { mute } = ToggleMuteSchema.parse(args);
        const isMuted = await this.client.toggleMute(mute);
        return {
          success: true,
          muted: isMuted,
          message: isMuted ? 'Microphone muted' : 'Microphone unmuted',
        };
      }

      case 'jitsi_toggle_video': {
        const { disable } = ToggleVideoSchema.parse(args);
        const isDisabled = await this.client.toggleVideo(disable);
        return {
          success: true,
          videoOff: isDisabled,
          message: isDisabled ? 'Camera turned off' : 'Camera turned on',
        };
      }

      case 'jitsi_start_recording': {
        const filepath = await this.client.startRecording();
        return {
          success: true,
          message: 'Recording started',
          filepath,
        };
      }

      case 'jitsi_stop_recording': {
        const filepath = await this.client.stopRecording();
        return {
          success: true,
          message: filepath ? 'Recording stopped and saved' : 'No recording was active',
          filepath,
        };
      }

      case 'jitsi_take_screenshot': {
        const screenshot = await this.client.takeScreenshot();
        const base64 = screenshot.toString('base64');
        return {
          success: true,
          message: 'Screenshot captured',
          imageBase64: base64,
          mimeType: 'image/png',
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
}
