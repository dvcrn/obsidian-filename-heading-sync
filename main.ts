import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, EventRef, MarkdownView, TAbstractFile} from 'obsidian';

const ignore = false;
const sync = true;

const illegalSymbols = ['*', '\\', '/', '<', '>', ':', '|', '?'];

interface LinePointer {
	LineNumber: number;
	Text: string;
}

interface FilenameHeadingSyncPluginSettings {
	numLinesToCheck: number;
	ignoredFiles: { [key: string]: null };
	selectedFiles: { [key: string]: boolean };
	selectedFileAction: boolean;
}

const DEFAULT_SETTINGS: FilenameHeadingSyncPluginSettings = {
	numLinesToCheck: 1,
	ignoredFiles: {},
	selectedFiles: {},
	selectedFileAction: false,
};

export default class FilenameHeadingSyncPlugin extends Plugin {
	settings: FilenameHeadingSyncPluginSettings;

	async onload() {
		await this.loadSettings();

		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => this.handleSyncFilenameToHeading(file, oldPath)),
		);
		this.registerEvent(this.app.vault.on('modify', (file) => this.handleSyncHeadingToFile(file)));
		this.registerEvent(
			this.app.workspace.on('file-open', (file) => this.handleSyncFilenameToHeading(file, file.path)),
		);

		this.addSettingTab(new FilenameHeadingSyncSettingTab(this.app, this));

		this.addCommand({
			id: 'page-heading-sync-selected-file',
			name: 'Add to Selected Files',
			checkCallback: (checking: boolean) => {
				let leaf = this.app.workspace.activeLeaf;
				if (leaf) {
					if (!checking) {
						this.settings.selectedFiles[this.app.workspace.activeLeaf.view.file.path.trim()] = true;
						this.saveSettings();

					}
					return true
				}
				return false;
			},
		});

		this.addCommand({
			id: 'page-heading-convert-to-selected',
			name: 'Updates File Database to Version',
			checkCallback: (checking: boolean) => {
				let leaf = this.app.workspace.activeLeaf;
				if (leaf) {
					if (!checking) {
						this.convertedIgnoredToSelected();
						new Notice("Update Complete");
					}
					return true;
				}
				return false;
			},
		});
		
		this.convertedIgnoredToSelected();
	}

	convertedIgnoredToSelected() {
		//Converts ignores to selected files
		for (const key in this.settings.ignoredFiles){
			this.settings.selectedFiles[key] = true;
			delete this.settings.ignoredFiles[key];
		}
		this.saveSettings();
	}

	checkForSync(file: TAbstractFile): boolean {
		let selected = this.settings.selectedFiles[file.path];
		let action = this.settings.selectedFileAction;
		if (selected != true && action == ignore) {
			return sync;
		}
		else if (selected == true && action == sync) {
			return sync;
		}
		return ignore;
	}

	handleSyncHeadingToFile(file: TAbstractFile) {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		
		//If ignore, just bail
		if (this.checkForSync(file) == ignore) {
			return;
		}

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

		const sanitizedHeading = this.sanitizeHeading(heading.Text);
		if (this.sanitizeHeading(view.file.basename) !== sanitizedHeading) {
			const newPath = view.file.path.replace(view.file.basename.trim(), sanitizedHeading);
			this.app.fileManager.renameFile(view.file, newPath);
		}
	}

	handleSyncFilenameToHeading(file, oldPath) {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);

		// if oldpath is ignored, hook in and update the new filepath to be ignored instead
		if (this.settings.selectedFiles[oldPath.trim()] == true) {
			
			// if filename didn't change, just bail, nothing to do here
			if (file.path === oldPath) {
				return;
			}
			delete this.settings.selectedFiles[oldPath];
			this.settings.selectedFiles[file.path] = true;
			this.saveSettings();
			return;
		}

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
		const sanitizedHeading = this.sanitizeHeading(file.basename);
		if (foundHeading !== null) {
			if (this.sanitizeHeading(foundHeading.Text) !== sanitizedHeading) {
				this.replaceLine(doc, foundHeading, `# ${sanitizedHeading}`);
				doc.setCursor(cursor);
			}
			return;
		}

		this.insertLine(doc, `# ${sanitizedHeading}`);
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

	sanitizeHeading(text: string) {
		illegalSymbols.forEach((symbol) => {
			text = text.replace(symbol, '');
		});

		return text.trim();
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
	app: App;

	constructor(app: App, plugin: FilenameHeadingSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.app = app;
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
					.setLimits(1, 10, 1)
					.onChange(async (value) => {
						this.plugin.settings.numLinesToCheck = value;
						await this.plugin.saveSettings();
					}),
		);
		
		new Setting(containerEl)
		.setName('Selected File Action')
		.setDesc('Disabled: Selected Files will be ignored - Enabled: Only Selected files will be synced')
		.addToggle((toggle) =>
			toggle
				.setValue(this.plugin.settings.selectedFileAction)
				.onChange(async (value) => {
					this.plugin.settings.selectedFileAction = value;
					await this.plugin.saveSettings();
				}),
		);

		containerEl.createEl('h2', { text: 'Selected Files' });
		containerEl.createEl('p', {
			text: 'Files in this list will either be ignored by the plugin or exclusively synced based on the above toggle. You can add selected files to this list with the "Add to Selected Files" command',
		});

		// go over all ignored files and add them
		for (let key in this.plugin.settings.selectedFiles) {
			const selectedFilesSettingsObj = new Setting(containerEl).setDesc(key);

			selectedFilesSettingsObj.addButton((button) => {
				button.setButtonText('Delete').onClick(async () => {
					delete this.plugin.settings.selectedFiles[key];
					await this.plugin.saveSettings();
					this.display();
				});
			});
		}
	}
}
