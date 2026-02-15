# TSX Component Pattern Guidelines

## Component Structure

When generating React/TSX components, follow these structural principles:

1. Split logically related UI modules into independent sub-components, each with single responsibility
2. Declare all sub-components as `const` before main component, making dependency order clear
3. Keep each sub-component within 30-40 lines, further decompose if needed
4. Use semantic naming (`VideoOverlay`, `ActionButton`, `CreatorInfo`) for quick lookup and reuse
5. Use Props to clarify data and event flow, main component only handles assembly and state dispatch
6. Regularly review if sub-components can be extracted to shared directory to avoid duplication

## Example

```tsx
// Sub-components defined first
const PlayOverlay = ({ isPlaying, onToggle }: PlayOverlayProps) => (
  <div className="...">...</div>
)

const ActionButtons = ({ likes, comments }: ActionButtonsProps) => (
  <div className="...">...</div>
)

// Main component uses sub-components
export function VideoFeed({ videos }: VideoFeedProps) {
  return (
    <div>
      {videos.map(v => (
        <PlayOverlay ... />
        <ActionButtons ... />
      ))}
    </div>
  )
}
```

## Core Principle

Main component handles orchestration, sub-components handle details—achieving a stable "split first, compose later" workflow.
