import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { JitsiClient } from './lib/jitsi-client.js';
import { MeetingTools, TOOL_DEFINITIONS } from './tools/meeting-tools.js';
import { MeetingResources, RESOURCE_DEFINITIONS } from './resources/meeting-resources.js';
import config from './config.js';

class JitsiMcpServer {
  private server: Server;
  private jitsiClient: JitsiClient;
  private meetingTools: MeetingTools;
  private meetingResources: MeetingResources;
  private initialized = false;

  constructor() {
    this.server = new Server(
      {
        name: 'jitsi-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.jitsiClient = new JitsiClient();
    this.meetingTools = new MeetingTools(this.jitsiClient);
    this.meetingResources = new MeetingResources(this.jitsiClient);

    this.setupHandlers();
    this.setupEventListeners();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: TOOL_DEFINITIONS,
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // Ensure client is initialized for meeting tools
      if (name !== 'jitsi_join_meeting' && !this.initialized) {
        // Initialize on first non-join call if needed
        if (name.startsWith('jitsi_')) {
          await this.ensureInitialized();
        }
      }

      // Special handling for join - always initialize
      if (name === 'jitsi_join_meeting') {
        await this.ensureInitialized();
      }

      try {
        const result = await this.meetingTools.handleTool(name, args as Record<string, unknown>);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${errorMessage}`);
      }
    });

    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: RESOURCE_DEFINITIONS,
      };
    });

    // Read resources
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      try {
        const { content, mimeType } = await this.meetingResources.handleResource(uri);

        if (mimeType === 'image/png') {
          return {
            contents: [
              {
                uri,
                mimeType,
                blob: content, // Base64 encoded
              },
            ],
          };
        }

        return {
          contents: [
            {
              uri,
              mimeType,
              text: content,
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new McpError(ErrorCode.InternalError, `Resource read failed: ${errorMessage}`);
      }
    });
  }

  private setupEventListeners(): void {
    // Listen for chat messages
    this.jitsiClient.on('chatMessage', (message) => {
      console.error(`[Event] New chat message from ${message.sender}: ${message.message}`);
    });

    // Listen for join/leave events
    this.jitsiClient.on('joined', ({ roomName }) => {
      console.error(`[Event] Joined room: ${roomName}`);
    });

    this.jitsiClient.on('left', () => {
      console.error('[Event] Left the meeting');
    });

    // Listen for recording events
    this.jitsiClient.on('recordingStarted', ({ filepath }) => {
      console.error(`[Event] Recording started: ${filepath}`);
    });

    this.jitsiClient.on('recordingStopped', ({ filepath }) => {
      console.error(`[Event] Recording stopped: ${filepath}`);
    });
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      console.error('[JitsiMcpServer] Initializing Jitsi client...');
      await this.jitsiClient.initialize();
      this.initialized = true;
      console.error('[JitsiMcpServer] Jitsi client initialized');
    }
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[JitsiMcpServer] Server started on stdio transport');
    console.error(`[JitsiMcpServer] Configuration:`);
    console.error(`  - Jitsi Server: ${config.serverUrl}`);
    console.error(`  - Display Name: ${config.displayName}`);
    console.error(`  - Headless: ${config.headless}`);
    console.error(`  - Recordings Dir: ${config.recordingsDir}`);
  }

  async shutdown(): Promise<void> {
    console.error('[JitsiMcpServer] Shutting down...');
    await this.jitsiClient.close();
    await this.server.close();
  }
}

// Main entry point
const server = new JitsiMcpServer();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  await server.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await server.shutdown();
  process.exit(0);
});

// Start the server
server.run().catch((error) => {
  console.error('[JitsiMcpServer] Fatal error:', error);
  process.exit(1);
});
