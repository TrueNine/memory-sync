# FAQ

## #1 MCP Connection Failed

**Symptom**: Tool call returns `fetch failed` or `Not connected`.

**Troubleshooting Steps**:

1. **Check Extension Status**: Click Chrome extension icon, confirm shows Connected
2. **Check Bridge Service**:
   ```bash
   curl -s http://127.0.0.1:12306/mcp
   ```
3. **Reconnect**: Click extension icon, Disconnect then Connect

**Common Causes**:
- Extension not connected or unexpectedly disconnected
- Bridge service not running
- Port occupied

---

## #2 execute_script Syntax Error

**Error Message**:
```
Unexpected token 'const'
```

**Cause**: `execute_script` requires an expression that returns a value, cannot write statements directly.

**Solution**: Wrap with IIFE or arrow function:

```javascript
// ❌ Wrong
const video = document.querySelector('video');
video.muted = false;

// ✅ Correct
(() => {
  var video = document.querySelector('video');
  video.muted = false;
  return 'done';
})()
```

---

## #3 click_element Click Ineffective

**Symptom**: Element exists but click has no response.

**Possible Causes**:
- Element is obscured
- Element is invisible
- Selector matched wrong element

**Solution**:

1. First use `get_element_by_selector` to confirm element exists and is visible
2. Use `execute_script` to call click directly:

```javascript
(() => {
  var el = document.querySelector('.target-btn');
  if (el) { el.click(); return 'clicked'; }
  return 'not found';
})()
```

---

## #4 get_page_content Incomplete

**Symptom**: Retrieved content missing dynamically loaded parts.

**Cause**: Page uses lazy loading or infinite scroll.

**Solution**:

1. First use `scroll_page` to scroll and load more content
2. Wait for content to load before retrieving:

```javascript
// Scroll to bottom
(() => {
  window.scrollTo(0, document.body.scrollHeight);
  return 'scrolled';
})()
```

3. Wait a moment then call `get_page_content`

---

## #5 Network Request Listener No Data

**Symptom**: `get_network_requests` returns empty array.

**Troubleshooting Steps**:

1. Confirm `start_network_listener` was called to begin monitoring
2. Only requests occurring after monitoring starts are captured
3. Refresh page or trigger actions to generate new requests

**Correct Flow**:
1. `start_network_listener` to begin monitoring
2. `reload_tab` or execute action to trigger requests
3. `get_network_requests` to get captured requests
4. `stop_network_listener` to stop monitoring

---

## #6 Extension Frequently Disconnects

**Symptom**: Extension connection unstable, often auto-disconnects.

**Possible Causes**:
- Chrome suspended background extension
- Network fluctuation

**Solution**:

1. Keep extension popup open (don't close it)
2. Check Chrome settings, disable extension suspension
3. After disconnect, click Connect again

---

## #7 Screenshot Failed or Blank

**Symptom**: `take_screenshot` returns blank image.

**Possible Causes**:
- Page not fully loaded
- Target element not visible

**Solution**:

1. Wait for page to fully load before screenshot
2. Confirm target element is in visible area
3. Try scrolling to target position first

---

## #8 Bookmark/History Permission Issue

**Symptom**: Bookmark or history tools report permission error.

**Cause**: Extension permissions not fully granted.

**Solution**:

1. Open `chrome://extensions/`
2. Find mcp-chrome extension
3. Click "Details", confirm all permissions enabled
