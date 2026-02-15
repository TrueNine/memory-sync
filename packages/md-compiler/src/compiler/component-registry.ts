import type {ComponentHandler} from './types' // Registry for built-in MDX components // component-registry.ts

/** Registry of built-in components */
const componentRegistry = new Map<string, ComponentHandler>()

/**
 * Register a built-in component handler.
 * @param name - Component name (e.g., "Md")
 * @param handler - Component handler function
 */
export function registerComponent(name: string, handler: ComponentHandler): void {
  componentRegistry.set(name, handler)
}

/**
 * Get a copy of all registered components.
 * Returns a new Map to prevent external mutation of the registry.
 */
export function getComponents(): Map<string, ComponentHandler> {
  return new Map(componentRegistry)
}

/**
 * Check if a component is registered.
 * @param name - Component name to check
 */
export function hasComponent(name: string): boolean {
  return componentRegistry.has(name)
}

/**
 * Clear all registered components.
 * Useful for testing purposes.
 */
export function clearComponents(): void {
  componentRegistry.clear()
}
