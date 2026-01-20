import path from 'node:path';
import { Notice, Plugin } from 'obsidian';
import { parse } from 'yaml';
import { createObsidianAdapter, type VaultAdapter } from '../lib/adapters';
import { populateDailyNote } from '../lib/daily-populate';
import { checkBrokenLinks } from '../lib/link-check';
import { lintFrontmatter } from '../lib/lint';
import { buildProjectHealth } from '../lib/project-health';
import { buildRalphQueue } from '../lib/ralph-queue';
import { vaultToolsConfigSchema } from '../lib/schemas';
import { syncShoppingList } from '../lib/shopping-sync';
import { checkStaleTodos } from '../lib/stale-check';
import { buildVaultStats } from '../lib/stats';
import { createFromTemplateFile, listTemplates } from '../lib/template';
import { generateWeeklyRollup } from '../lib/weekly-rollup';
import type { FrontmatterSchemas } from '../types';
import { DEFAULT_SETTINGS, type VaultToolsSettings, VaultToolsSettingTab } from './settings';
import { VaultToolsSidebarView, VIEW_TYPE_VAULT_TOOLS } from './sidebar-view';
import { TemplatePickerModal } from './template-modal';

export interface QuickStats {
  noteCount: number;
  wordCount: number;
  linkCount: number;
  orphanCount: number;
}

const DEFAULT_RALPH_MAX_TASKS = 5;
const SHOPPING_LIST_PATH = 'Shopping List.md';
const DAILY_TEMPLATE_FILE = 'daily-notes.md';

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

    this.addCommand({
      id: 'populate-daily',
      name: "Populate today's daily note",
      callback: () => {
        void this.runDailyPopulate();
      },
    });

    this.addCommand({
      id: 'generate-weekly-rollup',
      name: 'Generate weekly rollup',
      callback: () => {
        void this.runWeeklyRollup();
      },
    });

    this.addCommand({
      id: 'show-project-health',
      name: 'Show project health',
      callback: () => {
        this.runProjectHealth();
      },
    });

    this.addCommand({
      id: 'create-from-template',
      name: 'Create from template',
      callback: () => {
        void this.runTemplateCreate();
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
    const view = this.getSidebarView();
    if (!view) {
      new Notice('Vault Tools: open the sidebar to run Project Health.');
      return;
    }

    view.showOutput('Loading project health...');
    void (async () => {
      try {
        const result = await buildProjectHealth(this.adapter, {
          projectsFolder: this.settings.projectsFolder,
          todosFolder: this.settings.todosFolder,
        });
        view.showProjectHealth(result);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to run project health.';
        view.showOutput(`Error: ${message}`);
      }
    })();
  }

  async runDailyPopulate(): Promise<void> {
    try {
      const result = await populateDailyNote(this.adapter, {
        dailyFolder: this.settings.dailyFolder,
        todosFolder: this.settings.todosFolder,
        projectsFolder: this.settings.projectsFolder,
        templatePath: path.join(this.settings.templatesFolder, DAILY_TEMPLATE_FILE),
        create: true,
      });
      new Notice(`Daily note populated: ${result.sectionsAdded.length} sections`);
      await this.app.workspace.openLinkText(result.path, '');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to populate daily note.';
      new Notice(message);
    }
  }

  async runWeeklyRollup(): Promise<void> {
    try {
      const result = await generateWeeklyRollup(this.adapter, {
        dailyFolder: this.settings.dailyFolder,
        todosFolder: this.settings.todosFolder,
      });
      if (result.missingDays.length > 0) {
        new Notice(`Weekly rollup generated (missing: ${result.missingDays.join(', ')})`);
      } else {
        new Notice('Weekly rollup generated');
      }
      await this.app.workspace.openLinkText(result.path, '');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to generate weekly rollup.';
      new Notice(message);
    }
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

  async runTemplateCreate(): Promise<void> {
    try {
      const result = await listTemplates(this.adapter, this.settings.templatesFolder);
      if (result.templates.length === 0) {
        new Notice('No templates found.');
        return;
      }

      new TemplatePickerModal(
        this.app,
        result.templates,
        async (template, title, variables) => {
          try {
            const outputFolder = this.resolveOutputFolder(template.defaultOutput);
            const outputPath = await createFromTemplateFile(this.adapter, {
              templatePath: template.path,
              title,
              outputFolder,
              variables,
            });
            await this.app.workspace.openLinkText(outputPath, '');
          } catch (error) {
            const message =
              error instanceof Error ? error.message : 'Unable to create note.';
            new Notice(message);
          }
        },
      ).open();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to load templates.';
      new Notice(message);
    }
  }

  private showPlaceholderOutput(actionName: string): void {
    const view = this.getSidebarView();
    if (view) {
      view.showOutput(`${actionName} is not yet available in the plugin.`);
      return;
    }
    new Notice(`Vault Tools: open the sidebar to run ${actionName}.`);
  }

  private resolveOutputFolder(defaultOutput?: string): string {
    if (!defaultOutput) return '';
    const trimmed = defaultOutput.trim();
    if (!trimmed) return '';
    if (this.isDirectoryPath(trimmed)) {
      return trimmed.replace(/[\\/]+$/, '');
    }
    return path.dirname(trimmed);
  }

  private isDirectoryPath(candidate: string): boolean {
    if (candidate.endsWith(path.sep) || candidate.endsWith('/')) return true;
    return path.extname(candidate) === '';
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
