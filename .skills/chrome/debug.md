# Debug & Diagnose

Applicable scenarios: Frontend errors, network request analysis, UI effect verification

## Workflow

### JS Error Diagnosis

1. `get_current_tab_info` to confirm current page
2. `execute_script` to check console errors:
   ```javascript
   (() => {
     // Check specific variable state
     return typeof myVar !== 'undefined' ? myVar : 'undefined';
   })()
   ```
3. After locating issue, `execute_script` to verify fix

### Network Issue Analysis

1. `start_network_listener` to begin monitoring
2. `reload_tab` to refresh page and trigger requests
3. `get_network_requests` to get all requests
4. Filter failed requests (4xx/5xx) or slow requests
5. `stop_network_listener` to stop monitoring

### UI Effect Verification

1. `get_current_tab_info` to confirm page
2. `take_screenshot` to capture current state
3. `get_element_by_selector` to check if element exists
4. `execute_script` to check element styles:
   ```javascript
   (() => {
     var el = document.querySelector('.target');
     if (!el) return 'not found';
     var style = getComputedStyle(el);
     return { display: style.display, visibility: style.visibility };
   })()
   ```

### Interaction Issue Troubleshooting

1. `get_element_by_selector` to confirm element exists
2. `click_element` or `fill_input` to execute action
3. `take_screenshot` to capture result
4. If issues persist, use `execute_script` to check event bindings

## Example Dialogues

### Page Error

```
User: Page is blank, help me check
You: Getting page info... Executing script to check errors...
You: Found issue: data variable is undefined, rendered before data loaded
```

### Button Click Unresponsive

```
User: Login button won't click
You: Checking element... Button exists
You: Attempting click... Executing script to check event bindings...
You: Found handleLogin function undefined, check if properly imported
```

### Finding API Data

```
User: Help me find the data API for this page
You: Starting network listener... Refreshing page...
You: Found /api/list endpoint, response contains 50 records
```
