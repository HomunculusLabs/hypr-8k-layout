import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type VaultToolsPlugin from './main';

export interface VaultToolsSettings {
  todosFolder: string;
  projectsFolder: string;
  dailyFolder: string;
  templatesFolder: string;
  // Eliza settings
  elizaApiKey: string;
  elizaBaseUrl: string;
  elizaCharacterId: string;
}

export const DEFAULT_SETTINGS: VaultToolsSettings = {
  todosFolder: '6 - Atomic Notes/Todos',
  projectsFolder: '8 - Projects',
  dailyFolder: '1 - Rough Notes/Daily Notes',
  templatesFolder: '5 - Templates',
  elizaApiKey: '',
  elizaBaseUrl: 'https://eliza-api.runiverse.ai/api/v1',
  elizaCharacterId: '0691e3a9-88e3-431a-94a8-3a41e8633905', // Sir SKanK
};

export class VaultToolsSettingTab extends PluginSettingTab {
  plugin: VaultToolsPlugin;

  constructor(app: App, plugin: VaultToolsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Todos folder')
      .setDesc('Folder containing todo notes')
      .addText((text) =>
        text
          .setPlaceholder('6 - Atomic Notes/Todos')
          .setValue(this.plugin.settings.todosFolder)
          .onChange(async (value) => {
            this.plugin.settings.todosFolder = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Projects folder')
      .setDesc('Folder containing project notes')
      .addText((text) =>
        text
          .setPlaceholder('8 - Projects')
          .setValue(this.plugin.settings.projectsFolder)
          .onChange(async (value) => {
            this.plugin.settings.projectsFolder = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Daily notes folder')
      .setDesc('Folder containing daily notes')
      .addText((text) =>
        text
          .setPlaceholder('1 - Rough Notes/Daily Notes')
          .setValue(this.plugin.settings.dailyFolder)
          .onChange(async (value) => {
            this.plugin.settings.dailyFolder = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Templates folder')
      .setDesc('Folder containing templates')
      .addText((text) =>
        text
          .setPlaceholder('5 - Templates')
          .setValue(this.plugin.settings.templatesFolder)
          .onChange(async (value) => {
            this.plugin.settings.templatesFolder = value;
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl('h3', { text: 'Eliza Chat', cls: 'setting-item-heading' });

    new Setting(containerEl)
      .setName('Eliza API Key')
      .setDesc('API key for Eliza server (elk_xxx)')
      .addText((text) =>
        text
          .setPlaceholder('elk_...')
          .setValue(this.plugin.settings.elizaApiKey)
          .onChange(async (value) => {
            this.plugin.settings.elizaApiKey = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Eliza Base URL')
      .setDesc('Eliza API server URL')
      .addText((text) =>
        text
          .setValue(this.plugin.settings.elizaBaseUrl)
          .onChange(async (value) => {
            this.plugin.settings.elizaBaseUrl = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Character ID')
      .setDesc('Eliza character UUID')
      .addText((text) =>
        text
          .setValue(this.plugin.settings.elizaCharacterId)
          .onChange(async (value) => {
            this.plugin.settings.elizaCharacterId = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Validate paths')
      .setDesc('Check that the configured folders exist in the vault.')
      .addButton((btn) =>
        btn.setButtonText('Validate').onClick(async () => {
          const errors = await this.validateSettings();
          if (errors.length === 0) {
            new Notice('All paths valid!');
          } else {
            new Notice(`Issues found:\n${errors.join('\n')}`);
          }
        })
      );
  }

  private async validateSettings(): Promise<string[]> {
    const errors: string[] = [];
    const folders = [
      { name: 'Todos', path: this.plugin.settings.todosFolder },
      { name: 'Projects', path: this.plugin.settings.projectsFolder },
      { name: 'Daily', path: this.plugin.settings.dailyFolder },
      { name: 'Templates', path: this.plugin.settings.templatesFolder },
    ];

    for (const folder of folders) {
      const trimmed = folder.path.trim();
      if (!trimmed) {
        errors.push(`${folder.name} folder not set.`);
        continue;
      }
      const exists = await this.plugin.fileExists(trimmed);
      if (!exists) {
        errors.push(`${folder.name} folder not found: ${trimmed}`);
      }
    }

    return errors;
  }
}
