import { Notice, Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, type VaultToolsSettings, VaultToolsSettingTab } from './settings';
import { VaultToolsSidebarView, VIEW_TYPE_VAULT_TOOLS } from './sidebar-view';

export default class VaultToolsPlugin extends Plugin {
  settings: VaultToolsSettings;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(VIEW_TYPE_VAULT_TOOLS, (leaf) => new VaultToolsSidebarView(leaf));

    this.addRibbonIcon('wrench', 'Vault Tools', () => {
      void this.activateView();
    });

    this.addSettingTab(new VaultToolsSettingTab(this.app, this));

    this.addCommand({
      id: 'show-stats',
      name: 'Show vault statistics',
      callback: () => this.runStats(),
    });
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_VAULT_TOOLS);
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_VAULT_TOOLS)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf('tab');
      if (!leaf) {
        return;
      }
      await leaf.setViewState({ type: VIEW_TYPE_VAULT_TOOLS, active: true });
    }
    workspace.revealLeaf(leaf);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  runStats(): void {
    new Notice('Vault Tools: stats command is not yet available in the plugin.');
  }
}
