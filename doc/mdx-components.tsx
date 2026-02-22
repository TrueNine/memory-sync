import {Callout} from './app/components/Callout'
import {Step, Steps} from './app/components/Steps'

type MDXComponents = Record<string, any>

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    Callout,
    Steps,
    Step,
    ...components
  }
}
