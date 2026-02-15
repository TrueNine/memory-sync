## 08_Page_Design.md

Page design spec defines system page inventory, page elements, route relationships and platform adaptation, complementing UI Design (design system variables).

### Positioning

**What it is**: Page-level design spec, including page inventory, page elements, route architecture, platform adaptation.

**What it's not**: Does not include design system variables (colour/typography/spacing), specific UI component implementation, business logic code.

**Relationship with UI Design**:
- UI Design = Design system base variables (for AI design tools)
- Page Design = Page structure and content (for developers)

### Applicable Scenarios

| Platform | Tech Stack Examples |
|----------|-------------------|
| Web SPA/MPA | React/Vue/Next.js/Nuxt |
| Mobile App | React Native/Flutter/SwiftUI/Jetpack Compose |
| Mini-program | Taro/uni-app/Native WeChat/Alipay |
| Desktop | Electron/Tauri/WPF/SwiftUI |
| Browser Extension | Chrome Extension/Firefox Add-on |

### Required Sections

```md
# Page Design Specification

## Platform Info
Target platform and tech stack.

## Page Inventory
Page list: all pages and their responsibilities.

## Page Elements
Page elements: what content each page displays.

## Route Architecture
Route structure: hierarchy, route naming, parameter design.

## Navigation Flow
Navigation flow: how users navigate between pages.

## Shared Layouts
Shared layouts: Header/Footer/Sidebar/TabBar and other reusable structures.

## Guard & Redirect
Route guards: permission control, login interception, redirect rules.

## Platform Adaptation
Platform adaptation: special handling for different platforms.
```

### Maintenance Rules

- **Create timing**: After UI Design confirmed, before development
- **Update timing**: When adding pages, route changes, page element adjustments
- **Prohibited**: Including design system variables, component library code, business logic


### Example

