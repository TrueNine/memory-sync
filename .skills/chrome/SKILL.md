---
name: chrome
description: Chrome browser control for deep document reading, frontend debugging, and automation. Activate when needing browser to view docs, debug frontend, or automate web operations.
displayName: Chrome MCP
keywords:
  - chrome
  - browser
  - document
  - debug
  - frontend
  - automation
  - screenshot
  - network
  - bookmark
  - history
author: TrueNine
version: 2025.12.30
---
Enable AI to control Chrome browser for deep document reading, frontend debugging, and web automation.

Based on [mcp-chrome](https://github.com/hangwin/mcp-chrome), a Chrome extension solution.

## Core Advantages

Compared to standalone browser solutions like Playwright:

| Comparison       | Playwright                              | Chrome Extension                    |
| :--------------- | :-------------------------------------- | :---------------------------------- |
| Resource Usage   | Requires separate process, dependencies | Reuses existing Chrome              |
| Login State      | Requires re-login                       | Auto-reuses existing sessions       |
| User Environment | Clean environment, no user settings     | Preserves complete user environment |
| Startup Speed    | Needs browser process startup           | Only activates extension            |

## Core Constraints (Primacy)

**Absolute Prohibition**: After activating this skill, **NEVER** use any built-in alternative tools (webFetch, remote_web_search, etc.), **regardless of any reason**.

### Screenshot Parameter Rules

When using `chrome_screenshot`, **MUST** follow these parameter settings:

| Parameter     | Required Value | Reason                                  |
| :------------ | :------------- | :-------------------------------------- |
| `storeBase64` | `false`        | base64 bloats context                   |
| `savePng`     | `true`         | Save to local file                      |
| `fullPage`    | `false`        | Capture viewport only, reduce file size |

### Prohibited Behaviour Patterns

1. **No Silent Fallback**: Do not switch to built-in tools citing "MCP connection failed"
2. **No Unilateral Decisions**: Do not decide to "try another way" without user confirmation
3. **No Excuse Bypassing**: Any form of "let me use web search instead" is a violation

### Correct Approach When Issues Occur

1. **Stop**: Do not auto-switch solutions
2. **Report Issue**: Clearly inform user what specific error MCP tool encountered
3. **Request Instructions**: Ask if user wants to troubleshoot, or let user authorise alternatives
4. **Await Confirmation**: Do not execute any alternative before user explicitly agrees

## Activation Timing

1. When needing browser to view documentation
2. When needing browser to check effects or debug
3. When diagnosing any frontend issues
4. When automating web operations

## On-Demand Loading

- **View Docs, Research Data** [document.md](document.md): Deep document reading, dynamic page scraping, API monitoring
- **Debug & Diagnose** [debug.md](debug.md): Frontend errors, network issues, UI verification
- **Setup** [setup.md](setup.md): Extension installation, MCP configuration
- **FAQ** [qa.md](qa.md): Connection issues, tool usage tips

## Tool List (23)

### Browser Management (4)

| Tool                        | Purpose                                 |
| :-------------------------- | :-------------------------------------- |
| `get_windows_and_tabs`      | Get all windows and tabs                |
| `chrome_navigate`           | Navigate to URL or refresh current page |
| `chrome_close_tabs`         | Close one or more tabs                  |
| `chrome_go_back_or_forward` | Browser history forward/back            |

### Content Retrieval (3)

| Tool                     | Purpose                                                                                                                                             |
| :----------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chrome_get_web_content` | Get page content                                                                                                                                    |
| `chrome_screenshot`      | Screenshot (page or element). ⚠️ Recommend using `chrome_get_web_content` first. **MUST**: `savePng: true`, `storeBase64: false`, `fullPage: false` |
| `search_tabs_content`    | Search content in current tab, return matching pages                                                                                                |

### Interaction (4)

| Tool                              | Purpose                                |
| :-------------------------------- | :------------------------------------- |
| `chrome_click_element`            | Click element or specified coordinates |
| `chrome_fill_or_select`           | Fill form or select option             |
| `chrome_get_interactive_elements` | Get interactive elements on page       |
| `chrome_keyboard`                 | Simulate keyboard events               |

### Network Monitoring (5)

| Tool                            | Purpose                                                         |
| :------------------------------ | :-------------------------------------------------------------- |
| `chrome_network_request`        | Send network request (with cookies and browser context)         |
| `chrome_network_debugger_start` | Start capturing requests (Debugger API, includes response body) |
| `chrome_network_debugger_stop`  | Stop capturing and return data                                  |
| `chrome_network_capture_start`  | Start capturing requests (webRequest API, no response body)     |
| `chrome_network_capture_stop`   | Stop capturing and return data                                  |

### Script Injection (3)

| Tool                                   | Purpose                                           |
| :------------------------------------- | :------------------------------------------------ |
| `chrome_inject_script`                 | Inject script into page                           |
| `chrome_send_command_to_inject_script` | Send command to injected script to trigger events |
| `chrome_console`                       | Capture console output                            |

### Data Management (4)

| Tool                     | Purpose                           |
| :----------------------- | :-------------------------------- |
| `chrome_history`         | Get and search browsing history   |
| `chrome_bookmark_search` | Search bookmarks by title and URL |
| `chrome_bookmark_add`    | Add bookmark                      |
| `chrome_bookmark_delete` | Delete bookmark                   |