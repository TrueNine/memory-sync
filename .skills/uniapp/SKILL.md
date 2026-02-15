---
name: uniapp
description: uni-app 3 cross-platform development standards. Vue 3 + TypeScript + Vite. Activate for WeChat/Alipay miniprogram or H5.
displayName: uni-app 3 Cross-Platform Dev
keywords:
  - uniapp
  - uni-app
  - miniprogram
  - weixin
  - wechat
  - alipay
  - mp-weixin
  - mp-alipay
  - h5
author: TrueNine
version: 2025.01.16
---
# uni-app 3 Cross-Platform Dev

> Official docs: [uniapp.dcloud.net.cn](https://uniapp.dcloud.net.cn)

## Core Constraints (Primacy)

- Stack: **Vue 3 + TypeScript + Vite**
- Target platforms: WeChat miniprogram (primary), Alipay miniprogram (compat check), H5 (lightweight demo)
- ⚠️ **No APP builds**: uni-app APP packaging has poor UX and many pitfalls; use native or Flutter instead
- ⚠️ **No uni-app x**: uts ecosystem immature, poor npm compatibility
- Size unit: **rpx** (750 design baseline)
- Conditional compile: `#ifdef` / `#ifndef` for platform differences

---

## Project Structure

```
├── src/
│   ├── pages/           # Pages
│   ├── components/      # Components
│   ├── composables/     # Composables
│   ├── stores/          # Pinia stores
│   ├── utils/           # Utilities
│   ├── types/           # Type definitions
│   ├── static/          # Static assets (platform subdirs supported)
│   │   ├── mp-weixin/   # WeChat-specific assets
│   │   ├── mp-alipay/   # Alipay-specific assets
│   │   └── h5/          # H5-specific assets
│   ├── App.vue
│   ├── main.ts
│   ├── manifest.json    # App config
│   ├── pages.json       # Page routes
│   └── uni.scss         # Global style vars
├── vite.config.ts
└── tsconfig.json
```

---

## On-Demand Loading

- **CLI & Init** [cli.md](cli.md): Project creation, deps install, dev/debug
- **Conditional Compile** [conditional.md](conditional.md): Platform handling, identifiers
- **WeChat Miniprogram** [mp-weixin.md](mp-weixin.md): WeChat APIs, login, payment
- **Alipay Miniprogram** [mp-alipay.md](mp-alipay.md): Alipay differences, Zhima Credit
- **H5** [h5.md](h5.md): Web features, routing modes, CORS
- **UnoCSS Integration** [unocss.md](unocss.md): Atomic CSS + Iconify icons, ⚠️ requires `cssToWxss` plugin for style issues

---

## Template References

- Vue page: [page.vue](templates/page.vue)
- Conditional compile: [conditional.ts](templates/conditional.ts)
- Platform adapter component: [platform-adapter.vue](templates/platform-adapter.vue)

---

## Common API Quick Reference

```typescript
// Routing
uni.navigateTo({ url: '/pages/detail/detail?id=1' })
uni.redirectTo({ url: '/pages/home/home' })
uni.switchTab({ url: '/pages/index/index' })
uni.navigateBack({ delta: 1 })

// Storage
uni.setStorageSync('key', value)
const data = uni.getStorageSync('key')
uni.removeStorageSync('key')

// Request
uni.request({
  url: 'https://api.example.com/data',
  method: 'GET',
  success: (res) => console.log(res.data),
  fail: (err) => console.error(err)
})

// Toast/Modal
uni.showToast({ title: 'Success', icon: 'success' })
uni.showLoading({ title: 'Loading' })
uni.hideLoading()
uni.showModal({ title: 'Confirm', content: 'Delete this item?' })
```

---

## Acceptance Criteria (Recency)

**Build Verification (all must pass)**

```bash
pnpm build:mp-weixin  # WeChat miniprogram build
pnpm build:mp-alipay  # Alipay miniprogram build
```

**Functional Checks**

- [ ] Vue 3 + TypeScript, complete types
- [ ] Size unit is rpx
- [ ] WeChat miniprogram works correctly
- [ ] Alipay miniprogram compatibility verified
- [ ] H5 basic functionality available