```md
# Page Design Specification

## Platform Info

| Aspect | Value |
|--------|-------|
| Platform | Web SPA |
| Framework | React + React Router |
| Target | Desktop & Mobile responsive |

## Page Inventory

### Auth Module
| Page | Route | Purpose | Auth |
|------|-------|---------|------|
| Login | /login | User authentication | No |
| Register | /register | New user signup | No |
| Forgot Password | /forgot-password | Password recovery | No |

### Main Module
| Page | Route | Purpose | Auth |
|------|-------|---------|------|
| Dashboard | /dashboard | Overview & quick actions | Yes |
| Project List | /projects | All projects | Yes |
| Project Detail | /projects/[id] | Single project view | Yes |
| Settings | /settings | User preferences | Yes |

### Public Module
| Page | Route | Purpose | Auth |
|------|-------|---------|------|
| Landing | / | Marketing homepage | No |
| Pricing | /pricing | Pricing plans | No |

## Page Elements

### Login Page `/login`

**Purpose**: User authentication entry point.

**Elements**:
| Element | Type | Description | Required |
|---------|------|-------------|----------|
| Logo | Image | Brand logo, clickable to landing | Yes |
| Page Title | Text | "Welcome Back" or similar | Yes |
| Email Input | Input | Email/username field | Yes |
| Password Input | Input | Password field with toggle visibility | Yes |
| Remember Me | Checkbox | Persist login session | No |
| Login Button | Button | Primary action, submit form | Yes |
| Forgot Password Link | Link | Navigate to /forgot-password | Yes |
| Register Link | Link | Navigate to /register | Yes |
| Social Login | Button Group | Google/GitHub/WeChat OAuth | Optional |
| Error Message | Alert | Display login errors | Conditional |

**States**:
- Default: Empty form
- Loading: Button shows spinner, inputs disabled
- Error: Show error message, highlight invalid fields
- Success: Redirect to /dashboard


---

### Dashboard Page `/dashboard`

**Purpose**: User's home base after login.

**Elements**:
| Element | Type | Description | Required |
|---------|------|-------------|----------|
| Welcome Banner | Card | Greeting with user name, quick tips | Yes |
| Stats Cards | Card Grid | Key metrics (4 cards) | Yes |
| Recent Projects | List | Last 5 accessed projects | Yes |
| Quick Actions | Button Group | Create project, invite member | Yes |
| Activity Feed | Timeline | Recent activities | Optional |
| Notifications | Badge/Dropdown | Unread notifications count | Yes |

**Stats Cards Content**:
| Card | Metric | Icon |
|------|--------|------|
| Total Projects | Count | Folder |
| Active Tasks | Count | CheckCircle |
| Team Members | Count | Users |
| Storage Used | Percentage | HardDrive |

---

### Project Detail Page `/projects/[id]`

**Purpose**: View and manage single project.

**Elements**:
| Element | Type | Description | Required |
|---------|------|-------------|----------|
| Breadcrumb | Navigation | Projects > Project Name | Yes |
| Project Header | Section | Name, description, status badge | Yes |
| Action Buttons | Button Group | Edit, Share, Delete, More | Yes |
| Tab Navigation | Tabs | Overview / Files / Members / Settings | Yes |
| Tab Content | Dynamic | Content based on active tab | Yes |

**Tab: Overview**:
| Element | Type | Description |
|---------|------|-------------|
| Project Info | Card | Created date, owner, visibility |
| Progress Bar | Progress | Completion percentage |
| Recent Files | List | Last 5 modified files |
| Team Preview | Avatar Group | First 5 members + count |

**Tab: Files**:
| Element | Type | Description |
|---------|------|-------------|
| Upload Button | Button | Add new files |
| Search Input | Input | Filter files |
| File List | Table | Name, size, modified, actions |
| Empty State | Illustration | When no files |

**Tab: Members**:
| Element | Type | Description |
|---------|------|-------------|
| Invite Button | Button | Add new member |
| Member List | Table | Avatar, name, role, actions |
| Role Filter | Select | Filter by role |

**Tab: Settings**:
| Element | Type | Description |
|---------|------|-------------|
| Project Name | Input | Editable name |
| Description | Textarea | Editable description |
| Visibility | Radio | Public / Private |
| Danger Zone | Section | Archive, Delete project |


## Route Architecture

### Route Hierarchy
```
/                           # Landing
├── (auth)/                 # Auth layout group
│   ├── login
│   ├── register
│   └── forgot-password
├── (main)/                 # Main layout group
│   ├── dashboard
│   ├── projects/
│   │   ├── [id]           # Project detail
│   │   └── [id]/settings  # Project settings
│   └── settings/
│       ├── profile
│       └── account
└── (public)/               # Public layout group
    ├── about
    └── pricing
```

### Route Parameters
| Route | Param | Type | Validation |
|-------|-------|------|------------|
| /projects/[id] | id | string | UUID format |
| /users/[userId] | userId | string | UUID format |

## Navigation Flow

### Primary User Flows
```
[Landing] → [Login] → [Dashboard] → [Project List] → [Project Detail]
                ↓
           [Register]
```

### Navigation Matrix
| From | To | Trigger | Condition |
|------|----|---------|-----------|
| Any | /login | Click login | Not authenticated |
| /login | /dashboard | Login success | - |
| /dashboard | /projects/[id] | Click project card | - |
| /projects/[id] | /projects | Click back/breadcrumb | - |

## Shared Layouts

### Main Layout
```
┌─────────────────────────────────────────┐
│ [Header]                                │
│ Logo | Nav | Search | Notifications | Avatar
├─────────────────────────────────────────┤
│ [Sidebar]  │ [Main Content]             │
│ • Dashboard│                            │
│ • Projects │                            │
│ • Settings │                            │
├────────────┴────────────────────────────┤
│ [Footer] (optional)                     │
└─────────────────────────────────────────┘
```

### Auth Layout
```
┌─────────────────────────────────────────┐
│ [Header] Logo only                      │
├─────────────────────────────────────────┤
│                                         │
│         [Auth Form - Centered]          │
│                                         │
├─────────────────────────────────────────┤
│ [Footer] Legal links                    │
└─────────────────────────────────────────┘
```

## Guard & Redirect

| Route Pattern | Guard | Redirect |
|---------------|-------|----------|
| /dashboard/* | requireAuth | /login?redirect={from} |
| /admin/* | requireAdmin | /403 |
| /login | redirectIfAuth | /dashboard |

### Error Pages
| Code | Route | Elements |
|------|-------|----------|
| 403 | /403 | Icon, "Access Denied", back button |
| 404 | /404 | Icon, "Page Not Found", home button |
| 500 | /500 | Icon, "Server Error", retry button |
```


