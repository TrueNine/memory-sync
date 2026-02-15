# UnoCSS + Iconify Integration

> Configuration guide for UnoCSS atomic CSS in WeChat Mini Program

## Dependencies

```bash
pnpm add -D unocss unocss-preset-weapp @unocss/preset-icons @iconify-json/carbon @iconify-json/mdi @iconify-json/flagpack
```

---

## Known Issues

| Issue | Cause | Solution |
|:------|:------|:---------|
| Styles not applied | uni-app outputs `.css` instead of `.wxss` ([#4061](https://github.com/dcloudio/uni-app/issues/4061)) | Add `cssToWxss()` plugin in `vite.config.ts` |
| `@uni-helper/unocss-preset-uni` ineffective | Poor WeChat Mini Program support | Use `unocss-preset-weapp` instead |
| Size too small | `w-40` = `40rpx`, not rem | Use larger values like `w-160` |

---

## Configuration

### uno.config.ts

```typescript
import { defineConfig } from 'unocss'
import presetWeapp from 'unocss-preset-weapp'
import { extractorAttributify, transformerClass } from 'unocss-preset-weapp/transformer'
import presetIcons from '@unocss/preset-icons'

const { presetWeappAttributify, transformerAttributify } = extractorAttributify()

export default defineConfig({
  presets: [presetWeapp(), presetWeappAttributify(), presetIcons()],
  transformers: [transformerAttributify(), transformerClass()],
})
```

### vite.config.ts

Add `cssToWxss()` plugin for `.css` → `.wxss` renaming:

```typescript
import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import UnoCSS from 'unocss/vite'

// CSS to WXSS plugin
function cssToWxss() {
  return {
    name: 'css-to-wxss',
    generateBundle(_: unknown, bundle: Record<string, { fileName: string }>) {
      for (const key in bundle) {
        if (key.endsWith('.css')) {
          const newKey = key.replace(/\.css$/, '.wxss')
          bundle[newKey] = bundle[key]
          bundle[newKey].fileName = bundle[newKey].fileName.replace(/\.css$/, '.wxss')
          delete bundle[key]
        }
      }
    },
  }
}

export default defineConfig({
  plugins: [uni(), UnoCSS(), cssToWxss()],
})
```

### main.ts

Import UnoCSS here only:

```typescript
import 'virtual:uno.css'
```

---

## Usage Example

```vue
<template>
  <view class="flex gap-2 p-4 bg-gray-100 rounded-lg">
    <view class="i-carbon-home text-2xl text-blue-600"></view>
    <view class="i-mdi-heart text-red-500"></view>
    <view class="i-flagpack-cn text-3xl"></view>
  </view>
</template>
```

---

## Notes

- **Unit conversion**: `w-40` equals `40rpx` in Mini Program, adjust values per design spec
- **Icon prefix**: Use `i-{collection}-{icon}` format, e.g. `i-carbon-home`
- **Style files**: Ensure `cssToWxss` plugin correctly converts file extensions in production build
