import {PluginSettingTab, Setting} from 'obsidian'

import type TnmsoPlugin from './main'
import {parseScopeText} from './settings'

export class TnmsoSettingTab extends PluginSettingTab {
  constructor(private readonly plugin: TnmsoPlugin) {
    super(plugin.app, plugin)
  }

  override display(): void {
    this.containerEl.empty()

    new Setting(this.containerEl)
      .setName('Compiled prompt preview')
      .setDesc('Compile supported prompt syntax safely in reading view.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.compiledPreviewEnabled)
        .onChange(async value => {
          await this.plugin.setPreviewEnabled(value)
        }))

    const scopeSetting = new Setting(this.containerEl)
      .setName('Preview scope')
      .setDesc('Variables used to resolve safe prompt property paths.')
      .addTextArea(text => {
        text
          .setValue(JSON.stringify(this.plugin.settings.scope, null, 2))
          .setPlaceholder('{"profile":{"name":"Example"}}')
          .onChange(async value => {
            const parsed = parseScopeText(value)
            if (!parsed.ok) {
              scopeSetting.descEl.setText(`Invalid JSON: ${parsed.message}`)
              scopeSetting.descEl.addClass('tnmso-setting-error')
              return
            }
            scopeSetting.descEl.setText('Variables used to resolve safe prompt property paths.')
            scopeSetting.descEl.removeClass('tnmso-setting-error')
            await this.plugin.setScope(parsed.scope)
          })
      })
    scopeSetting.controlEl.addClass('tnmso-scope-control')
  }
}
