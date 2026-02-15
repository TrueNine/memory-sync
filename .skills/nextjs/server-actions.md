# Server Actions Guide

## Basic Usage

### Define Server Action

```typescript
// app/actions.ts
'use server'

export async function createPost(formData: FormData) {
  const title = formData.get('title') as string
  const content = formData.get('content') as string

  await db.post.create({
    data: { title, content }
  })

  revalidatePath('/posts')
}
```

### Use in Forms

```typescript
// app/posts/new/page.tsx
import { createPost } from '@/app/actions'

export default function NewPost() {
  return (
    <form action={createPost}>
      <input name="title" required />
      <textarea name="content" required />
      <button type="submit">Create</button>
    </form>
  )
}
```

## Action with Parameters

```typescript
// app/actions.ts
'use server'

export async function deletePost(id: string) {
  await db.post.delete({ where: { id } })
  revalidatePath('/posts')
}

// Use bind to pass params
import { deletePost } from '@/app/actions'

export default function Post({ id }: { id: string }) {
  const deleteWithId = deletePost.bind(null, id)

  return (
    <form action={deleteWithId}>
      <button type="submit">Delete</button>
    </form>
  )
}
```

## Return Values

```typescript
// app/actions.ts
'use server'

export async function createUser(formData: FormData) {
  const email = formData.get('email') as string

  const existing = await db.user.findUnique({ where: { email } })
  if (existing) {
    return { error: 'Email already exists' }
  }

  const user = await db.user.create({
    data: { email }
  })

  return { success: true, user }
}
```

## useFormState

Handle Action return values:

```typescript
'use client'
import { useFormState } from 'react-dom'
import { createUser } from '@/app/actions'

const initialState = { error: null, success: false }

export default function SignUp() {
  const [state, formAction] = useFormState(createUser, initialState)

  return (
    <form action={formAction}>
      <input name="email" type="email" required />
      {state.error && <p className="error">{state.error}</p>}
      <button type="submit">Sign Up</button>
    </form>
  )
}
```

## useFormStatus

Display submission status:

```typescript
'use client'
import { useFormStatus } from 'react-dom'

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Submitting...' : 'Submit'}
    </button>
  )
}

export default function Form() {
  return (
    <form action={createPost}>
      <input name="title" />
      <SubmitButton />
    </form>
  )
}
```

## Optimistic Updates

```typescript
'use client'
import { useOptimistic } from 'react'
import { addTodo } from '@/app/actions'

export default function TodoList({ todos }: { todos: Todo[] }) {
  const [optimisticTodos, addOptimisticTodo] = useOptimistic(
    todos,
    (state, newTodo: string) => [
      ...state,
      { id: 'temp', title: newTodo, completed: false }
    ]
  )

  async function handleSubmit(formData: FormData) {
    const title = formData.get('title') as string
    addOptimisticTodo(title)
    await addTodo(formData)
  }

  return (
    <>
      <form action={handleSubmit}>
        <input name="title" />
        <button type="submit">Add</button>
      </form>
      <ul>
        {optimisticTodos.map(todo => (
          <li key={todo.id}>{todo.title}</li>
        ))}
      </ul>
    </>
  )
}
```

## Error Handling

```typescript
// app/actions.ts
'use server'

import { z } from 'zod'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
})

export async function signUp(formData: FormData) {
  const result = schema.safeParse({
    email: formData.get('email'),
    password: formData.get('password')
  })

  if (!result.success) {
    return { errors: result.error.flatten().fieldErrors }
  }

  try {
    await createUser(result.data)
    return { success: true }
  } catch (e) {
    return { error: 'Failed to create user' }
  }
}
```

## Redirect

```typescript
'use server'
import { redirect } from 'next/navigation'

export async function createPost(formData: FormData) {
  const post = await db.post.create({
    data: { title: formData.get('title') as string }
  })

  redirect(`/posts/${post.id}`)
}
```

## Best Practices

1. **Validate input**: Use Zod or similar libraries
2. **Return structured data**: Easier client-side handling
3. **Use revalidatePath/revalidateTag**: Update cache
4. **Optimistic updates**: Improve UX
5. **Error boundaries**: Handle unexpected errors
