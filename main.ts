import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, EventRef, MarkdownView, TAbstractFile } from 'obsidian';

interface LinePointer {
	LineNumber: number;
	Text: string;
}

interface FilenameHeadingSyncPluginSettings {
	numLinesToCheck: number;
}

const DEFAULT_SETTINGS: FilenameHeadingSyncPluginSettings = {
	numLinesToCheck: 1,
};

export default class FilenameHeadingSyncPlugin extends Plugin {
	settings: FilenameHeadingSyncPluginSettings;

	async onload() {
		await this.loadSettings();

		this.registerEvent(this.app.vault.on('rename', (file) => this.handleSyncFilenameToHeading(file)));
		this.registerEvent(this.app.vault.on('modify', (file) => this.handleSyncHeadingToFile(file)));
		this.registerEvent(this.app.workspace.on('file-open', (file) => this.handleSyncFilenameToHeading(file)));

		this.addSettingTab(new FilenameHeadingSyncSettingTab(this.app, this));
	}

	handleSyncHeadingToFile(file: TAbstractFile) {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);

		if (view === null) {
			return;
		}

		if (view.file !== file) {
			return;
		}

		const editor = view.sourceMode.cmEditor;
		const doc = editor.getDoc();
		const heading = this.findHeading(doc);

		// no heading found, nothing to do here
		if (heading == null) {
			return;
		}

		if (view.file.basename.trim() !== heading.Text.trim()) {
			const newPath = view.file.path.replace(view.file.basename.trim(), heading.Text.trim());
			this.app.vault.rename(view.file, newPath);
		}
	}

	handleSyncFilenameToHeading(file) {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);

		if (view === null) {
			return;
		}

		if (view.file !== file) {
			return;
		}

		const editor = view.sourceMode.cmEditor;
		const doc = editor.getDoc();
		const cursor = doc.getCursor();

		const foundHeading = this.findHeading(doc);
		if (foundHeading !== null) {
			this.replaceLine(doc, foundHeading, `# ${file.basename}`);
			doc.setCursor(cursor);
			return;
		}

		this.insertLine(doc, `# ${file.basename}`);
		doc.setCursor(cursor);
	}

	findHeading(doc: CodeMirror.Doc): LinePointer | null {
		for (let i = 0; i <= this.settings.numLinesToCheck; i++) {
			const line = doc.getLine(i);
			if (line === undefined) {
				continue;
			}

			if (line.startsWith('# ')) {
				return {
					LineNumber: i,
					Text: line.substring(2),
				};
			}
		}

		return null;
	}

	insertLine(doc: CodeMirror.Doc, text: string) {
		doc.replaceRange(`${text}\n`, { line: 0, ch: 0 }, { line: 0, ch: 0 });
	}

	replaceLine(doc: CodeMirror.Doc, line: LinePointer, text: string) {
		doc.replaceRange(`${text}\n`, { line: line.LineNumber, ch: 0 }, { line: line.LineNumber + 1, ch: 0 });
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class FilenameHeadingSyncSettingTab extends PluginSettingTab {
	plugin: FilenameHeadingSyncPlugin;

	constructor(app: App, plugin: FilenameHeadingSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		let { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Filename Heading Sync' });
		containerEl.createEl('p', {
			text: 'This plugin will overwrite the first heading found in a file with the filename.',
		});
		containerEl.createEl('p', {
			text:
				'If no header is found within the first few lines (set below), will insert a new one at the first line.',
		});

		new Setting(containerEl)
			.setName('Number of lines to check')
			.setDesc('How many lines from top to check for a header')
			.addSlider((slider) =>
				slider
					.setDynamicTooltip()
					.setValue(this.plugin.settings.numLinesToCheck)
					.setLimits(1, 5, 1)
					.onChange(async (value) => {
						this.plugin.settings.numLinesToCheck = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
