# Jitsi MCP Server

MCP (Model Context Protocol) server for Jitsi Meet that allows AI agents to:

- **Join/leave meetings** - Connect to any Jitsi Meet room
- **Read/write chat** - Full bidirectional chat support
- **Record meetings** - Capture video/audio streams locally
- **Get meeting state** - Participants, recording status, etc.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   AI Agent      │────▶│  MCP Server     │────▶│  Jitsi Meet     │
│  (Claude, etc)  │     │  (this server)  │     │  (browser)      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │  Puppeteer      │
                        │  (Chrome)       │
                        └─────────────────┘
```

This server uses Puppeteer to control a headless Chrome browser that joins Jitsi meetings. The MCP interface exposes tools and resources for AI agents to interact with the meeting.

## Prerequisites

- Node.js 18+
- Chrome/Chromium (installed automatically by Puppeteer)

## Installation

```bash
cd jitsi-mcp-server
npm install
npm run build
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

| Variable | Description | Default |
|----------|-------------|---------|
| `JITSI_SERVER_URL` | Jitsi Meet server URL | `https://meet.jit.si` |
| `JITSI_DISPLAY_NAME` | Bot display name | `AI Assistant` |
| `JITSI_JWT_APP_ID` | JWT app ID (for private servers) | - |
| `JITSI_JWT_SECRET` | JWT secret (for private servers) | - |
| `RECORDINGS_DIR` | Where to save recordings | `./recordings` |
| `RECORDING_FORMAT` | Video format (webm/mp4) | `webm` |
| `PORT` | HTTP server port | `3000` |
| `HOST` | HTTP server host | `0.0.0.0` |
| `HEADLESS` | Run browser headless | `true` |

## Usage

### Stdio Transport (for Claude Desktop, etc.)

```bash
npm start
# or
node dist/index.js
```

Add to Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "jitsi": {
      "command": "node",
      "args": ["/path/to/jitsi-mcp-server/dist/index.js"],
      "env": {
        "JITSI_SERVER_URL": "https://meet.jit.si",
        "JITSI_DISPLAY_NAME": "Claude Assistant"
      }
    }
  }
}
```

### HTTP/SSE Transport

```bash
npm run dev
# or for production
node dist/http-server.js
```

Connect via SSE at `http://localhost:3000/sse`

## MCP Tools

| Tool | Description |
|------|-------------|
| `jitsi_join_meeting` | Join a Jitsi room |
| `jitsi_leave_meeting` | Leave current meeting |
| `jitsi_send_chat` | Send chat message |
| `jitsi_get_chat_history` | Get chat messages |
| `jitsi_get_participants` | List participants |
| `jitsi_get_meeting_state` | Get full meeting state |
| `jitsi_toggle_mute` | Mute/unmute microphone |
| `jitsi_toggle_video` | Enable/disable camera |
| `jitsi_start_recording` | Start screen recording |
| `jitsi_stop_recording` | Stop and save recording |
| `jitsi_take_screenshot` | Capture meeting screenshot |

## MCP Resources

| URI | Description |
|-----|-------------|
| `jitsi://meeting/state` | Current meeting state |
| `jitsi://meeting/participants` | Participant list |
| `jitsi://meeting/chat` | Chat history |
| `jitsi://meeting/screenshot` | Live screenshot |

## REST API (HTTP mode only)

When running in HTTP mode, these endpoints are available:

```bash
# Join a meeting
POST /api/join
{"roomName": "my-room", "displayName": "Bot"}

# Leave meeting
POST /api/leave

# Send chat message
POST /api/chat
{"message": "Hello!"}

# Get chat history
GET /api/chat

# Get meeting state
GET /api/state

# Get participants
GET /api/participants

# Start recording
POST /api/recording/start

# Stop recording
POST /api/recording/stop

# Get screenshot
GET /api/screenshot
```

## Example Agent Usage

```typescript
// Using the MCP client
const response = await mcpClient.callTool('jitsi_join_meeting', {
  roomName: 'daily-standup',
  displayName: 'AI Scribe',
  startMuted: true,
  startWithVideoOff: true,
});

// Send a greeting
await mcpClient.callTool('jitsi_send_chat', {
  message: 'Hello! I\'m here to take notes for this meeting.',
});

// Start recording
await mcpClient.callTool('jitsi_start_recording', {});

// ... meeting happens ...

// Get chat history for summarization
const chat = await mcpClient.callTool('jitsi_get_chat_history', {});

// Stop recording
await mcpClient.callTool('jitsi_stop_recording', {});

// Leave
await mcpClient.callTool('jitsi_leave_meeting', {});
```

## Private Jitsi Servers

For self-hosted Jitsi with JWT authentication:

1. Configure your Jitsi server for JWT auth
2. Set `JITSI_JWT_APP_ID` and `JITSI_JWT_SECRET` in `.env`
3. The server will automatically generate JWTs for joining meetings

## Important Notes

### Audio Recording
Audio recording captures remote participants' audio via WebRTC. For reliable audio capture:
- Set `HEADLESS=false` in your `.env` file
- The browser needs a real audio context to capture WebRTC streams

### Jitsi Server Compatibility
- **meet.jit.si**: Works with anonymous users if a logged-in moderator starts the meeting first
- **Self-hosted**: Full anonymous access typically available
- **Alternative servers**: Tested with meet.ffmuc.net and others

### Chat
The bot automatically enters a chat nickname when required by the Jitsi interface.

## Limitations

- **Headless Audio**: Audio recording may not work reliably in headless mode
- **Video Recording**: Currently audio-only; video frames are not captured
- **Private Messages**: Only public chat is supported

## Development

```bash
# Run in development mode with hot reload
npm run dev

# Run HTTP server in dev mode
npm run dev:http

# Build
npm run build

# Run tests
npm test

# Lint
npm run lint
```

## License

MIT
