import { ItemView, TFile, type WorkspaceLeaf, setIcon, Notice } from 'obsidian';
import { ElizaClient } from '@eliza/sdk';
import type VaultToolsPlugin from './main';
import { NotePickerModal } from './note-picker-modal';

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

	// Conversation history
	private currentConversationFile: string | null = null;
	private historyPanelEl: HTMLElement | null = null;
	private showHistoryPanel: boolean = false;

	// Wikilink autocomplete
	private autoCompleteEl: HTMLElement | null = null;

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
		this.contextIndicatorEl = null;
		this.historyPanelEl = null;
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

	private async saveConversation(): Promise<void> {
		if (this.messages.length === 0) return;

		const conversationsFolder = '1 - Rough Notes/Conversations';
		const date = window.moment().format('YYYY-MM-DD');
		let filename = `${date}-vault-chat.md`;

		// Ensure folder exists
		const folderExists = this.app.vault.getAbstractFileByPath(conversationsFolder);
		if (!folderExists) {
			await this.app.vault.createFolder(conversationsFolder);
		}

		// If we're continuing an existing conversation, update it
		if (this.currentConversationFile) {
			const existingFile = this.app.vault.getAbstractFileByPath(this.currentConversationFile);
			if (existingFile && 'extension' in existingFile) {
				await this.app.vault.modify(existingFile as TFile, this.formatConversationContent());
				return;
			}
		}

		// Check for existing file, increment if needed
		let counter = 1;
		while (this.app.vault.getAbstractFileByPath(`${conversationsFolder}/${filename}`)) {
			counter++;
			filename = `${date}-vault-chat-${counter}.md`;
		}

		const content = this.formatConversationContent();
		const filePath = `${conversationsFolder}/${filename}`;
		await this.app.vault.create(filePath, content);

		// Store current file path for updates
		this.currentConversationFile = filePath;
	}

	private formatConversationContent(): string {
		const { elizaCharacterId } = this.plugin.settings;
		const characterName = 'Sir SKanK';
		const date = window.moment().format('YYYY-MM-DD');

		let content = `---
created: ${window.moment().toISOString()}
character: ${characterName}
characterId: ${elizaCharacterId}
conversationId: ${this.conversationId || 'unknown'}
tags: [chat-log, eliza]
---

# Vault Chat - ${date}

`;

		let currentHour = '';
		for (const msg of this.messages) {
			const msgTime = window.moment(msg.timestamp).format('HH:mm');

			if (msgTime !== currentHour) {
				content += `## ${msgTime}\n`;
				currentHour = msgTime;
			}

			if (msg.role === 'user') {
				content += `**You**: ${msg.content}\n\n`;
			} else if (msg.role === 'assistant') {
				content += `**${characterName}**: ${msg.content}\n\n`;
			} else if (msg.role === 'system') {
				content += `> [System] ${msg.content}\n\n`;
			}
		}

		return content;
	}

	async render(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		container.addClass('vault-chat-container');

		// Header
		const header = container.createDiv({ cls: 'vault-chat-header' });
		header.createEl('h4', { text: 'Vault Chat' });

		// History button
		const historyBtn = header.createEl('button', {
			cls: 'vault-chat-history-btn',
		});
		setIcon(historyBtn, 'history');
		historyBtn.setAttribute('aria-label', 'History');
		historyBtn.onclick = () => this.toggleHistoryPanel();

		// History panel (hidden by default)
		this.historyPanelEl = container.createDiv({ cls: 'vault-chat-history-panel hidden' });

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

		// Action buttons row
		const actionsRow = inputArea.createDiv({ cls: 'vault-chat-actions' });

		// Insert note button
		const insertNoteBtn = actionsRow.createEl('button', {
			cls: 'vault-chat-insert-note-btn',
			text: '+ Note',
		});
		insertNoteBtn.onclick = () => this.openNotePicker();

		// Input row (textarea + send button)
		const inputRow = inputArea.createDiv({ cls: 'vault-chat-input-row' });

		this.inputEl = inputRow.createEl('textarea', {
			cls: 'vault-chat-input',
			attr: { placeholder: 'Type a message...' },
		});

		this.sendBtnEl = inputRow.createEl('button', {
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
			// Hide autocomplete on Escape
			if (e.key === 'Escape') {
				this.hideAutoComplete();
			}
		};

		// Setup wikilink autocomplete
		this.setupAutoComplete();
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
			// Use wikilink-aware rendering
			this.renderMessageContent(msg.content, contentEl);
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
					onComplete: async (response) => {
						this.conversationId = response.conversationId;
						this.hideTypingIndicator();
						this.renderMessages();
						// Auto-save conversation after receiving response
						await this.saveConversation();
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

	private toggleHistoryPanel(): void {
		this.showHistoryPanel = !this.showHistoryPanel;
		if (this.showHistoryPanel) {
			this.historyPanelEl?.removeClass('hidden');
			void this.renderHistoryPanel();
		} else {
			this.historyPanelEl?.addClass('hidden');
		}
	}

	private async renderHistoryPanel(): Promise<void> {
		if (!this.historyPanelEl) return;
		this.historyPanelEl.empty();

		const header = this.historyPanelEl.createDiv({ cls: 'vault-chat-history-header' });
		header.createEl('h5', { text: 'Conversation History' });

		const closeBtn = header.createEl('button', { cls: 'vault-chat-history-close', text: '×' });
		closeBtn.onclick = () => this.toggleHistoryPanel();

		// Search
		const searchEl = this.historyPanelEl.createEl('input', {
			cls: 'vault-chat-history-search',
			attr: { placeholder: 'Search conversations...', type: 'text' },
		});

		// List conversations
		const listEl = this.historyPanelEl.createDiv({ cls: 'vault-chat-history-list' });

		const conversationsFolder = '1 - Rough Notes/Conversations';
		const folder = this.app.vault.getAbstractFileByPath(conversationsFolder);

		if (folder && 'children' in folder) {
			const files = (folder as any).children
				.filter((f: any) => f.extension === 'md')
				.sort((a: any, b: any) => b.stat.mtime - a.stat.mtime);

			// Add search functionality
			const renderList = (filterText = ''): void => {
				listEl.empty();
				const filteredFiles = filterText
					? files.filter((f: any) => f.basename.toLowerCase().includes(filterText.toLowerCase()))
					: files;

				for (const file of filteredFiles.slice(0, 20)) {
					const item = listEl.createDiv({ cls: 'vault-chat-history-item' });
					item.createSpan({ text: file.basename });
					item.onclick = () => {
						void this.loadConversation(file.path);
					};
				}

				if (filteredFiles.length === 0) {
					listEl.createDiv({
						cls: 'vault-chat-history-empty',
						text: 'No conversations found.',
					});
				}
			};

			renderList();

			// Search input listener
			searchEl.oninput = (e) => {
				const target = e.target as HTMLInputElement;
				renderList(target.value);
			};
		} else {
			listEl.createDiv({
				cls: 'vault-chat-history-empty',
				text: 'No conversations yet. Start chatting!',
			});
		}
	}

	private async loadConversation(filePath: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!file || !('extension' in file)) return;

		try {
			const content = await this.app.vault.read(file as TFile);

			// Parse frontmatter
			const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
			if (frontmatterMatch) {
				const frontmatter = frontmatterMatch[1];
				const conversationIdMatch = frontmatter.match(/conversationId:\s*(.+)/);
				if (conversationIdMatch) {
					this.conversationId = conversationIdMatch[1].trim();
				}
			}

			// Parse messages
			this.messages = [];
			const messageRegex = /\*\*(You|Sir SKanK)\*\*:\s*([\s\S]*?)(?=\n\n|\n##|\*\*|$)/g;
			let match;
			while ((match = messageRegex.exec(content)) !== null) {
				this.messages.push({
					role: match[1] === 'You' ? 'user' : 'assistant',
					content: match[2].trim(),
					timestamp: new Date(),
				});
			}

			this.currentConversationFile = filePath;
			this.toggleHistoryPanel();
			this.renderMessages();
		} catch (error) {
			console.error('Failed to load conversation:', error);
		}
	}

	private renderMessageContent(content: string, containerEl: HTMLElement): void {
		// Regex to find [[wikilinks]]
		const wikilinkRegex = /\[\[([^\]]+)\]\]/g;
		let lastIndex = 0;
		let match;

		while ((match = wikilinkRegex.exec(content)) !== null) {
			// Text before the wikilink
			if (match.index > lastIndex) {
				containerEl.createSpan({ text: content.slice(lastIndex, match.index) });
			}

			// The wikilink itself
			const linkText = match[1];
			const linkEl = containerEl.createSpan({ cls: 'vault-chat-wikilink' });
			linkEl.textContent = linkText;
			linkEl.onclick = () => this.openNote(linkText);

			lastIndex = match.index + match[0].length;
		}

		// Remaining text
		if (lastIndex < content.length) {
			containerEl.createSpan({ text: content.slice(lastIndex) });
		}
	}

	private async openNote(noteName: string): Promise<void> {
		// Try to find the note
		const files = this.app.vault.getMarkdownFiles();
		const targetFile = files.find(
			(f) =>
				f.basename.toLowerCase() === noteName.toLowerCase() ||
				f.path.toLowerCase().includes(noteName.toLowerCase())
		);

		if (targetFile) {
			await this.app.workspace.openLinkText(targetFile.path, '', false);
		} else {
			new Notice(`Note not found: ${noteName}`);
		}
	}

	private openNotePicker(): void {
		const modal = new NotePickerModal(this.app, (notePath) => {
			if (this.inputEl && notePath) {
				const noteName = notePath.replace(/\.md$/, '').split('/').pop();
				const wikilink = `[[${noteName}]]`;

				// Insert at cursor or append
				const cursorPos = this.inputEl.selectionStart;
				const before = this.inputEl.value.slice(0, cursorPos);
				const after = this.inputEl.value.slice(cursorPos);
				this.inputEl.value = before + wikilink + after;
				this.inputEl.focus();
			}
		});
		modal.open();
	}

	private setupAutoComplete(): void {
		if (!this.inputEl) return;

		this.inputEl.oninput = () => {
			const value = this.inputEl!.value;
			const cursorPos = this.inputEl!.selectionStart;

			// Check if we just typed [[
			if (value.slice(cursorPos - 2, cursorPos) === '[[') {
				this.showAutoComplete(cursorPos);
			} else {
				// Hide autocomplete if not typing after [[
				const beforeCursor = value.slice(0, cursorPos);
				const lastOpenBracket = beforeCursor.lastIndexOf('[[');
				if (lastOpenBracket === -1 || beforeCursor.slice(lastOpenBracket + 2).includes(']]')) {
					this.hideAutoComplete();
				}
			}
		};
	}

	private showAutoComplete(cursorPos: number): void {
		// Create autocomplete dropdown
		if (this.autoCompleteEl) {
			this.autoCompleteEl.remove();
		}

		this.autoCompleteEl = this.contentEl.createDiv({ cls: 'vault-chat-autocomplete' });

		const files = this.app.vault.getMarkdownFiles().slice(0, 10);

		for (const file of files) {
			const item = this.autoCompleteEl.createDiv({ cls: 'vault-chat-autocomplete-item' });
			item.textContent = file.basename;
			item.onclick = () => {
				this.insertAutoComplete(file.basename, cursorPos);
			};
		}

		// Position near input
		const inputRect = this.inputEl!.getBoundingClientRect();
		this.autoCompleteEl.style.position = 'absolute';
		this.autoCompleteEl.style.bottom = '100px';
		this.autoCompleteEl.style.left = '12px';
		this.autoCompleteEl.style.right = '12px';
	}

	private insertAutoComplete(noteName: string, startPos: number): void {
		if (!this.inputEl) return;

		const before = this.inputEl.value.slice(0, startPos);
		const after = this.inputEl.value.slice(startPos);

		this.inputEl.value = before + noteName + ']]' + after;
		this.inputEl.focus();

		this.autoCompleteEl?.remove();
		this.autoCompleteEl = null;
	}

	private hideAutoComplete(): void {
		this.autoCompleteEl?.remove();
		this.autoCompleteEl = null;
	}
}
