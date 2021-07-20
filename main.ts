import {
  App,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  EventRef,
  MarkdownView,
  TFile,
  TAbstractFile,
  Editor,
} from 'obsidian';

const stockIllegalSymbols = ['*', '\\', '/', '<', '>', ':', '|', '?'];

interface LinePointer {
  LineNumber: number;
  Text: string;
}

interface FilenameHeadingSyncPluginSettings {
  userIllegalSymbols: string[];
  ignoreRegex: string;
  ignoredFiles: { [key: string]: null };
}

const DEFAULT_SETTINGS: FilenameHeadingSyncPluginSettings = {
  userIllegalSymbols: [],
  ignoredFiles: {},
  ignoreRegex: '',
};

export default class FilenameHeadingSyncPlugin extends Plugin {
  settings: FilenameHeadingSyncPluginSettings;

  async onload() {
    await this.loadSettings();

    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) =>
        this.handleSyncFilenameToHeading(file, oldPath),
      ),
    );
    this.registerEvent(
      this.app.vault.on('modify', (file) => this.handleSyncHeadingToFile(file)),
    );
    this.registerEvent(
      this.app.workspace.on('file-open', (file) =>
        this.handleSyncFilenameToHeading(file, file.path),
      ),
    );

    this.addSettingTab(new FilenameHeadingSyncSettingTab(this.app, this));

    this.addCommand({
      id: 'page-heading-sync-ignore-file',
      name: 'Ignore current file',
      checkCallback: (checking: boolean) => {
        let leaf = this.app.workspace.activeLeaf;
        if (leaf) {
          if (!checking) {
            this.settings.ignoredFiles[
              this.app.workspace.getActiveFile().path
            ] = null;
            this.saveSettings();
          }
          return true;
        }
        return false;
      },
    });
  }

  fileIsIgnored(path: string): boolean {
    // check manual ignore
    if (this.settings.ignoredFiles[path] !== undefined) {
      return true;
    }

    // check regex
    try {
      if (this.settings.ignoreRegex === '') {
        return;
      }

      const reg = new RegExp(this.settings.ignoreRegex);
      return reg.exec(path) !== null;
    } catch {}

    return false;
  }

  /**
   * Renames the file with the first heading found
   *
   * @param      {TAbstractFile}  file    The file
   */
  handleSyncHeadingToFile(file: TAbstractFile) {
    if (!(file instanceof TFile)) {
      return;
    }

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);

    // if currently opened file is not the same as the one that fired the event, skip
    // this is to make sure other events don't trigger this plugin
    if (view.file !== file) {
      return;
    }

    // if ignored, just bail
    if (this.fileIsIgnored(file.path)) {
      return;
    }

    const editor = view.editor;
    const doc = editor.getDoc();
    const docstart = this.findDocstart(doc);
    const heading = this.findHeading(doc, docstart);

    // no heading found, nothing to do here
    if (heading == null) {
      return;
    }

    const sanitizedHeading = this.sanitizeHeading(heading.Text);
    if (
      sanitizedHeading.length > 0 &&
      this.sanitizeHeading(view.file.basename) !== sanitizedHeading
    ) {
      const newPath = view.file.path.replace(
        view.file.name.trim(),
        `${sanitizedHeading}.${view.file.extension}`,
      );
      this.app.fileManager.renameFile(view.file, newPath);
    }
  }

  /**
   * Syncs the current filename to the first heading
   * Finds the first heading of the file, then replaces it with the filename
   *
   * @param      {TAbstractFile}  file     The file that fired the event
   * @param      {string}         oldPath  The old path
   */
  handleSyncFilenameToHeading(file: TAbstractFile, oldPath: string) {
    if (!(file instanceof TFile)) {
      return;
    }
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);

    // if currently opened file is not the same as the one that fired the event, skip
    // this is to make sure other events don't trigger this plugin
    if (view.file !== file) {
      return;
    }

    // if oldpath is ignored, hook in and update the new filepath to be ignored instead
    if (this.fileIsIgnored(oldPath.trim())) {
      // if filename didn't change, just bail, nothing to do here
      if (file.path === oldPath) {
        return;
      }

      // If filepath changed and the file was in the ignore list before,
      // remove it from the list and add the new one instead
      if (this.settings.ignoredFiles[oldPath]) {
        delete this.settings.ignoredFiles[oldPath];
        this.settings.ignoredFiles[file.path] = null;
        this.saveSettings();
      }
      return;
    }

    const editor = view.editor;
    const doc = editor.getDoc();
    const cursor = doc.getCursor();

    const docstart = this.findDocstart(doc);

    const foundHeading = this.findHeading(doc, docstart);
    const sanitizedHeading = this.sanitizeHeading(file.basename);

    if (foundHeading !== null) {
      if (this.sanitizeHeading(foundHeading.Text) !== sanitizedHeading) {
        this.replaceLine(doc, foundHeading.LineNumber, `# ${sanitizedHeading}`);
        doc.setCursor(cursor);
      }
      return;
    }

    if (docstart > 0) {
      this.insertLine(doc, docstart + 1, `\n# ${sanitizedHeading}`);
    } else {
      this.insertLine(doc, docstart, `# ${sanitizedHeading}`);
    }
    doc.setCursor(cursor);
  }

  findHeading(doc: Editor, startLine = 0): LinePointer | null {
    for (let i = startLine; i <= doc.lastLine(); i++) {
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

  /**
   * Finds the start of the users document, excluding frontmatter
   *
   * @param      {Editor}  doc     The document
   * @return     {number}  line when the doc starts
   */
  findDocstart(doc: Editor): number {
    const start = doc.getLine(0);
    if (start === undefined || start !== '---') {
      return 0;
    }

    for (let i = 1; i <= doc.lastLine(); i++) {
      if (doc.getLine(i) === '---') {
        // found end
        return i;
      }
    }

    return 0;
  }

  sanitizeHeading(text: string) {
    let combinedIllegalSymbols = [
      ...stockIllegalSymbols,
      ...this.settings.userIllegalSymbols,
    ];
    combinedIllegalSymbols.forEach((symbol) => {
      text = text.replace(symbol, '');
    });
    return text.trim();
  }

  insertLine(doc: Editor, line: number, text: string) {
    doc.replaceRange(`${text}\n`, { line: line, ch: 0 }, { line: line, ch: 0 });
  }

  replaceLine(doc: Editor, line: number, text: string) {
    doc.replaceRange(
      `${text}\n`,
      { line: line, ch: 0 },
      { line: line + 1, ch: 0 },
    );
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
    let regexIgnoredFilesDiv: HTMLDivElement;

    const renderRegexIgnoredFiles = (div: HTMLElement) => {
      // empty existing div
      div.innerHTML = '';

      if (this.plugin.settings.ignoreRegex === '') {
        return;
      }

      try {
        const files = this.app.vault.getFiles();
        const reg = new RegExp(this.plugin.settings.ignoreRegex);

        files
          .filter((file) => reg.exec(file.path) !== null)
          .forEach((el) => {
            new Setting(div).setDesc(el.path);
          });
      } catch (e) {
        return;
      }
    };

    containerEl.empty();

    containerEl.createEl('h2', { text: 'Filename Heading Sync' });
    containerEl.createEl('p', {
      text:
        'This plugin will overwrite the first heading found in a file with the filename.',
    });
    containerEl.createEl('p', {
      text:
        'If no header is found, will insert a new one at the first line (after frontmatter).',
    });

    new Setting(containerEl)
      .setName('Custom Illegal Charaters/Strings')
      .setDesc(
        'Type charaters/strings seperated by a comma. This input is space sensitive.',
      )
      .addText((text) =>
        text
          .setPlaceholder('[],#,...')
          .setValue(this.plugin.settings.userIllegalSymbols.join())
          .onChange(async (value) => {
            this.plugin.settings.userIllegalSymbols = value.split(',');
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Ignore Regex Rule')
      .setDesc(
        'Ignore rule in RegEx format. All files listed below will get ignored by this plugin.',
      )
      .addText((text) =>
        text
          .setPlaceholder('MyFolder/.*')
          .setValue(this.plugin.settings.ignoreRegex)
          .onChange(async (value) => {
            try {
              new RegExp(value);
              this.plugin.settings.ignoreRegex = value;
            } catch {
              this.plugin.settings.ignoreRegex = '';
            }

            await this.plugin.saveSettings();
            renderRegexIgnoredFiles(regexIgnoredFilesDiv);
          }),
      );

    containerEl.createEl('h2', { text: 'Ignored Files By Regex' });
    containerEl.createEl('p', {
      text: 'All files matching the above RegEx will get listed here',
    });

    regexIgnoredFilesDiv = containerEl.createDiv('test');
    renderRegexIgnoredFiles(regexIgnoredFilesDiv);

    containerEl.createEl('h2', { text: 'Manually Ignored Files' });
    containerEl.createEl('p', {
      text:
        'You can ignore files from this plugin by using the "ignore this file" command',
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