---

## Platform Adaptation

Different platforms have different page organisation and navigation patterns.

### Web SPA/MPA

**Navigation Patterns**:
- Desktop: Sidebar + Header combo
- Mobile: Bottom TabBar + Hamburger Menu

**Route Features**:
- URL-based routing
- Supports Deep Link, bookmarks, sharing
- Browser history management

**Example Structure**:
```
Desktop:
┌─────────────────────────────────────┐
│ [Header]                            │
├──────────┬──────────────────────────┤
│ [Sidebar]│ [Content]                │
└──────────┴──────────────────────────┘

Mobile:
┌─────────────────┐
│ [Header]        │
├─────────────────┤
│ [Content]       │
├─────────────────┤
│ [TabBar]        │
└─────────────────┘
```


---

### Mobile App (React Native / Flutter / Native)

**Navigation Patterns**:
| Pattern | Usage | Example |
|---------|-------|---------|
| Stack | Hierarchical pages | List → Detail → Edit |
| Tab | Main module switch | Home / Search / Profile |
| Drawer | Side menu | Settings, Help, Logout |
| Modal | Temporary actions | Create, Filter, Confirm |

**Page Inventory Example**:
| Screen | Navigator | Gesture |
|--------|-----------|---------|
| Home | Tab[0] | - |
| Search | Tab[1] | - |
| Profile | Tab[2] | - |
| Detail | Stack | Swipe back |
| Settings | Drawer | - |
| Create Modal | Modal | Swipe down to dismiss |

**Special Elements**:
| Element | iOS | Android |
|---------|-----|---------|
| Navigation Bar | Large Title, Back | Toolbar, Up button |
| Tab Bar | Bottom, 5 items max | Bottom Navigation |
| Status Bar | Light/Dark content | Translucent |
| Safe Area | Notch, Home Indicator | System bars |
| Pull to Refresh | Native bounce | Material indicator |

**Deep Link Config**:
| Platform | Scheme | Example |
|----------|--------|---------|
| iOS | Universal Links | https://app.example.com/projects/123 |
| Android | App Links | https://app.example.com/projects/123 |
| Custom | myapp:// | myapp://projects/123 |


---

### Mini-program (Taro / uni-app / Native)

**Page Limits**:
| Limit | Value | Note |
|-------|-------|------|
| Page Stack | 10 layers max | Exceeding requires redirectTo |
| TabBar Pages | 2-5 items | Must declare in app.json |
| Package Size | 2MB main / 20MB total | Requires subpackage loading |

**Navigation API**:
| API | Usage | Stack Effect |
|-----|-------|--------------|
| navigateTo | Enter subpage | Push |
| redirectTo | Replace current | Replace |
| navigateBack | Go back | Pop |
| switchTab | Switch Tab | Clear & Switch |
| reLaunch | Restart app | Clear all |

**Page Inventory Example**:
```json
{
  "pages": [
    "pages/index/index",
    "pages/list/list",
    "pages/detail/detail",
    "pages/mine/mine"
  ],
  "tabBar": {
    "list": [
      { "pagePath": "pages/index/index", "text": "Home" },
      { "pagePath": "pages/list/list", "text": "List" },
      { "pagePath": "pages/mine/mine", "text": "Mine" }
    ]
  },
  "subPackages": [
    {
      "root": "packageA",
      "pages": ["pages/settings/settings"]
    }
  ]
}
```

