# View Docs & Research Data

Applicable scenarios: Login-required docs, SPA dynamic pages, anti-scraping sites, monitoring APIs for data

## Core Advantages

- **Auto-reuse Login State**: Directly uses user's logged-in Chrome, no re-login needed
- **Real Browser Environment**: Bypasses anti-scraping, more reliable than fetch/curl
- **Handle Dynamic Content**: SPA, lazy-loading, JS-rendered pages all supported

## Workflow

### Basic Document Scraping

1. `open_url` to navigate to target page
2. Wait for page load
3. `get_page_content` to extract content

### Login-Required Documents

Since it directly reuses user's Chrome, most cases are already logged in.

If not logged in:
1. `open_url` to navigate to login page
2. Prompt user to manually login in browser
3. After user confirms, `open_url` to return to target page
4. `get_page_content` to extract content

### Long Documents / Paginated Content

1. `get_page_content` to get current visible content
2. `scroll_page` to scroll and load more
3. Repeat extraction until complete

Or use `execute_script` to click "Load More":

```javascript
(() => {
  var btn = document.querySelector('.load-more');
  if (btn) { btn.click(); return 'clicked'; }
  return 'no more';
})()
```

### Monitor API for Data

1. `start_network_listener` to begin monitoring
2. `open_url` or `reload_tab` to trigger requests
3. `get_network_requests` to get all requests
4. Filter target API, view response data
5. `stop_network_listener` to stop monitoring

## Example Dialogues

### Scraping Login-Required Docs

```
User: Help me read content from https://docs.example.com/api
You: Opening page... Detected logged in, extracting content...
You: Document content: [content]
```

### Scraping SPA Page

```
User: Can't get content from this page with curl
You: Opening page... Waiting for JS render... Getting content...
You: Page content: [content]
```

### Finding Data API

```
User: Help me find the product list API for this page
You: Starting network listener... Refreshing page...
You: Found /api/products, response contains 50 product records
User: Extract the data
You: [JSON data]
```
