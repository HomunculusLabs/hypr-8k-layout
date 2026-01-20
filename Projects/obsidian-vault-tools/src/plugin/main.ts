import { Notice, Plugin } from 'obsidian';
import { createObsidianAdapter } from '../lib/adapters';
import { buildVaultStats } from '../lib/stats';
import { DEFAULT_SETTINGS, type VaultToolsSettings, VaultToolsSettingTab } from './settings';
import { VaultToolsSidebarView, VIEW_TYPE_VAULT_TOOLS } from './sidebar-view';

export interface QuickStats {
  noteCount: number;
  wordCount: number;
  linkCount: number;
  orphanCount: number;
}

export default class VaultToolsPlugin extends Plugin {
  settings: VaultToolsSettings;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(VIEW_TYPE_VAULT_TOOLS, (leaf) => new VaultToolsSidebarView(leaf, this));

    this.addRibbonIcon('wrench', 'Vault Tools', () => {
      void this.activateView();
    });

    this.addSettingTab(new VaultToolsSettingTab(this.app, this));

    this.addCommand({
      id: 'show-stats',
      name: 'Show vault statistics',
      callback: () => {
        void this.runStats();
      },
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

  async getQuickStats(): Promise<QuickStats> {
    const adapter = createObsidianAdapter(this.app);
    const stats = await buildVaultStats({
      adapter,
      vaultPath: '',
      rootPath: '',
      reportPath: '',
      sections: ['counts', 'links'],
      schemas: {},
    });

    return {
      noteCount: stats.totals.notes,
      wordCount: stats.totals.words,
      linkCount: stats.links.total,
      orphanCount: stats.links.orphans.length,
    };
  }

  async runStats(): Promise<void> {
    const view = this.getSidebarView();
    if (!view) {
      new Notice('Vault Tools: open the sidebar to view stats.');
      return;
    }

    view.showOutput('Loading vault stats...');
    try {
      const stats = await this.getQuickStats();
      view.showOutput(
        [
          'Vault Stats',
          `Notes: ${stats.noteCount}`,
          `Words: ${stats.wordCount.toLocaleString()}`,
          `Links: ${stats.linkCount}`,
          `Orphans: ${stats.orphanCount}`,
        ].join('\n'),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to load stats.';
      view.showOutput(`Error: ${message}`);
    }
  }

  runLinkCheck(): void {
    this.showPlaceholderOutput('Link Check');
  }

  runLint(): void {
    this.showPlaceholderOutput('Lint');
  }

  runStaleCheck(): void {
    this.showPlaceholderOutput('Stale Todos');
  }

  runProjectHealth(): void {
    this.showPlaceholderOutput('Project Health');
  }

  runRalphQueue(): void {
    this.showPlaceholderOutput('Ralph Queue');
  }

  runShoppingSync(): void {
    this.showPlaceholderOutput('Shopping Sync');
  }

  private showPlaceholderOutput(actionName: string): void {
    const view = this.getSidebarView();
    if (view) {
      view.showOutput(`${actionName} is not yet available in the plugin.`);
      return;
    }
    new Notice(`Vault Tools: open the sidebar to run ${actionName}.`);
  }

  private getSidebarView(): VaultToolsSidebarView | null {
    const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_VAULT_TOOLS)[0];
    if (!leaf) return null;
    const view = leaf.view;
    return view instanceof VaultToolsSidebarView ? view : null;
  }
}
