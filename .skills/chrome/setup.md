# Setup

## Prerequisites

- Chrome browser
- Node.js (for installing bridge)

## Installation Steps

### 1. Install Chrome Extension

Download latest extension from GitHub Releases:
https://github.com/hangwin/mcp-chrome/releases

Load extension:
1. Open Chrome, visit `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked", select downloaded extension directory
4. Click extension icon, click Connect

### 2. Install MCP Bridge

```bash
# npm
npm install -g mcp-chrome-bridge

# pnpm (enable scripts first)
pnpm config set enable-pre-post-scripts true
pnpm install -g mcp-chrome-bridge

# If auto-registration fails, register manually
mcp-chrome-bridge register
```

### 3. Configure MCP Client

#### Streamable HTTP (Recommended)

```json
{
  "mcpServers": {
    "chrome-mcp": {
      "type": "streamableHttp",
      "url": "http://127.0.0.1:12306/mcp"
    }
  }
}
```

#### STDIO (Alternative)

First find installation path:

```bash
# npm
npm list -g mcp-chrome-bridge

# pnpm
pnpm list -g mcp-chrome-bridge
```

Assuming output `/Users/xxx/Library/pnpm/global/5`, configure:

```json
{
  "mcpServers": {
    "chrome-mcp": {
      "command": "node",
      "args": [
        "/Users/xxx/Library/pnpm/global/5/node_modules/mcp-chrome-bridge/dist/mcp/mcp-server-stdio.js"
      ]
    }
  }
}
```

## Verify Connection

1. Ensure Chrome extension is connected (icon shows Connected)
2. Call `get_current_tab_info` in MCP client to test

## Notes

- Extension must stay connected, reconnect by clicking Connect after disconnect
- Bridge service listens on `127.0.0.1:12306` by default
- No need to manually start Chrome or configure debug port, directly reuses open browser
