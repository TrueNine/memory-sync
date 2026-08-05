import {
  MarkdownRenderChild,
  MarkdownRenderer,
  MarkdownView,
  Platform,
  Plugin,
  TFile,
  setIcon,
} from 'obsidian'
import type {MarkdownPostProcessorContext} from 'obsidian'

import {mergeScopeLayers} from './compiler/compiler'
import type {CompileDiagnostic, TnmsoSettings} from './compiler/types'
import {PreviewDiagnosticStore} from './preview/diagnostic-store'
import {processPreviewSection} from './preview/processor'
import {PromptMetadataCache} from './preview/prompt-metadata-cache'
import {normalizeSettings} from './settings'
import {TnmsoSettingTab} from './settings-tab'

const RENDERED_ATTRIBUTE = 'data-tnmso-rendered'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

export default class TnmsoPlugin extends Plugin {
  override settings: TnmsoSettings = normalizeSettings(undefined)

  readonly #diagnostics = new PreviewDiagnosticStore()
  #metadataCache!: PromptMetadataCache
  #statusBarItem?: HTMLElement

  override async onload(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData())
    this.#metadataCache = new PromptMetadataCache(async path => {
      const file = this.app.vault.getAbstractFileByPath(path)
      if (!(file instanceof TFile)) throw new Error(`Prompt file is unavailable: ${path}`)
      return this.app.vault.cachedRead(file)
    })

    this.registerExtensions(['mdx'], 'markdown')
    this.registerMarkdownPostProcessor(async (element, context) => {
      await this.#processSection(element, context)
    })

    this.addCommand({
      id: 'toggle-compiled-preview',
      name: 'Toggle compiled prompt preview',
      callback: () => {
        void this.setPreviewEnabled(!this.settings.compiledPreviewEnabled)
      },
    })

    if (!Platform.isMobile) {
      this.#statusBarItem = this.addStatusBarItem()
      this.#statusBarItem.addClass('tnmso-status')
      this.#statusBarItem.setAttr('role', 'button')
      this.#statusBarItem.setAttr('tabindex', '0')
      this.#statusBarItem.addEventListener('click', () => {
        void this.setPreviewEnabled(!this.settings.compiledPreviewEnabled)
      })
      this.#statusBarItem.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          void this.setPreviewEnabled(!this.settings.compiledPreviewEnabled)
        }
      })
    }

    this.addSettingTab(new TnmsoSettingTab(this))
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.#updateStatusBar()))
    this.registerEvent(this.app.vault.on('modify', file => {
      this.#invalidate(file.path)
    }))
    this.registerEvent(this.app.vault.on('delete', file => {
      this.#invalidate(file.path)
    }))
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      this.#metadataCache.rename(oldPath, file.path)
      this.#diagnostics.rename(oldPath, file.path)
      this.#updateStatusBar()
    }))

    this.#updateStatusBar()
  }

  async setPreviewEnabled(enabled: boolean): Promise<void> {
    this.settings = {...this.settings, compiledPreviewEnabled: enabled}
    await this.saveData(this.settings)
    this.#diagnostics.clear()
    this.#refreshMdxPreviews()
    this.#updateStatusBar()
  }

  async setScope(scope: Record<string, unknown>): Promise<void> {
    this.settings = {...this.settings, scope}
    await this.saveData(this.settings)
    this.#metadataCache.clear()
    this.#diagnostics.clear()
    this.#refreshMdxPreviews()
    this.#updateStatusBar()
  }

  async #processSection(element: HTMLElement, context: MarkdownPostProcessorContext): Promise<void> {
    const nested = element.closest(`[${RENDERED_ATTRIBUTE}="true"]`) != null
    const section = context.getSectionInfo(element)
    if (section == null && context.sourcePath.toLowerCase().endsWith('.mdx') && this.settings.compiledPreviewEnabled) {
      this.#setDiagnostics(context.sourcePath, 'unavailable', [{
        severity: 'warning',
        code: 'section-unavailable',
        message: 'Obsidian did not expose source information for this preview section.',
      }])
      return
    }
    if (section == null) return

    const cached = await this.#metadataCache.get(context.sourcePath)
    const frontmatter = isRecord(context.frontmatter) ? context.frontmatter : {}
    const scope = mergeScopeLayers(this.settings.scope, frontmatter, cached.metadata)

    const result = await processPreviewSection({
      sourcePath: context.sourcePath,
      source: section.text,
      enabled: this.settings.compiledPreviewEnabled,
      nested,
      scope,
      render: async markdown => {
        const detached = element.ownerDocument.body.createDiv()
        detached.detach()
        detached.setAttr(RENDERED_ATTRIBUTE, 'true')
        const child = new MarkdownRenderChild(element)
        context.addChild(child)
        try {
          await MarkdownRenderer.render(this.app, markdown, detached, context.sourcePath, child)
          element.setAttr(RENDERED_ATTRIBUTE, 'true')
          element.replaceChildren(...detached.childNodes)
        } catch (error) {
          child.unload()
          throw error
        }
      },
    })

    this.#setDiagnostics(context.sourcePath, 'metadata', cached.diagnostics)
    this.#setDiagnostics(context.sourcePath, `${section.lineStart}:${section.lineEnd}`, result.diagnostics)
  }

  #invalidate(path: string): void {
    this.#metadataCache.invalidate(path)
    this.#diagnostics.invalidate(path)
    this.#updateStatusBar()
  }

  #setDiagnostics(path: string, section: string, diagnostics: CompileDiagnostic[]): void {
    this.#diagnostics.set(path, section, diagnostics)
    if (this.app.workspace.getActiveFile()?.path === path) this.#updateStatusBar()
  }

  #refreshMdxPreviews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      if (leaf.view instanceof MarkdownView && leaf.view.file?.extension.toLowerCase() === 'mdx') {
        leaf.view.previewMode.rerender(true)
      }
    }
  }

  #updateStatusBar(): void {
    const item = this.#statusBarItem
    if (item == null) return
    const activeFile = this.app.workspace.getActiveFile()
    const isMdx = activeFile?.extension.toLowerCase() === 'mdx'
    item.toggleClass('tnmso-status--hidden', !isMdx)
    if (!isMdx) return

    const diagnostics = this.#diagnostics.get(activeFile.path)
    const hasWarnings = diagnostics.length > 0
    const state = !this.settings.compiledPreviewEnabled ? 'off' : hasWarnings ? 'warning' : 'enabled'
    item.removeClasses(['tnmso-status--off', 'tnmso-status--warning', 'tnmso-status--enabled'])
    item.addClass(`tnmso-status--${state}`)
    setIcon(item, state === 'warning' ? 'triangle-alert' : state === 'off' ? 'eye-off' : 'scan-eye')
    const label = state === 'warning'
      ? `TNMSO preview has ${diagnostics.length} diagnostic(s). Click to disable.`
      : state === 'off'
        ? 'TNMSO compiled preview is off. Click to enable.'
        : 'TNMSO compiled preview is on. Click to disable.'
    item.setAttr('aria-label', label)
    item.setAttr('title', label)
  }
}
