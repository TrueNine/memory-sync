## 04_UI_Design.md

UI design spec is the project's "visual DNA", defining design system base variables for AI design tools (Google Stitch/Figma Make) to quickly generate mockups.

### Positioning

**What it is**: Design system base config, can be directly copied to AI design tools to generate mockups.

**What it's not**: Does not include specific business pages, component library selection, code implementation.

### Applicable Scenarios

- Frontend Web apps
- Mobile Apps (React Native/Flutter/Native)
- Mini-programs (Taro/uni-app/Native)
- Desktop Apps (Electron/Tauri)
- Browser Extensions

### Required Sections

```md
# UI Design Specification

## Design System
Adopted design system or style foundation.

## Color Palette
Colour system: primary, secondary, semantic colours, light/dark themes.

## Typography
Font system: font families, size scale, line height.

## Spacing & Layout
Spacing system and layout grid.

## Visual Style
Visual style: border radius, shadows, borders.

## Animation
Animation spec: duration, easing curves.

## Viewport & Adaptation
Target viewports and adaptation strategy.

## Design Handoff
Mockup spec and delivery method.
```

### Maintenance Rules

- **Create timing**: After Product Context confirmed, before development
- **Update timing**: When design system changes
- **Prohibited**: Including specific business page designs, component library code

### Example

```md
# UI Design Specification

## Design System

| Aspect | Choice |
|--------|--------|
| Base System | Material Design 3 |
| Style | Clean, Minimal, Professional |
| Mood | Modern, clean, professional feel |
| Reference | Linear, Notion, Vercel |

## Color Palette

### Brand Colors
| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| primary | #3B82F6 | #60A5FA | Primary action, brand colour |
| primary-hover | #2563EB | #3B82F6 | Primary hover |
| secondary | #6366F1 | #818CF8 | Secondary emphasis |

### Semantic Colors
| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| success | #10B981 | #34D399 | Success state |
| warning | #F59E0B | #FBBF24 | Warning state |
| error | #EF4444 | #F87171 | Error state |
| info | #3B82F6 | #60A5FA | Info prompt |

### Neutral Colors
| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| background | #FFFFFF | #0F172A | Page background |
| surface | #F8FAFC | #1E293B | Card background |
| border | #E2E8F0 | #334155 | Border |
| text-primary | #0F172A | #F8FAFC | Primary text |
| text-secondary | #64748B | #94A3B8 | Secondary text |
| text-muted | #94A3B8 | #64748B | Muted text |

## Typography

### Font Family
| Type | Font | Fallback |
|------|------|----------|
| Sans | Inter | system-ui, sans-serif |
| Mono | JetBrains Mono | monospace |
| CN | Noto Sans SC | PingFang SC, Microsoft YaHei |

### Type Scale
| Level | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| display | 36px | 700 | 1.2 | Large title |
| h1 | 24px | 600 | 1.3 | Page title |
| h2 | 20px | 600 | 1.4 | Section title |
| h3 | 16px | 600 | 1.4 | Small title |
| body | 14px | 400 | 1.5 | Body text |
| small | 12px | 400 | 1.5 | Secondary text |
| caption | 11px | 400 | 1.4 | Labels, hints |

## Spacing & Layout

### Spacing Scale
Base unit: 4px

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Compact spacing |
| sm | 8px | Small spacing |
| md | 12px | Default spacing |
| lg | 16px | Large spacing |
| xl | 24px | Section spacing |
| 2xl | 32px | Large section spacing |
| 3xl | 48px | Page-level spacing |

### Layout Grid
| Viewport | Columns | Gutter | Margin |
|----------|---------|--------|--------|
| Mobile | 4 | 16px | 16px |
| Tablet | 8 | 24px | 32px |
| Desktop | 12 | 24px | auto |

## Visual Style

### Border Radius
| Token | Value | Usage |
|-------|-------|-------|
| none | 0 | No radius |
| sm | 4px | Small elements |
| md | 8px | Buttons, inputs |
| lg | 12px | Cards |
| xl | 16px | Large cards, modals |
| full | 9999px | Circle, pill |

### Shadow
| Token | Value (Light) | Usage |
|-------|---------------|-------|
| sm | 0 1px 2px rgba(0,0,0,0.05) | Slight elevation |
| md | 0 4px 6px rgba(0,0,0,0.07) | Cards |
| lg | 0 10px 15px rgba(0,0,0,0.1) | Modals, dropdowns |
| xl | 0 20px 25px rgba(0,0,0,0.15) | Modal dialogs |

### Border
| Token | Value | Usage |
|-------|-------|-------|
| default | 1px solid border-color | Default border |
| focus | 2px solid primary | Focus state |

## Animation

### Duration
| Token | Value | Usage |
|-------|-------|-------|
| instant | 0ms | No animation |
| fast | 100ms | Micro-interactions |
| normal | 200ms | Default transitions |
| slow | 300ms | Complex animations |
| slower | 500ms | Page transitions |

### Easing
| Token | Value | Usage |
|-------|-------|-------|
| ease-out | cubic-bezier(0, 0, 0.2, 1) | Enter |
| ease-in | cubic-bezier(0.4, 0, 1, 1) | Exit |
| ease-in-out | cubic-bezier(0.4, 0, 0.2, 1) | Move |
| spring | cubic-bezier(0.34, 1.56, 0.64, 1) | Bounce |

## Viewport & Adaptation

### Breakpoints
| Name | Width | Target |
|------|-------|--------|
| mobile | < 640px | Phone |
| tablet | 640-1024px | Tablet |
| desktop | 1024-1440px | Desktop |
| wide | > 1440px | Wide screen |

### Adaptation Strategy
| Platform | Strategy |
|----------|----------|
| Web | Responsive, Mobile First |
| Mini-program | 750rpx design, auto conversion |
| App | 375pt base, proportional scaling |
| Extension | Fixed width Popup, adaptive Side Panel |

## Design Handoff

### Design Tool
Figma / Figma Make / Google Stitch

### Design-to-Code
| Platform | Base Width | Unit | Conversion |
|----------|------------|------|------------|
| Web | 1440px | rem | 16px = 1rem |
| Mini-program | 750px | rpx | 1px = 2rpx |
| App | 375pt | dp/pt | 1:1 |

### Asset Export
| Type | Format | Scale |
|------|--------|-------|
| Icon | SVG | 1x |
| Image | WebP/PNG | 1x, 2x, 3x |
| Logo | SVG | 1x |
```
