import { ItemView, type WorkspaceLeaf, setIcon } from 'obsidian';
import type VaultToolsPlugin from './main';

export const VIEW_TYPE_VAULT_TOOLS = 'vault-tools-view';

export class VaultToolsSidebarView extends ItemView {
  plugin: VaultToolsPlugin;
  private outputEl: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: VaultToolsPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_VAULT_TOOLS;
  }

  getDisplayText(): string {
    return 'Vault Tools';
  }

  getIcon(): string {
    return 'wrench';
  }

  async onOpen(): Promise<void> {
    await this.render();
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
    this.outputEl = null;
  }

  async render(): Promise<void> {
    const container = this.contentEl;
    container.empty();
    container.addClass('vault-tools-container');

    container.createEl('h4', { text: 'Vault Tools' });

    await this.renderStatsSection(container);
    this.renderActionsSection(container);
    this.renderOutputSection(container);
  }

  private async renderStatsSection(container: HTMLElement): Promise<void> {
    const section = container.createDiv({ cls: 'vault-tools-section' });
    section.createEl('h5', { text: 'Quick Stats' });

    const statsGrid = section.createDiv({ cls: 'vault-tools-stats-grid' });

    try {
      const stats = await this.plugin.getQuickStats();
      this.createStatItem(statsGrid, 'Notes', stats.noteCount.toString());
      this.createStatItem(
        statsGrid,
        'Words',
        this.formatNumber(stats.wordCount),
      );
      this.createStatItem(statsGrid, 'Links', stats.linkCount.toString());
      this.createStatItem(statsGrid, 'Orphans', stats.orphanCount.toString());
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to load stats.';
      const fallback = section.createDiv({
        cls: 'vault-tools-output-placeholder',
      });
      fallback.setText(message);
    }
  }

  private createStatItem(parent: HTMLElement, label: string, value: string): void {
    const item = parent.createDiv({ cls: 'vault-tools-stat-item' });
    item.createDiv({ cls: 'stat-value', text: value });
    item.createDiv({ cls: 'stat-label', text: label });
  }

  private renderActionsSection(container: HTMLElement): void {
    const section = container.createDiv({ cls: 'vault-tools-section' });
    section.createEl('h5', { text: 'Actions' });

    const actions = [
      { name: 'Link Check', icon: 'link', action: () => this.plugin.runLinkCheck() },
      { name: 'Lint', icon: 'check-circle', action: () => this.plugin.runLint() },
      { name: 'Stale Todos', icon: 'clock', action: () => this.plugin.runStaleCheck() },
      {
        name: 'Project Health',
        icon: 'activity',
        action: () => this.plugin.runProjectHealth(),
      },
      { name: 'Ralph Queue', icon: 'list-todo', action: () => this.plugin.runRalphQueue() },
      {
        name: 'Shopping Sync',
        icon: 'shopping-cart',
        action: () => this.plugin.runShoppingSync(),
      },
    ];

    const grid = section.createDiv({ cls: 'vault-tools-actions-grid' });
    for (const action of actions) {
      const btn = grid.createEl('button', { cls: 'vault-tools-action-btn' });
      setIcon(btn.createSpan(), action.icon);
      btn.createSpan({ text: action.name });
      btn.addEventListener('click', action.action);
    }
  }

  private renderOutputSection(container: HTMLElement): void {
    const section = container.createDiv({ cls: 'vault-tools-section' });
    section.createEl('h5', { text: 'Output' });

    this.outputEl = section.createDiv({ cls: 'vault-tools-output' });
    this.outputEl.createEl('p', {
      text: 'Run an action to see results here.',
      cls: 'vault-tools-output-placeholder',
    });
  }

  showOutput(content: string | HTMLElement): void {
    if (!this.outputEl) return;
    this.outputEl.empty();
    if (typeof content === 'string') {
      this.outputEl.createEl('pre', { text: content });
    } else {
      this.outputEl.appendChild(content);
    }
  }

  private formatNumber(value: number): string {
    return value.toLocaleString();
  }
}
