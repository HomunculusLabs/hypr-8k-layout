import { Modal, Notice, Setting, type App } from "obsidian";
import type { TemplateInfo } from "../lib/template";

export class TemplatePickerModal extends Modal {
	private templates: TemplateInfo[];
	private onSubmit: (
		template: TemplateInfo,
		title: string,
		variables: Record<string, string>,
	) => void;
	private selectedKey: string;
	private title = "";
	private variables: Record<string, string> = {};
	private variablesContainer: HTMLElement | null = null;
	private descriptionEl: HTMLElement | null = null;

	constructor(
		app: App,
		templates: TemplateInfo[],
		onSubmit: (
			template: TemplateInfo,
			title: string,
			variables: Record<string, string>,
		) => void,
	) {
		super(app);
		this.templates = templates;
		this.onSubmit = onSubmit;
		this.selectedKey = templates[0]?.key ?? "";
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Create from Template" });

		new Setting(contentEl)
			.setName("Template")
			.addDropdown((dropdown) => {
				for (const template of this.templates) {
					dropdown.addOption(template.key, template.name);
				}
				dropdown.setValue(this.selectedKey);
				dropdown.onChange((value) => {
					this.selectedKey = value;
					this.variables = {};
					this.renderTemplateDetails();
				});
			});

		this.descriptionEl = contentEl.createDiv({
			cls: "vault-tools-output-detail",
		});
		this.renderTemplateDescription();

		new Setting(contentEl)
			.setName("Title")
			.addText((text) => {
				text.setPlaceholder("New note title");
				text.onChange((value) => {
					this.title = value;
				});
			});

		this.variablesContainer = contentEl.createDiv();
		this.renderVariableInputs();

		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText("Create")
				.setCta()
				.onClick(() => {
					this.handleSubmit();
				}),
		);
	}

	private handleSubmit(): void {
		const template = this.getSelectedTemplate();
		if (!template) {
			new Notice("Select a template to continue.");
			return;
		}
		const title = this.title.trim();
		if (!title) {
			new Notice("Enter a title for the new note.");
			return;
		}
		this.onSubmit(template, title, { ...this.variables });
		this.close();
	}

	private renderTemplateDetails(): void {
		this.renderTemplateDescription();
		this.renderVariableInputs();
	}

	private renderTemplateDescription(): void {
		if (!this.descriptionEl) return;
		this.descriptionEl.empty();
		const template = this.getSelectedTemplate();
		if (template?.description) {
			this.descriptionEl.createEl("p", { text: template.description });
		}
	}

	private renderVariableInputs(): void {
		if (!this.variablesContainer) return;
		this.variablesContainer.empty();
		const template = this.getSelectedTemplate();
		const variables = template?.variables ?? [];
		if (variables.length === 0) return;

		this.variablesContainer.createEl("h3", { text: "Variables" });
		for (const variable of variables) {
			new Setting(this.variablesContainer)
				.setName(variable)
				.addText((text) => {
					text.onChange((value) => {
						this.variables[variable] = value;
					});
				});
		}
	}

	private getSelectedTemplate(): TemplateInfo | undefined {
		return this.templates.find((template) => template.key === this.selectedKey);
	}
}
