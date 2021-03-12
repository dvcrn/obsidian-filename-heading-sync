import {
	App, Modal, Notice, Plugin, PluginSettingTab, Setting, EventRef, MarkdownView, TAbstractFile, TFile
} from 'obsidian';

const illegalSymbols = ['*', '\\', '/', '<', '>', ':', '|', '?'];

interface LinePointer {
	LineNumber: number;
	Text: string;
}

interface FilenameHeadingSyncPluginSettings {
	numLinesToCheck: number;
	ignoredFiles: { [key: string]: null };
}

const DEFAULT_SETTINGS: FilenameHeadingSyncPluginSettings = {
	numLinesToCheck: 1,
	ignoredFiles: {},
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
			id: 'page-heading-sync-ignore-file',
			name: 'Ignore current file',
			checkCallback: (checking: boolean) => {
				let leaf = this.app.workspace.activeLeaf;
				if (leaf) {
					if (!checking) {
						this.settings.ignoredFiles[this.app.workspace.activeLeaf.view.file.path.trim()] = null;
						this.saveSettings();
					}
					return true;
				}
				return false;
			},
		});
	}

	handleSyncHeadingToFile(file: TAbstractFile) {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);

		// if ignored, just bail
		if (this.settings.ignoredFiles[file.path] !== undefined) {
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
		const heading = this.findHeading(doc, view.file);

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

	handleSyncFilenameToHeading(file: TAbstractFile, oldPath) {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);

		// if oldpath is ignored, hook in and update the new filepath to be ignored instead
		if (this.settings.ignoredFiles[oldPath.trim()] !== undefined) {
			// if filename didn't change, just bail, nothing to do here
			if (file.path === oldPath) {
				return;
			}

			delete this.settings.ignoredFiles[oldPath];
			this.settings.ignoredFiles[file.path] = null;
			this.saveSettings();
			return;
		}

		if (view === null) {
			return;
		}

		if (view.file !== file) {
			return;
		}

		if ( !view.file.basename ) {
			return;
		}

		const concreteFile = file as TFile

		const editor = view.sourceMode.cmEditor;
		const doc = editor.getDoc();
		const cursor = doc.getCursor();

		const frontMatterEnd = this.frontMatterEndLocation(concreteFile)

		const foundHeading = this.findHeading(doc, frontMatterEnd);
		const sanitizedHeading = this.sanitizeHeading(concreteFile.basename);
		if (foundHeading !== null) {
			if (this.sanitizeHeading(foundHeading.Text) !== sanitizedHeading) {
				this.replaceLine(doc, foundHeading, `# ${sanitizedHeading}`);
				doc.setCursor(cursor);
			}
			return;
		}

		this.insertLine(doc, `# ${sanitizedHeading}`, frontMatterEnd);
		doc.setCursor(cursor);
	}

	findHeading(doc: CodeMirror.Doc, searchStartLine: number): LinePointer | null {

		for (let i = searchStartLine; i <= this.settings.numLinesToCheck; i++) {
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

	insertLine(doc: CodeMirror.Doc, text: string, frontMatterEndLocation:number) {
		const TITLE_OFFSET_FROM_END_OF_FRONTMATTER = 2
		doc.replaceRange(`${text}\n`,
										 { line: frontMatterEndLocation + TITLE_OFFSET_FROM_END_OF_FRONTMATTER, ch: 0 },
										 { line: frontMatterEndLocation + TITLE_OFFSET_FROM_END_OF_FRONTMATTER, ch: 0 });
	}

	private frontMatterEndLocation(file: TFile) {
		const metadataCache = this.app.metadataCache
		const fileMetaData = metadataCache.getFileCache(file)
		const frontMatterPosition = fileMetaData?.frontmatter?.position

		let searchStartLine = 0
		if ( frontMatterPosition ) {
			searchStartLine = frontMatterPosition.end.line
		}
		return searchStartLine
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

		containerEl.createEl('h2', { text: 'Ignored files' });
		containerEl.createEl('p', {
			text: 'You can ignore files from this plugin by using the "ignore this file" command',
		});

		// go over all ignored files and add them
		for (let key in this.plugin.settings.ignoredFiles) {
			const ignoredFilesSettingsObj = new Setting(containerEl).setDesc(key);

			ignoredFilesSettingsObj.addButton((button) => {
				button.setButtonText('Delete').onClick(async () => {
					delete this.plugin.settings.ignoredFiles[key];
					await this.plugin.saveSettings();
					this.display();
				});
			});
		}
	}
}
