import { ItemView, type WorkspaceLeaf, setIcon } from 'obsidian';
import type { LinkCheckResult } from '../lib/link-check';
import type { FrontmatterLintResult } from '../lib/lint';
import type { RalphQueueResult } from '../lib/ralph-queue';
import type { ShoppingSyncResult } from '../lib/shopping-sync';
import type { StaleCheckResult } from '../lib/stale-check';
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

  showLinkCheckResult(result: LinkCheckResult): void {
    if (!this.outputEl) return;
    this.outputEl.empty();

    const container = this.outputEl.createDiv({ cls: 'vault-tools-output-list' });
    container.createDiv({
      cls: 'vault-tools-output-summary',
      text: `Files scanned: ${result.filesScanned}, broken links: ${result.brokenLinks.length}`,
    });

    if (result.brokenLinks.length === 0) {
      container.createDiv({
        cls: 'vault-tools-output-placeholder',
        text: 'No broken links found.',
      });
      return;
    }

    const grouped = this.groupBySource(result.brokenLinks);
    for (const [sourcePath, links] of grouped) {
      const group = container.createDiv({ cls: 'vault-tools-output-group' });
      const header = group.createEl('button', {
        cls: 'vault-tools-link',
        text: sourcePath,
      });
      header.addEventListener('click', () => {
        void this.plugin.openNote(sourcePath);
      });

      for (const link of links) {
        const row = group.createDiv({ cls: 'vault-tools-output-row' });
        const lineLabel = `Line ${link.line}: ${link.raw}`;
        const lineButton = row.createEl('button', {
          cls: 'vault-tools-link',
          text: lineLabel,
        });
        lineButton.addEventListener('click', () => {
          void this.plugin.openNote(sourcePath, link.line);
        });

        const detail = row.createDiv({ cls: 'vault-tools-output-detail' });
        if (link.reason === 'missing-heading' && link.heading) {
          detail.setText(`Missing heading #${link.heading}`);
        } else if (link.suggestions.length > 0) {
          detail.setText(`Suggestion: ${link.suggestions.join(', ')}`);
        } else if (link.stubCreated) {
          detail.setText('Stub note created');
        } else {
          detail.setText('Missing file');
        }
      }
    }
  }

  showLintResult(result: FrontmatterLintResult): void {
    if (!this.outputEl) return;
    this.outputEl.empty();

    const container = this.outputEl.createDiv({ cls: 'vault-tools-output-list' });
    container.createDiv({
      cls: 'vault-tools-output-summary',
      text: `Files scanned: ${result.filesScanned}, issues: ${result.issues.length}`,
    });

    if (result.issues.length === 0) {
      container.createDiv({
        cls: 'vault-tools-output-placeholder',
        text: 'No frontmatter issues found.',
      });
      return;
    }

    const grouped = this.groupLintIssues(result.issues);
    for (const [filePath, issues] of grouped) {
      const group = container.createDiv({ cls: 'vault-tools-output-group' });
      const header = group.createEl('button', {
        cls: 'vault-tools-link',
        text: filePath,
      });
      header.addEventListener('click', () => {
        void this.plugin.openNote(filePath);
      });

      for (const issue of issues) {
        const row = group.createDiv({ cls: 'vault-tools-output-row' });
        const fieldLabel = issue.field ? `(${issue.field})` : '';
        row.createDiv({
          cls: `vault-tools-output-detail vault-tools-severity-${issue.severity}`,
          text: `${issue.severity.toUpperCase()} ${fieldLabel} ${issue.message}`,
        });

        const detailParts = [];
        if (issue.expected) detailParts.push(`expected: ${issue.expected}`);
        if (issue.actual) detailParts.push(`actual: ${issue.actual}`);
        if (detailParts.length > 0) {
          row.createDiv({
            cls: 'vault-tools-output-detail',
            text: detailParts.join(', '),
          });
        }
      }
    }
  }

  showStaleCheckResult(result: StaleCheckResult): void {
    if (!this.outputEl) return;
    this.outputEl.empty();

    const container = this.outputEl.createDiv({ cls: 'vault-tools-output-list' });
    container.createDiv({
      cls: 'vault-tools-output-summary',
      text: `Files scanned: ${result.scanned}, stale todos: ${result.staleCount}`,
    });

    if (result.staleCount === 0) {
      container.createDiv({
        cls: 'vault-tools-output-placeholder',
        text: 'No stale todos found.',
      });
      return;
    }

    for (const todo of result.todos) {
      const row = container.createDiv({ cls: 'vault-tools-output-row' });
      const link = row.createEl('button', {
        cls: 'vault-tools-link',
        text: todo.title,
      });
      link.addEventListener('click', () => {
        void this.plugin.openNote(todo.path);
      });
      row.createDiv({
        cls: 'vault-tools-output-detail',
        text: `${todo.daysSinceModified} days • ${todo.status}`,
      });
    }
  }

  showRalphQueue(result: RalphQueueResult): void {
    if (!this.outputEl) return;
    this.outputEl.empty();

    const container = this.outputEl.createDiv({ cls: 'vault-tools-output-list' });
    container.createDiv({
      cls: 'vault-tools-output-summary',
      text: `Queued: ${result.stats.queued}, candidates: ${result.stats.totalCandidates}`,
    });

    if (result.tasks.length === 0) {
      container.createDiv({
        cls: 'vault-tools-output-placeholder',
        text: 'No tasks queued.',
      });
      if (result.skipped.length > 0) {
        for (const skipped of result.skipped) {
          const row = container.createDiv({ cls: 'vault-tools-output-row' });
          const link = row.createEl('button', {
            cls: 'vault-tools-link',
            text: skipped.title,
          });
          link.addEventListener('click', () => {
            void this.plugin.openNote(skipped.todoPath);
          });
          row.createDiv({
            cls: 'vault-tools-output-detail',
            text: skipped.reason,
          });
        }
      }
      return;
    }

    for (const task of result.tasks) {
      const row = container.createDiv({ cls: 'vault-tools-output-row' });
      const title = task.project?.name
        ? `${task.title} [${task.project.name}]`
        : task.title;
      const link = row.createEl('button', {
        cls: 'vault-tools-link',
        text: title,
      });
      link.addEventListener('click', () => {
        void this.plugin.openNote(task.todoPath);
      });
      row.createDiv({
        cls: 'vault-tools-output-detail',
        text: `Score: ${task.score} | Est: ${task.estimate.label}`,
      });
    }
  }

  showShoppingSyncResult(
    result: ShoppingSyncResult,
    shoppingListPath = 'Shopping List.md',
  ): void {
    if (!this.outputEl) return;
    this.outputEl.empty();

    const container = this.outputEl.createDiv({ cls: 'vault-tools-output-list' });
    container.createDiv({
      cls: 'vault-tools-output-summary',
      text: `Items: ${result.items}, categories: ${result.categories}, todo updates: ${result.todoFilesUpdated}`,
    });

    const listRow = container.createDiv({ cls: 'vault-tools-output-row' });
    const listLink = listRow.createEl('button', {
      cls: 'vault-tools-link',
      text: shoppingListPath,
    });
    listLink.addEventListener('click', () => {
      void this.plugin.openNote(shoppingListPath);
    });
    listRow.createDiv({
      cls: 'vault-tools-output-detail',
      text: result.shoppingListUpdated
        ? 'Shopping list updated.'
        : 'Shopping list already up to date.',
    });

    for (const warning of result.warnings) {
      container.createDiv({
        cls: 'vault-tools-output-detail',
        text: warning,
      });
    }
  }

  private formatNumber(value: number): string {
    return value.toLocaleString();
  }

  private groupBySource(
    links: LinkCheckResult['brokenLinks'],
  ): Map<string, LinkCheckResult['brokenLinks']> {
    const grouped = new Map<string, LinkCheckResult['brokenLinks']>();
    const sorted = [...links].sort((a, b) =>
      a.sourcePath.localeCompare(b.sourcePath),
    );
    for (const link of sorted) {
      const list = grouped.get(link.sourcePath) ?? [];
      list.push(link);
      grouped.set(link.sourcePath, list);
    }
    return grouped;
  }

  private groupLintIssues(
    issues: FrontmatterLintResult['issues'],
  ): Map<string, FrontmatterLintResult['issues']> {
    const grouped = new Map<string, FrontmatterLintResult['issues']>();
    for (const issue of issues) {
      const list = grouped.get(issue.filePath) ?? [];
      list.push(issue);
      grouped.set(issue.filePath, list);
    }
    return grouped;
  }
}
