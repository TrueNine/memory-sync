# Collections

## Basic Collection

```ts
import type { CollectionConfig } from 'payload'

export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'author', 'status', 'createdAt'],
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'slug', type: 'text', unique: true, index: true },
    { name: 'content', type: 'richText' },
    { name: 'author', type: 'relationship', relationTo: 'users' },
  ],
  timestamps: true,
}
```

## Auth Collection

```ts
export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  fields: [
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      options: ['admin', 'editor', 'user'],
      defaultValue: ['user'],
      saveToJWT: true, // store in JWT for access checks
    },
  ],
}
```

## Media Upload

```ts
export const Media: CollectionConfig = {
  slug: 'media',
  upload: {
    staticDir: 'media',
    mimeTypes: ['image/*'],
    imageSizes: [
      { name: 'thumbnail', width: 400, height: 300 },
      { name: 'card', width: 768, height: 1024 },
    ],
    adminThumbnail: 'thumbnail',
  },
  fields: [{ name: 'alt', type: 'text', required: true }],
}
```

## Drafts

```ts
export const Pages: CollectionConfig = {
  slug: 'pages',
  versions: {
    drafts: { 
      autosave: true, 
      schedulePublish: true,
    },
    maxPerDoc: 100,
  },
  access: {
    read: ({ req: { user } }) =>
      user ? true : { _status: { equals: 'published' } },
  },
}
```

## Common Field Patterns

### Auto Slug

```ts
import { slugField } from 'payload'

slugField({ fieldToUse: 'title' })
```

### Relationship + Filter

```ts
{ 
  name: 'category', 
  type: 'relationship', 
  relationTo: 'categories',
  filterOptions: { active: { equals: true } },
}
```

### Conditional Field

```ts
{ 
  name: 'featuredImage', 
  type: 'upload', 
  relationTo: 'media',
  admin: { 
    condition: (data) => data.featured === true,
  },
}
```

### Rich Text Field

```ts
{ 
  name: 'content', 
  type: 'richText',
  editor: lexicalEditor({
    features: ({ defaultFeatures }) => [
      ...defaultFeatures,
      // custom features
    ],
  }),
}
```

### Array Field

```ts
{
  name: 'tags',
  type: 'array',
  fields: [
    { name: 'label', type: 'text', required: true },
    { name: 'value', type: 'text', required: true },
  ],
}
```

### Group Field

```ts
{
  name: 'meta',
  type: 'group',
  fields: [
    { name: 'title', type: 'text' },
    { name: 'description', type: 'textarea' },
    { name: 'keywords', type: 'text' },
  ],
}
```

## Admin Config

### Custom List View

```ts
admin: {
  useAsTitle: 'title',
  defaultColumns: ['title', 'status', 'createdAt'],
  listSearchableFields: ['title', 'slug'],
  pagination: {
    defaultLimit: 25,
    limits: [10, 25, 50, 100],
  },
}
```

### Custom Components

```ts
admin: {
  components: {
    views: {
      Edit: '/components/CustomEdit',
    },
    fields: {
      title: {
        Field: '/components/CustomTitleField',
      },
    },
  },
}
```

## Field Type Quick Reference

| Type | Use | Example |
|:-----|:-----|:-----|
| `text` | Single-line text | Title, name |
| `textarea` | Multi-line text | Description, summary |
| `richText` | Rich text | Article body |
| `number` | Number | Price, count |
| `email` | Email | User email |
| `date` | Date | Publish date |
| `checkbox` | Boolean | Active flag |
| `select` | Single/multi select | Status, tags |
| `relationship` | Relation | Author, category |
| `upload` | File upload | Image, document |
| `array` | Array | Tag list |
| `group` | Group | SEO meta |
| `blocks` | Block editor | Flexible layout |
| `json` | JSON | Custom data |
