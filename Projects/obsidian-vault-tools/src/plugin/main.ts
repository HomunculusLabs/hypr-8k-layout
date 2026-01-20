import { Notice, Plugin } from 'obsidian';
import { parse } from 'yaml';
import { createObsidianAdapter, type VaultAdapter } from '../lib/adapters';
import { checkBrokenLinks } from '../lib/link-check';
import { lintFrontmatter } from '../lib/lint';
import { buildRalphQueue } from '../lib/ralph-queue';
import { vaultToolsConfigSchema } from '../lib/schemas';
import { syncShoppingList } from '../lib/shopping-sync';
import { checkStaleTodos } from '../lib/stale-check';
import { buildVaultStats } from '../lib/stats';
import type { FrontmatterSchemas } from '../types';
import { DEFAULT_SETTINGS, type VaultToolsSettings, VaultToolsSettingTab } from './settings';
import { VaultToolsSidebarView, VIEW_TYPE_VAULT_TOOLS } from './sidebar-view';

export interface QuickStats {
  noteCount: number;
  wordCount: number;
  linkCount: number;
  orphanCount: number;
}

const DEFAULT_RALPH_MAX_TASKS = 5;
const SHOPPING_LIST_PATH = 'Shopping List.md';

export default class VaultToolsPlugin extends Plugin {
  private adapter: VaultAdapter;
  private schemas: FrontmatterSchemas = {};
  settings: VaultToolsSettings;

  async onload(): Promise<void> {
    this.adapter = createObsidianAdapter(this.app);
    await this.loadSettings();
    this.schemas = await this.loadSchemasFromConfig();

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
    const stats = await buildVaultStats({
      adapter: this.adapter,
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
    const view = this.getSidebarView();
    if (!view) {
      new Notice('Vault Tools: open the sidebar to run Link Check.');
      return;
    }

    view.showOutput('Running link check...');
    void (async () => {
      try {
        const result = await checkBrokenLinks({
          adapter: this.adapter,
          vaultPath: '',
          reportPath: '',
          outputMode: 'console',
          excludePatterns: [],
          suggest: true,
          createStubs: false,
        });
        view.showLinkCheckResult(result);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to run link check.';
        view.showOutput(`Error: ${message}`);
      }
    })();
  }

  runLint(): void {
    const view = this.getSidebarView();
    if (!view) {
      new Notice('Vault Tools: open the sidebar to run Lint.');
      return;
    }

    view.showOutput('Running lint...');
    void (async () => {
      try {
        this.schemas = await this.loadSchemasFromConfig();
        const result = await lintFrontmatter({
          adapter: this.adapter,
          vaultPath: '',
          rootPath: '',
          reportPath: '',
          outputMode: 'console',
          fix: false,
          dryRun: true,
          schemas: this.schemas,
        });
        view.showLintResult(result);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to run lint.';
        view.showOutput(`Error: ${message}`);
      }
    })();
  }

  runStaleCheck(): void {
    const view = this.getSidebarView();
    if (!view) {
      new Notice('Vault Tools: open the sidebar to run Stale Todos.');
      return;
    }

    view.showOutput('Running stale check...');
    void (async () => {
      try {
        const result = await checkStaleTodos(
          this.adapter,
          this.settings.todosFolder
        );
        view.showStaleCheckResult(result);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to run stale check.';
        view.showOutput(`Error: ${message}`);
      }
    })();
  }

  runProjectHealth(): void {
    this.showPlaceholderOutput('Project Health');
  }

  runRalphQueue(): void {
    const view = this.getSidebarView();
    if (!view) {
      new Notice('Vault Tools: open the sidebar to run Ralph Queue.');
      return;
    }

    view.showOutput('Building Ralph queue...');
    void (async () => {
      try {
        const result = await buildRalphQueue({
          adapter: this.adapter,
          vaultPath: '',
          todosPath: this.settings.todosFolder,
          projectsPath: this.settings.projectsFolder,
          maxTasks: DEFAULT_RALPH_MAX_TASKS,
          includeLowPriority: false,
        });
        view.showRalphQueue(result);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to build Ralph queue.';
        view.showOutput(`Error: ${message}`);
      }
    })();
  }

  runShoppingSync(): void {
    const view = this.getSidebarView();
    if (!view) {
      new Notice('Vault Tools: open the sidebar to run Shopping Sync.');
      return;
    }

    view.showOutput('Syncing shopping list...');
    void (async () => {
      try {
        const result = await syncShoppingList({
          adapter: this.adapter,
          todosPath: this.settings.todosFolder,
          shoppingListPath: SHOPPING_LIST_PATH,
        });
        view.showShoppingSyncResult(result, SHOPPING_LIST_PATH);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to sync shopping list.';
        view.showOutput(`Error: ${message}`);
      }
    })();
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

  async openNote(path: string, line?: number): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file) {
      new Notice(`Vault Tools: note not found (${path}).`);
      return;
    }
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file as any, {
      active: true,
      state: line ? { line } : undefined,
      eState: line ? { line } : undefined,
    });
  }

  private async loadSchemasFromConfig(): Promise<FrontmatterSchemas> {
    const configPath = 'vault-tools.config.yaml';
    const exists = await this.adapter.fileExists(configPath);
    if (!exists) return {};
    const raw = await this.adapter.readFile(configPath);
    const parsed = parse(raw);
    const result = vaultToolsConfigSchema.partial().safeParse(parsed ?? {});
    if (!result.success) {
      throw new Error(`Invalid config: ${result.error.message}`);
    }
    return result.data.schemas ?? {};
  }
}