**Special Elements**:
| Element | Description |
|---------|-------------|
| Navigation Bar | Native nav bar, customisable |
| TabBar | Native bottom bar, max 5 |
| Custom TabBar | Custom bottom bar (complex interactions) |
| Share Button | Top-right share menu |
| Pull Down Refresh | Pull-to-refresh config |


---

### Desktop App (Electron / Tauri)

**Window Types**:
| Window | Size | Purpose |
|--------|------|---------|
| Main Window | 1200x800 default | Primary workspace |
| Settings Window | 600x400 | Preferences |
| About Window | 400x300 | App info |
| Tray Menu | - | Quick actions |

**Navigation Patterns**:
| Pattern | Usage |
|---------|-------|
| Sidebar | Module navigation |
| Tab Bar | Document tabs (like VS Code) |
| Menu Bar | File/Edit/View/Help |
| Context Menu | Right-click actions |
| Command Palette | Keyboard-driven navigation |

**Special Elements**:
| Element | macOS | Windows | Linux |
|---------|-------|---------|-------|
| Title Bar | Traffic lights (left) | Controls (right) | Controls (right) |
| Menu Bar | System menu bar | In-window | In-window |
| Dock/Taskbar | Dock icon + badge | Taskbar + overlay | Varies |
| Tray | Menu bar icon | System tray | System tray |
| Notifications | Notification Center | Action Center | Native |

**Example Structure**:
```
┌─────────────────────────────────────────┐
│ [Title Bar] ● ● ●          App Name    │
├─────────────────────────────────────────┤
│ [Menu Bar] File Edit View Help         │
├─────────────────────────────────────────┤
│ [Toolbar] Actions, Search              │
├──────────┬──────────────────────────────┤
│ [Sidebar]│ [Tab Bar]                   │
│ • Files  │ Tab1 | Tab2 | Tab3          │
│ • Search ├──────────────────────────────┤
│ • Git    │ [Content Area]              │
├──────────┴──────────────────────────────┤
│ [Status Bar] Branch: main | Ln 42      │
└─────────────────────────────────────────┘
```


---

### Browser Extension (Chrome / Firefox)

**View Types**:
| View | Size | Trigger | Persistence |
|------|------|---------|-------------|
| Popup | 400x600 max | Click icon | Closes on blur |
| Side Panel | 400px width | User toggle | Persists |
| Options Page | Full tab | Right-click → Options | Tab |
| Content Script | Injected | Page load | Per page |
| Background | No UI | Always | Service worker |

**Page Inventory Example**:
| View | Entry | Purpose |
|------|-------|---------|
| Popup | popup.html | Quick actions, status |
| Side Panel | sidepanel.html | Persistent workspace |
| Options | options.html | Settings, preferences |
| Onboarding | onboarding.html | First-time setup |

**Popup Elements**:
| Element | Description |
|---------|-------------|
| Header | Logo, title, close (optional) |
| Quick Actions | Primary buttons |
| Status | Current state display |
| List | Recent items, shortcuts |
| Footer | Settings link, version |

**Example Structure**:
```
Popup (400x500):
┌────────────────────┐
│ [Header]           │
│ Logo    Settings ⚙ │
├────────────────────┤
│ [Quick Actions]    │
│ [Action 1] [Act 2] │
├────────────────────┤
│ [Status Card]      │
│ Current: Active    │
├────────────────────┤
│ [Recent List]      │
│ • Item 1           │
│ • Item 2           │
├────────────────────┤
│ [Footer] v1.0.0    │
└────────────────────┘
```

**Permission & Communication**:
| From | To | Method |
|------|----|--------|
| Popup | Background | chrome.runtime.sendMessage |
| Content | Background | chrome.runtime.sendMessage |
| Background | Content | chrome.tabs.sendMessage |
| Any | Storage | chrome.storage.sync/local |
