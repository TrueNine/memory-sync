import type { MDXComponents } from 'mdx/types';
import { Callout } from './components/Callout';
import { Steps, Step } from './components/Steps';

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    // 自定义组件
    Callout,
    Steps,
    Step,
    // 保留默认组件
    ...components
  };
}

