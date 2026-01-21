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
	private contextEnabled: boolean = true;
	private contextIndicatorEl: HTMLElement | null = null;

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

		// Context indicator (after header)
		this.contextIndicatorEl = container.createDiv({ cls: 'vault-chat-context' });
		this.updateContextIndicator();

		// Listen for active file changes
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				this.updateContextIndicator();
			})
		);

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
			const contentEl = msgEl.createDiv({
				cls: 'vault-chat-message-content',
			});
			contentEl.textContent = msg.content;
		}

		// Scroll to bottom
		this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
	}

	private async sendMessage(): Promise<void> {
		if (!this.inputEl) return;

		const content = this.inputEl.value.trim();
		if (!content) return;

		// Check if client is initialized
		if (!this.elizaClient) {
			this.messages.push({
				role: 'system',
				content: 'Please configure Eliza API key in settings.',
				timestamp: new Date(),
			});
			this.renderMessages();
			return;
		}

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

		// Add placeholder for assistant response
		const assistantMsg: ChatMessage = {
			role: 'assistant',
			content: '',
			timestamp: new Date(),
		};
		this.messages.push(assistantMsg);

		// Show typing indicator
		this.showTypingIndicator();

		try {
			// Inject context
			const contextPrefix = await this.getContextPrefix();
			const messageWithContext = contextPrefix + content;

			const { elizaCharacterId } = this.plugin.settings;

			await this.elizaClient.chat.sendMessageStream(
				{
					characterId: elizaCharacterId,
					message: messageWithContext,
					conversationId: this.conversationId ?? undefined,
				},
				{
					onToken: (token: string) => {
						assistantMsg.content += token;
						this.updateLastMessage(assistantMsg.content);
					},
					onComplete: (response) => {
						this.conversationId = response.conversationId;
						this.hideTypingIndicator();
						this.renderMessages();
					},
					onError: (error) => {
						this.hideTypingIndicator();
						let errorMessage = 'Unknown error';
						if (error instanceof Error) {
							if (error.message.includes('401')) {
								errorMessage = 'Invalid API key. Check settings.';
							} else if (error.message.includes('404')) {
								errorMessage = 'Character not found. Check character ID.';
							} else if (error.message.includes('network')) {
								errorMessage = 'Network error. Check your connection.';
							} else {
								errorMessage = error.message;
							}
						}
						this.messages.push({
							role: 'system',
							content: `Error: ${errorMessage}`,
							timestamp: new Date(),
						});
						this.renderMessages();
					},
				}
			);
		} catch (error) {
			this.hideTypingIndicator();
			let errorMessage = 'Unknown error';
			if (error instanceof Error) {
				if (error.message.includes('401')) {
					errorMessage = 'Invalid API key. Check settings.';
				} else if (error.message.includes('404')) {
					errorMessage = 'Character not found. Check character ID.';
				} else if (error.message.includes('network')) {
					errorMessage = 'Network error. Check your connection.';
				} else {
					errorMessage = error.message;
				}
			}
			this.messages.push({
				role: 'system',
				content: `Error: ${errorMessage}`,
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

	private updateContextIndicator(): void {
		if (!this.contextIndicatorEl) return;
		this.contextIndicatorEl.empty();

		const activeFile = this.app.workspace.getActiveFile();

		// Context toggle
		const toggleEl = this.contextIndicatorEl.createDiv({
			cls: 'vault-chat-context-toggle',
		});
		const checkbox = toggleEl.createEl('input', { type: 'checkbox' });
		checkbox.checked = this.contextEnabled;
		checkbox.onchange = () => {
			this.contextEnabled = checkbox.checked;
			this.updateContextIndicator();
		};
		toggleEl.createSpan({ text: 'Include context' });

		// Current file indicator
		if (this.contextEnabled && activeFile) {
			const fileEl = this.contextIndicatorEl.createDiv({
				cls: 'vault-chat-context-file',
			});
			fileEl.createSpan({ text: '📎 ' });
			fileEl.createSpan({
				text: activeFile.basename,
				cls: 'vault-chat-context-filename',
			});
		}
	}

	private async getContextPrefix(): Promise<string> {
		if (!this.contextEnabled) return '';

		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return '';

		try {
			const content = await this.app.vault.read(activeFile);
			const snippet = content.slice(0, 500); // First 500 chars

			return `[Context: Currently viewing "${activeFile.path}"]\n${snippet}\n\n`;
		} catch {
			return `[Context: Currently viewing "${activeFile.path}"]\n\n`;
		}
	}

	private showTypingIndicator(): void {
		if (!this.messagesEl) return;
		const indicator = this.messagesEl.createDiv({ cls: 'vault-chat-typing' });
		indicator.setText('...');
	}

	private hideTypingIndicator(): void {
		const indicator = this.messagesEl?.querySelector('.vault-chat-typing');
		indicator?.remove();
	}

	private updateLastMessage(content: string): void {
		const lastMsgEl = this.messagesEl?.lastElementChild;
		if (
			lastMsgEl?.classList.contains('vault-chat-message-assistant') ||
			lastMsgEl?.classList.contains('vault-chat-typing')
		) {
			const contentEl = lastMsgEl.querySelector('.vault-chat-message-content');
			if (contentEl) {
				contentEl.textContent = content;
			} else {
				// Create content element if it doesn't exist (when replacing typing indicator)
				lastMsgEl.createDiv({
					cls: 'vault-chat-message-content',
					text: content,
				});
			}
		}
	}
}
