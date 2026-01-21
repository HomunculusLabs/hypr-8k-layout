import { ItemView, type WorkspaceLeaf } from 'obsidian';
import { ElizaClient } from '@eliza/sdk';
import type VaultToolsPlugin from './main';

export const VIEW_TYPE_VAULT_CHAT = 'vault-chat-view';

interface ChatMessage {
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp: Date;
}

export class VaultChatView extends ItemView {
	plugin: VaultToolsPlugin;
	private elizaClient: ElizaClient | null = null;
	private conversationId: string | null = null;
	private messages: ChatMessage[] = [];
	private inputEl: HTMLTextAreaElement | null = null;
	private messagesEl: HTMLElement | null = null;
	private sendBtnEl: HTMLButtonElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: VaultToolsPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_VAULT_CHAT;
	}

	getDisplayText(): string {
		return 'Vault Chat';
	}

	getIcon(): string {
		return 'message-circle';
	}

	async onOpen(): Promise<void> {
		this.initElizaClient();
		await this.render();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
		this.messagesEl = null;
		this.inputEl = null;
		this.sendBtnEl = null;
	}

	private initElizaClient(): void {
		const { elizaApiKey, elizaBaseUrl } = this.plugin.settings;
		if (!elizaApiKey) {
			this.showConfigMessage('Configure Eliza API key in settings to use chat.');
			return;
		}

		try {
			this.elizaClient = new ElizaClient({
				baseUrl: elizaBaseUrl,
				apiKey: elizaApiKey,
			});
		} catch (error) {
			this.showConfigMessage(
				`Failed to initialize Eliza client: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`
			);
		}
	}

	private showConfigMessage(message: string): void {
		this.messages.push({
			role: 'system',
			content: message,
			timestamp: new Date(),
		});
	}

	async render(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		container.addClass('vault-chat-container');

		// Header
		const header = container.createDiv({ cls: 'vault-chat-header' });
		header.createEl('h4', { text: 'Vault Chat' });

		// Messages area
		this.messagesEl = container.createDiv({ cls: 'vault-chat-messages' });
		this.renderMessages();

		// Input area
		const inputArea = container.createDiv({ cls: 'vault-chat-input-area' });
		this.inputEl = inputArea.createEl('textarea', {
			cls: 'vault-chat-input',
			attr: { placeholder: 'Type a message...' },
		});

		this.sendBtnEl = inputArea.createEl('button', {
			cls: 'vault-chat-send-btn',
			text: 'Send',
		});
		this.sendBtnEl.onclick = () => this.sendMessage();

		// Enter to send, Shift+Enter for new line
		this.inputEl.onkeydown = (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				this.sendMessage();
			}
		};
	}

	private renderMessages(): void {
		if (!this.messagesEl) return;
		this.messagesEl.empty();

		for (const msg of this.messages) {
			const msgEl = this.messagesEl.createDiv({
				cls: `vault-chat-message vault-chat-message-${msg.role}`,
			});
			msgEl.createDiv({ cls: 'vault-chat-message-content', text: msg.content });
		}

		// Scroll to bottom
		this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
	}

	private async sendMessage(): Promise<void> {
		if (!this.inputEl || !this.elizaClient) return;

		const content = this.inputEl.value.trim();
		if (!content) return;

		// Disable input while sending
		if (this.inputEl) this.inputEl.disabled = true;
		if (this.sendBtnEl) this.sendBtnEl.disabled = true;

		// Add user message
		this.messages.push({
			role: 'user',
			content,
			timestamp: new Date(),
		});
		this.inputEl.value = '';
		this.renderMessages();

		try {
			const { elizaCharacterId } = this.plugin.settings;
			const response = await this.elizaClient.chat.sendMessage({
				characterId: elizaCharacterId,
				message: content,
				conversationId: this.conversationId ?? undefined,
			});

			// Store conversation ID for continuity
			this.conversationId = response.conversationId;

			// Add assistant message
			this.messages.push({
				role: 'assistant',
				content: response.content,
				timestamp: new Date(),
			});
			this.renderMessages();
		} catch (error) {
			const errorMsg =
				error instanceof Error ? error.message : 'Unknown error';
			this.messages.push({
				role: 'system',
				content: `Error: ${errorMsg}`,
				timestamp: new Date(),
			});
			this.renderMessages();
		} finally {
			// Re-enable input
			if (this.inputEl) this.inputEl.disabled = false;
			if (this.sendBtnEl) this.sendBtnEl.disabled = false;
			if (this.inputEl) this.inputEl.focus();
		}
	}
}
