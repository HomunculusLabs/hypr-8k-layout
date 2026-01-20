import { ItemView } from 'obsidian';

export const VIEW_TYPE_VAULT_TOOLS = 'vault-tools-view';

export class VaultToolsSidebarView extends ItemView {
  getViewType(): string {
    return VIEW_TYPE_VAULT_TOOLS;
  }

  getDisplayText(): string {
    return 'Vault Tools';
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('vault-tools-view');

    container.createEl('h2', { text: 'Vault Tools' });
    container.createEl('p', {
      text: 'Vault tools will appear here once they are ported to the plugin.',
    });
  }

  async onClose(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
  }
}
