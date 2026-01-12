import express from 'express';
import cors from 'cors';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
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

class JitsiHttpServer {
  private app: express.Application;
  private jitsiClient: JitsiClient;
  private meetingTools: MeetingTools;
  private meetingResources: MeetingResources;
  private initialized = false;
  private transports: Map<string, SSEServerTransport> = new Map();

  constructor() {
    this.app = express();
    this.app.use(cors());
    this.app.use(express.json());

    this.jitsiClient = new JitsiClient();
    this.meetingTools = new MeetingTools(this.jitsiClient);
    this.meetingResources = new MeetingResources(this.jitsiClient);

    this.setupRoutes();
    this.setupEventListeners();
  }

  private createMcpServer(): Server {
    const server = new Server(
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

    // List available tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: TOOL_DEFINITIONS,
      };
    });

    // Handle tool calls
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

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
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: RESOURCE_DEFINITIONS,
      };
    });

    // Read resources
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      try {
        const { content, mimeType } = await this.meetingResources.handleResource(uri);

        if (mimeType === 'image/png') {
          return {
            contents: [
              {
                uri,
                mimeType,
                blob: content,
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

    return server;
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        initialized: this.initialized,
        meetingState: this.initialized ? this.jitsiClient.getState() : null,
      });
    });

    // SSE endpoint for MCP
    this.app.get('/sse', async (req, res) => {
      const sessionId = `session-${Date.now()}`;
      console.log(`[HTTP] New SSE connection: ${sessionId}`);

      const transport = new SSEServerTransport('/message', res);
      this.transports.set(sessionId, transport);

      const server = this.createMcpServer();
      await server.connect(transport);

      req.on('close', () => {
        console.log(`[HTTP] SSE connection closed: ${sessionId}`);
        this.transports.delete(sessionId);
        server.close();
      });
    });

    // Message endpoint for SSE transport
    this.app.post('/message', async (req, res) => {
      // The SSE transport handles this internally
      // This is a placeholder for the transport's message handling
      res.status(200).send('OK');
    });

    // Direct API endpoints (non-MCP)
    this.app.post('/api/join', async (req, res) => {
      try {
        await this.ensureInitialized();
        const { roomName, displayName, startMuted, startWithVideoOff } = req.body;
        await this.jitsiClient.joinMeeting(roomName, {
          displayName,
          startMuted: startMuted ?? true,
          startWithVideoOff: startWithVideoOff ?? true,
        });
        res.json({ success: true, state: this.jitsiClient.getState() });
      } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
      }
    });

    this.app.post('/api/leave', async (req, res) => {
      try {
        await this.jitsiClient.leaveMeeting();
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
      }
    });

    this.app.post('/api/chat', async (req, res) => {
      try {
        const { message, recipientId } = req.body;
        await this.jitsiClient.sendChatMessage(message, recipientId);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
      }
    });

    this.app.get('/api/chat', async (req, res) => {
      try {
        const messages = await this.jitsiClient.getChatHistory();
        res.json({ success: true, messages });
      } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
      }
    });

    this.app.get('/api/state', (req, res) => {
      res.json({ success: true, state: this.jitsiClient.getState() });
    });

    this.app.get('/api/participants', async (req, res) => {
      try {
        const participants = await this.jitsiClient.getParticipants();
        res.json({ success: true, participants });
      } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
      }
    });

    this.app.post('/api/recording/start', async (req, res) => {
      try {
        const filepath = await this.jitsiClient.startRecording();
        res.json({ success: true, filepath });
      } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
      }
    });

    this.app.post('/api/recording/stop', async (req, res) => {
      try {
        const filepath = await this.jitsiClient.stopRecording();
        res.json({ success: true, filepath });
      } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
      }
    });

    this.app.get('/api/screenshot', async (req, res) => {
      try {
        const screenshot = await this.jitsiClient.takeScreenshot();
        res.set('Content-Type', 'image/png');
        res.send(screenshot);
      } catch (error) {
        res.status(500).json({ success: false, error: String(error) });
      }
    });
  }

  private setupEventListeners(): void {
    this.jitsiClient.on('chatMessage', (message) => {
      console.log(`[Event] New chat message from ${message.sender}: ${message.message}`);
    });

    this.jitsiClient.on('joined', ({ roomName }) => {
      console.log(`[Event] Joined room: ${roomName}`);
    });

    this.jitsiClient.on('left', () => {
      console.log('[Event] Left the meeting');
    });

    this.jitsiClient.on('recordingStarted', ({ filepath }) => {
      console.log(`[Event] Recording started: ${filepath}`);
    });

    this.jitsiClient.on('recordingStopped', ({ filepath }) => {
      console.log(`[Event] Recording stopped: ${filepath}`);
    });
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      console.log('[JitsiHttpServer] Initializing Jitsi client...');
      await this.jitsiClient.initialize();
      this.initialized = true;
      console.log('[JitsiHttpServer] Jitsi client initialized');
    }
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(config.port, config.host, () => {
        console.log(`[JitsiHttpServer] Server started on http://${config.host}:${config.port}`);
        console.log(`[JitsiHttpServer] MCP SSE endpoint: http://${config.host}:${config.port}/sse`);
        console.log(`[JitsiHttpServer] Configuration:`);
        console.log(`  - Jitsi Server: ${config.serverUrl}`);
        console.log(`  - Display Name: ${config.displayName}`);
        console.log(`  - Headless: ${config.headless}`);
        console.log(`  - Recordings Dir: ${config.recordingsDir}`);
        resolve();
      });
    });
  }

  async shutdown(): Promise<void> {
    console.log('[JitsiHttpServer] Shutting down...');
    await this.jitsiClient.close();
  }
}

// Main entry point
const server = new JitsiHttpServer();

process.on('SIGINT', async () => {
  await server.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await server.shutdown();
  process.exit(0);
});

server.start().catch((error) => {
  console.error('[JitsiHttpServer] Fatal error:', error);
  process.exit(1);
});
