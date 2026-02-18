import { Callout } from './app/components/Callout';
import { Steps, Step } from './app/components/Steps';

type MDXComponents = Record<string, any>;

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    Callout,
    Steps,
    Step,
    ...components
  };
}
