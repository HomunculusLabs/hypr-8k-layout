import { App, PluginSettingTab, Setting } from 'obsidian';
import type VaultToolsPlugin from './main';

export interface VaultToolsSettings {
  todosFolder: string;
  projectsFolder: string;
  dailyFolder: string;
  templatesFolder: string;
}

export const DEFAULT_SETTINGS: VaultToolsSettings = {
  todosFolder: '6 - Atomic Notes/Todos',
  projectsFolder: '8 - Projects',
  dailyFolder: '1 - Rough Notes/Daily Notes',
  templatesFolder: '5 - Templates',
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
  }
}
