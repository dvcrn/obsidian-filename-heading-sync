import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  TAbstractFile,
  TFile,
  Editor,
  MarkdownView,
  Notice
} from 'obsidian';
import { isExcluded } from './exclusions';

const stockIllegalSymbols = /[\\/:|#^[\]]/g;

// Must be Strings unless settings dialog is updated.
const enum HeadingStyle {
  Prefix = 'Prefix',
  Underline = 'Underline',
  Frontmatter = 'Frontmatter',
}

enum TitleType {
  Filename = 'filename',
  Frontmatter = 'frontmatter',
  Heading = 'heading',
}

interface LinePointer {
  lineNumber: number;
  text: string;
  style: HeadingStyle;
}

interface FilenameHeadingSyncPluginSettings {
  userIllegalSymbols: string[];
  ignoreRegex: string;
  ignoredFiles: { [key: string]: null };
  useFileOpenHook: boolean;
  useFileSaveHook: boolean;
  newHeadingStyle: HeadingStyle;
  replaceStyle: boolean;
  underlineString: string;
  frontmatterTitleKey: string;
  contentPrecedence: string;
  syncFilename: Set<string>;
  syncHeading: Set<string>;
  syncFrontmatter: Set<string>;
}

interface TitleCacheEntry {
  heading: string;
  frontmatter: string;
}

class TitleCache {
  private cache: Map<string, TitleCacheEntry> = new Map();
  maxSize: number;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;

  }

  public get(path: string): TitleCacheEntry | null {
    if (!(this.cache.has(path))) {
      return null;
    }
    const entry = this.cache.get(path);
    this.cache.delete(path);
    this.cache.set(path, entry);
    return entry;
  }

  public set(path: string, entry: TitleCacheEntry) {
    if (this.cache.size >= this.maxSize) {
      this.cache.delete(this.cache.keys().next().value);
    }
    this.cache.set(path, entry);
  }

  public async setFromFile(file: TFile, plugin: FilenameHeadingSyncPlugin) {
    this.set(file.path, {
      heading: await plugin.getTitle(file, TitleType.Heading),
      frontmatter: await plugin.getTitle(file, TitleType.Frontmatter),
    });
  }

  public move(oldPath: string, newPath: string) {
    if (this.cache.has(oldPath)) {
      this.cache.set(newPath, this.cache.get(oldPath));
      this.cache.delete(oldPath);
    }
  }

  public has(path: string): boolean {
    return this.cache.has(path);
  }

  public keys(): IterableIterator<string> {
    return this.cache.keys();
  }

  public values(): IterableIterator<TitleCacheEntry> {
    return this.cache.values();
  }

  public entries(): IterableIterator<[string, TitleCacheEntry]> {
    return this.cache.entries();
  }
}


const DEFAULT_SETTINGS: FilenameHeadingSyncPluginSettings = {
  userIllegalSymbols: [],
  ignoredFiles: {},
  ignoreRegex: '',
  useFileOpenHook: true,
  useFileSaveHook: true,
  newHeadingStyle: HeadingStyle.Prefix,
  replaceStyle: false,
  underlineString: '===',
  frontmatterTitleKey: 'title',
  contentPrecedence: 'frontmatter',
  syncFilename: new Set(['heading']),
  syncHeading: new Set(['filename']),
  syncFrontmatter: new Set([]),
};

export default class FilenameHeadingSyncPlugin extends Plugin {
  isRenameInProgress: boolean = false;
  settings: FilenameHeadingSyncPluginSettings;
  titleCache: TitleCache = new TitleCache();

  async onload() {
    await this.loadSettings();

    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        this.titleCache.move(oldPath, file.path);
        if (this.settings.useFileSaveHook) {
          return this.handleSyncFromFilename(file, oldPath);
        }
      }),
    );
    this.registerEvent(
      this.app.workspace.on('file-open', async (file) => {
        if (this.settings.useFileSaveHook && file !== null && file instanceof TFile && file.extension == "md") {
          this.titleCache.setFromFile(file, this);
        }
      }),
    )
    // Manually load titles of active file at startup as above hook is applied later
    const file = this.app.workspace.getActiveFile()
    if (this.settings.useFileSaveHook && file !== null && file instanceof TFile && file.extension == "md") {
      this.titleCache.setFromFile(file, this);
    }

    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (this.settings.useFileSaveHook) {
          this.handleSyncFromContent(file);
        }
      }),
    );


    this.registerEvent(
      this.app.workspace.on('file-open', (file) => {
        if (this.settings.useFileOpenHook && file !== null) {
          return this.handleSyncFromFilename(file, file.path);
        }
      }),
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

    this.addCommand({
      id: 'sync-filename-to-heading',
      name: 'Sync Filename to Heading',
      editorCallback: (_: Editor, view: MarkdownView) =>
        this.syncTitle(view.file, TitleType.Filename, TitleType.Heading),
    });

    this.addCommand({
      id: 'sync-heading-to-filename',
      name: 'Sync Heading to Filename',
      editorCallback: (_: Editor, view: MarkdownView) =>
        this.syncTitle(view.file, TitleType.Heading, TitleType.Filename),
    });

    this.addCommand({
      id : 'sync-filename-to-frontmatter',
      name: 'Sync Filename to Frontmatter',
      editorCallback: (_: Editor, view: MarkdownView) =>
        this.syncTitle(view.file, TitleType.Filename, TitleType.Frontmatter),
    });

    this.addCommand({
      id : 'sync-frontmatter-to-filename',
      name: 'Sync Frontmatter to Filename',
      editorCallback: (_: Editor, view: MarkdownView) =>
        this.syncTitle(view.file, TitleType.Frontmatter, TitleType.Filename),
    });

    this.addCommand({
      id : 'sync-heading-to-frontmatter',
      name: 'Sync Heading to Frontmatter',
      editorCallback: (_: Editor, view: MarkdownView) =>
        this.syncTitle(view.file, TitleType.Heading, TitleType.Frontmatter),
    })

    this.addCommand({
      id: 'sync-frontmatter-to-heading',
      name: 'Sync Frontmatter to Heading',
      editorCallback: (_: Editor, view: MarkdownView) =>
        this.syncTitle(view.file, TitleType.Frontmatter, TitleType.Heading),
    });
  }

  fileIsIgnored(activeFile: TFile, path: string): boolean {
    // check exclusions
    if (isExcluded(this.app, activeFile)) {
      return true;
    }

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
   * Sync titles from file content
   *
   * @param      {TAbstractFile}  file    The file
   */
  async handleSyncFromContent(file: TAbstractFile) {
    if (!(file instanceof TFile)) {
      return;
    }

    if (file.extension !== 'md') {
      // just bail
      return;
    }

    // if currently opened file is not the same as the one that fired the event, skip
    // this is to make sure other events don't trigger this plugin
    if (this.app.workspace.getActiveFile() !== file) {
      return;
    }

    // if ignored, just bail
    if (this.fileIsIgnored(file, file.path)) {
      return;
    }

    this.isRenameInProgress = true
    await Promise.all([
      this.getTitle(file, TitleType.Frontmatter),
      this.getTitle(file, TitleType.Heading),
    ]).then(async ([frontmatter, heading]) => {
      if (frontmatter === heading) {
        return
      }
      // Determine if heading or front matter changed
      const precedence = this.settings.contentPrecedence as TitleType;
      const nonPrecedence: TitleType = precedence !== TitleType.Heading ? TitleType.Heading : TitleType.Frontmatter;
      const cache = this.titleCache.get(file.path);
      const changed = new Map<TitleType,boolean>([
        [TitleType.Frontmatter, cache.frontmatter !== null && frontmatter !== cache.frontmatter ],
        [TitleType.Heading, cache.heading !== null && heading !== cache.heading],
      ]);
      if (this.settings.syncHeading.has(TitleType.Frontmatter as string)
          && this.settings.syncFrontmatter.has(TitleType.Heading as string)
          && Array.from(changed.values()).every(Boolean)) {
        // Two way content sync and both changed. Precedence applies in this case
        await this.syncTitle(file, precedence, nonPrecedence);
        changed.set(nonPrecedence, false)
        // Now content is synced and just one of the following steps is executed
      }
      if (changed.get(TitleType.Heading)) {
        const file0 = file.path
        if (this.settings.syncHeading.has(TitleType.Frontmatter as string)) {
          await this.setTitle(file, heading, TitleType.Frontmatter);
        }
        const file1 = file.path
        // Order is important. Filename needs to be changed last
        if (this.settings.syncHeading.has(TitleType.Filename as string)) {
          await this.setTitle(file, heading, TitleType.Filename);
        }
        const file2 = file.path
      }
      if (changed.get(TitleType.Frontmatter)) {
        if (this.settings.syncFrontmatter.has(TitleType.Heading as string)) {
          await this.setTitle(file, frontmatter, TitleType.Heading);
        }
        // Order is important. Filename needs to be changed last
        if (this.settings.syncFrontmatter.has(TitleType.Filename as string)) {
          await this.setTitle(file, frontmatter, TitleType.Filename);
        }
      }
      this.titleCache.setFromFile(file, this);
    });
    this.isRenameInProgress = false
  }

  /**
   * Syncs the current filename to the content
   * Finds the first heading of the file, then replaces it with the filename
   *
   * @param      {TAbstractFile}  file     The file that fired the event
   * @param      {string}         oldPath  The old path
   */
  async handleSyncFromFilename(file: TAbstractFile, oldPath: string) {
    if (this.isRenameInProgress) {
      return;
    }

    if (!(file instanceof TFile)) {
      return;
    }

    if (file.extension !== 'md') {
      // just bail
      return;
    }

    // if oldpath is ignored, hook in and update the new filepath to be ignored instead
    if (this.fileIsIgnored(file, oldPath.trim())) {
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

    this.settings.syncFilename.forEach(async (key) => {
      await this.syncTitle(file, TitleType.Filename, key as TitleType);
    });
    this.titleCache.setFromFile(file, this);
  }

  /**
   * Sync the title from the source to the target
   * @param      {TAbstractFile}  file     The file
   * @param      {TitleType}      source   The source
   * @param      {TitleType}      target   The target
   */
  async syncTitle(file: TFile, source: TitleType, target: TitleType) {
    return this.getTitle(file, source).then((title) => {
      if (title !== null) { this.setTitle(file, title, target)}
    })
  }

  /**
   * Sets the title of the file
   * @param      {TAbstractFile}  file     The file
   * @param      {string}         title    The title
   * @param      {TitleType}      target   The target
   */
  async setTitle(file: TFile, title: string, target: TitleType): Promise<void> {
    this.isRenameInProgress = true;
    if (target == TitleType.Filename) {
        if (title.length > 0 && this.sanitizeHeading(file.basename) !== title) {
          const newPath = `${file.parent.path}/${title}.md`;
          const oldPath = file.path;
          try {
            await this.app.fileManager.renameFile(file, newPath);
            this.titleCache.move(oldPath, newPath);
          } catch (e) {
            (new Notice(`Failed to rename ${file.path} to ${newPath}`));
          }
        }
        return
    }
    await this.app.vault.read(file).then((data) => {
      const lines = data.split('\n');
      switch(target) {
        case TitleType.Frontmatter:
          const frontmatter = this.findFrontmatterTitle(lines);
          if (frontmatter !== null) {
            if (this.sanitizeHeading(frontmatter.text) !== title) {
              this.replaceLineInFile(
                file,
                lines,
                frontmatter.lineNumber,
                `${this.settings.frontmatterTitleKey}: "${title}"`,
              );
            }
          } else {
            var frontMatterExists = true;
            var line = "";
            if (lines[0] !== '---') {
              frontMatterExists = false;
              line += '---\n';
            }
            line += `${this.settings.frontmatterTitleKey}: "${title}"`;
            if (!frontMatterExists) {
              line += '\n---';
              this.insertLineInFile(file, lines, 0, line);
            } else this.insertLineInFile(file, lines, 1, line);
          }
          break;
        case TitleType.Heading:
          const start = this.findNoteStart(lines);
          const heading = this.findHeading(lines, start);
          if (heading !== null) {
            if (this.sanitizeHeading(heading.text) !== title) {
              this.replaceHeading(file, lines, heading.lineNumber, heading.style, title);
            }
          } else this.insertHeading(file, lines, start, title);
      }
    })
    this.isRenameInProgress = false;
  }

  /**
   * Gets the title of the file
   * @param {TFile} file
   * @param {TitleType} source type
   * @returns {Promise<string>} the title
   */
  async getTitle(file: TFile, source: TitleType): Promise<string | null> {
    var title: string = null

    if (source === TitleType.Filename) {
      title = file.basename;
    } else {
      const lines = await this.app.vault.read(file).then((data) => data.split('\n'));
      switch(source) {
        case TitleType.Frontmatter:
          title = this.findFrontmatterTitle(lines)?.text;
          break;
        case TitleType.Heading:
          title = this.findHeading(lines, this.findNoteStart(lines))?.text;
          break;
      }
    }
    if (!title) {
      return null
    }
    title = this.sanitizeHeading(title);
    return title;
  }

  /**
   * Finds the start of the note file, excluding frontmatter
   *
   * @param {string[]} fileLines array of the file's contents, line by line
   * @returns {number} zero-based index of the starting line of the note
   */
  findNoteStart(fileLines: string[]): number {
    // check for frontmatter by checking if first line is a divider ('---')
    if (fileLines[0] === '---') {
      // find end of frontmatter
      // if no end is found, then it isn't really frontmatter and function will end up returning 0
      for (let i = 1; i < fileLines.length; i++) {
        if (fileLines[i] === '---') {
          // end of frontmatter found, next line is start of note
          return i + 1;
        }
      }
    }
    return 0;
  }

  /**
   * Finds the first heading of the note file
   *
   * @param {string[]} fileLines array of the file's contents, line by line
   * @param {number} startLine zero-based index of the starting line of the note
   * @returns {LinePointer | null} LinePointer to heading or null if no heading found
   */
  findHeading(fileLines: string[], startLine: number): LinePointer | null {
    for (let i = startLine; i < fileLines.length; i++) {
      if (fileLines[i].startsWith('# ')) {
        return {
          lineNumber: i,
          text: fileLines[i].substring(2),
          style: HeadingStyle.Prefix,
        };
      } else {
        if (
          fileLines[i + 1] !== undefined &&
          fileLines[i + 1].match(/^=+$/) !== null
        ) {
          return {
            lineNumber: i,
            text: fileLines[i],
            style: HeadingStyle.Underline,
          };
        }
      }
    }
    return null; // no heading found
  }

  /**
   * Finds the title element of the frontmatter
   * @param {string[]} fileLines array of the file's contents, line by line
   * @returns {LinePointer | null} LinePointer to heading or null if no heading found
   */
  findFrontmatterTitle(fileLines: string[]): LinePointer | null {
    if (fileLines[0] !== '---') {
      // No frontmatter found
      return null;
    }
    for (let i = 1; i < fileLines.length; i++) {
      if (fileLines[i] === '---') {
        return null
      }
      if (fileLines[i].startsWith(`${this.settings.frontmatterTitleKey}: `)) {
        return {
          lineNumber: i,
          text: fileLines[i].substring(this.settings.frontmatterTitleKey.length + 2).replace(/^"|"$/g, ''),
          style: HeadingStyle.Frontmatter,
        };
      }
    }
    return null; // no title found
  }

  regExpEscape(str: string): string {
    return String(str).replace(/[\\^$*+?.()|[\]{}]/g, '\\$&');
  }

  sanitizeHeading(text: string) {
    // stockIllegalSymbols is a regExp object, but userIllegalSymbols is a list of strings and therefore they are handled separately.
    text = text.replace(stockIllegalSymbols, '');

    const userIllegalSymbolsEscaped = this.settings.userIllegalSymbols.map(
      (str) => this.regExpEscape(str),
    );
    const userIllegalSymbolsRegExp = new RegExp(
      userIllegalSymbolsEscaped.join('|'),
      'g',
    );
    text = text.replace(userIllegalSymbolsRegExp, '');
    return text.trim();
  }

  /**
   * Insert the `heading` at `lineNumber` in `file`.
   *
   * @param {TFile} file the file to modify
   * @param {string[]} fileLines array of the file's contents, line by line
   * @param {number} lineNumber zero-based index of the line to replace
   * @param {string} heading the new text
   */
  insertHeading(
    file: TFile,
    fileLines: string[],
    lineNumber: number,
    heading: string,
  ) {
    const newStyle = this.settings.newHeadingStyle;
    switch (newStyle) {
      case HeadingStyle.Underline: {
        this.insertLineInFile(file, fileLines, lineNumber, `${heading}`);

        this.insertLineInFile(
          file,
          fileLines,
          lineNumber + 1,
          this.settings.underlineString,
        );
        break;
      }
      case HeadingStyle.Prefix: {
        this.insertLineInFile(file, fileLines, lineNumber, `# ${heading}`);
        break;
      }
    }
  }

  /**
   * Modified `file` by replacing the heading at `lineNumber` with `newHeading`,
   * updating the heading style according the user settings.
   *
   * @param {TFile} file the file to modify
   * @param {string[]} fileLines array of the file's contents, line by line
   * @param {number} lineNumber zero-based index of the line to replace
   * @param {HeadingStyle} oldStyle the style of the original heading
   * @param {string} newHeading the new text
   */
  replaceHeading(
    file: TFile,
    fileLines: string[],
    lineNumber: number,
    oldStyle: HeadingStyle,
    newHeading: string,
  ) {
    const newStyle = this.settings.newHeadingStyle;
    const replaceStyle = this.settings.replaceStyle;
    // If replacing the style
    if (replaceStyle) {
      switch (newStyle) {
        // For underline style, replace heading line...
        case HeadingStyle.Underline: {
          this.replaceLineInFile(file, fileLines, lineNumber, `${newHeading}`);
          //..., then add or replace underline.
          switch (oldStyle) {
            case HeadingStyle.Prefix: {
              this.insertLineInFile(
                file,
                fileLines,
                lineNumber + 1,
                this.settings.underlineString,
              );
              break;
            }
            case HeadingStyle.Underline: {
              // Update underline with setting.
              this.replaceLineInFile(
                file,
                fileLines,
                lineNumber + 1,
                this.settings.underlineString,
              );
              break;
            }
          }
          break;
        }
        // For prefix style, replace heading line, and possibly delete underline
        case HeadingStyle.Prefix: {
          this.replaceLineInFile(
            file,
            fileLines,
            lineNumber,
            `# ${newHeading}`,
          );
          switch (oldStyle) {
            case HeadingStyle.Prefix: {
              // nop
              break;
            }
            case HeadingStyle.Underline: {
              this.replaceLineInFile(file, fileLines, lineNumber + 1, '');
              break;
            }
          }
          break;
        }
      }
    } else {
      // If not replacing style, match
      switch (oldStyle) {
        case HeadingStyle.Underline: {
          this.replaceLineInFile(file, fileLines, lineNumber, `${newHeading}`);
          break;
        }
        case HeadingStyle.Prefix: {
          this.replaceLineInFile(
            file,
            fileLines,
            lineNumber,
            `# ${newHeading}`,
          );
          break;
        }
      }
    }
  }

  /**
   * Modifies the file by replacing a particular line with new text.
   *
   * The function will add a newline character at the end of the replaced line.
   *
   * If the `lineNumber` parameter is higher than the index of the last line of the file
   * the function will add a newline character to the current last line and append a new
   * line at the end of the file with the new text (essentially a new last line).
   *
   * @param {TFile} file the file to modify
   * @param {string[]} fileLines array of the file's contents, line by line
   * @param {number} lineNumber zero-based index of the line to replace
   * @param {string} text the new text
   */
  replaceLineInFile(
    file: TFile,
    fileLines: string[],
    lineNumber: number,
    text: string,
  ) {
    if (lineNumber >= fileLines.length) {
      fileLines.push(text + '\n');
    } else {
      fileLines[lineNumber] = text;
    }
    const data = fileLines.join('\n');
    this.app.vault.modify(file, data);
  }

  /**
   * Modifies the file by inserting a line with specified text.
   *
   * The function will add a newline character at the end of the inserted line.
   *
   * @param {TFile} file the file to modify
   * @param {string[]} fileLines array of the file's contents, line by line
   * @param {number} lineNumber zero-based index of where the line should be inserted
   * @param {string} text the text that the line shall contain
   */
  insertLineInFile(
    file: TFile,
    fileLines: string[],
    lineNumber: number,
    text: string,
  ) {
    if (lineNumber >= fileLines.length) {
      fileLines.push(text + '\n');
    } else {
      fileLines.splice(lineNumber, 0, text);
    }
    const data = fileLines.join('\n');
    this.app.vault.modify(file, data);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.settings.syncFilename = new Set<string>(this.settings.syncFilename);
    this.settings.syncHeading = new Set<string>(this.settings.syncHeading);
    this.settings.syncFrontmatter = new Set<string>(this.settings.syncFrontmatter);
  }

  async saveSettings() {
    let settings = Object.assign({}, this.settings);
    settings.syncFilename = Array.from(settings.syncFilename);
    settings.syncHeading = Array.from(settings.syncHeading);
    settings.syncFrontmatter = Array.from(settings.syncFrontmatter);
    await this.saveData(settings);
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
    let frontmatterTitleSetting: Setting;

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
      .setName('Custom Illegal Characters/Strings')
      .setDesc(
        'Type characters/strings separated by a comma. This input is space sensitive.',
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

    new Setting(containerEl)
      .setName('Use File Open Hook')
      .setDesc(
        'Whether this plugin should trigger when a file is opened, and not just on save. Disable this when you notice conflicts with other plugins that also act on file open.',
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.useFileOpenHook)
          .onChange(async (value) => {
            this.plugin.settings.useFileOpenHook = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Use File Save Hook')
      .setDesc(
        'Whether this plugin should trigger when a file is saved. Disable this when you want to trigger sync only manually.',
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.useFileSaveHook)
          .onChange(async (value) => {
            this.plugin.settings.useFileSaveHook = value;
            await this.plugin.saveSettings();
          }),
      );
    containerEl.createEl('h2', { text: 'Automatic Synchronization' });

    new Setting(containerEl)
      .setName('Filename →')
      .setDesc(
        "Synchronize the filename to: (Filename), Heading, Front Matter"
      )
      .addToggle((toggle) => toggle.setTooltip("Filename").setDisabled(true).setValue(true))
      .addToggle((toggle) => toggle.setTooltip("Heading")
                 .setValue(this.plugin.settings.syncFilename.has(TitleType.Heading))
                 .onChange(async (value) => {
                   if (value) {
                     this.plugin.settings.syncFilename.add(TitleType.Heading);
                   } else {
                     this.plugin.settings.syncFilename.delete(TitleType.Heading);
                   }
                   await this.plugin.saveSettings();
                 }))
      .addToggle((toggle) => toggle.setTooltip("Front Matter")
                 .setValue(this.plugin.settings.syncFilename.has(TitleType.Frontmatter))
                 .onChange(async (value) => {
                   if (value) {
                     this.plugin.settings.syncFilename.add(TitleType.Frontmatter);
                   } else {
                     this.plugin.settings.syncFilename.delete(TitleType.Frontmatter);
                   }
                   await this.plugin.saveSettings();
                 }))
    new Setting(containerEl)
      .setName('Heading →')
      .setDesc(
        "Synchronize the heading to: Filename, (Heading), Front Matter"
      )
      .addToggle((toggle) => toggle.setTooltip("Filename")
                .setValue(this.plugin.settings.syncHeading.has(TitleType.Filename))
                .onChange(async (value) => {
                  if (value) {
                    this.plugin.settings.syncHeading.add(TitleType.Filename);
                  } else {
                    this.plugin.settings.syncHeading.delete(TitleType.Filename);
                  }
                  await this.plugin.saveSettings();
                }))
      .addToggle((toggle) => toggle.setTooltip("Heading").setDisabled(true).setValue(true))
      .addToggle((toggle) => toggle.setTooltip("Front Matter")
                .setValue(this.plugin.settings.syncHeading.has(TitleType.Frontmatter))
                .onChange(async (value) => {
                  if (value) {
                    this.plugin.settings.syncHeading.add(TitleType.Frontmatter);
                  } else {
                    this.plugin.settings.syncHeading.delete(TitleType.Frontmatter);
                  }
                  await this.plugin.saveSettings();
                }))
    new Setting(containerEl)
      .setName('Front Matter →')
      .setDesc(
        "Synchronize the front matter to: Filename, Heading, (Front Matter)"
      )
      .addToggle((toggle) => toggle.setTooltip("Filename")
                .setValue(this.plugin.settings.syncFrontmatter.has(TitleType.Filename))
                .onChange(async (value) => {
                  if (value) {
                    this.plugin.settings.syncFrontmatter.add(TitleType.Filename);
                  }else {
                    this.plugin.settings.syncFrontmatter.delete(TitleType.Filename);
                  }
                  await this.plugin.saveSettings();
                }))
      .addToggle((toggle) => toggle.setTooltip("Heading")
                .setValue(this.plugin.settings.syncFrontmatter.has(TitleType.Heading))
                .onChange(async (value) => {
                  if (value) {
                    this.plugin.settings.syncFrontmatter.add(TitleType.Heading);
                  } else {
                    this.plugin.settings.syncFrontmatter.delete(TitleType.Heading);
                  }
                  await this.plugin.saveSettings();
                }))
      .addToggle((toggle) => toggle.setTooltip("Front Matter").setDisabled(true).setValue(true))

      new Setting(containerEl)
        .setName("Content Precedence")
        .setDesc(
          "Which change should take precedence if both the front matter and the heading changed. (Currently it is not possible to get the last change or similar)"
        )
        .addDropdown((dropdown) =>
          dropdown
            .addOption('frontmatter', "Front Matter")
            .addOption('heading', "Heading")
            .setValue(this.plugin.settings.contentPrecedence)
            .onChange(async (value) => {
              this.plugin.settings.contentPrecedence = value;
              await this.plugin.saveSettings();
            }))

    containerEl.createEl('h2', { text: 'Front Matter' });
    frontmatterTitleSetting = new Setting(containerEl)
      .setName("Key in frontmatter to use")
      .setDesc(
        "The key in frontmatter to use to store the file's title.",
      ).addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.frontmatterTitleKey)
          .setValue(this.plugin.settings.frontmatterTitleKey)
          .onChange(async (value) => {
            this.plugin.settings.frontmatterTitleKey = value;
            await this.plugin.saveSettings();
          }),
      );

    containerEl.createEl('h2', { text: 'Heading Style' });
    new Setting(containerEl)
      .setName('New Heading Style')
      .setDesc(
        'Which Markdown heading style to use when creating new headings: Prefix ("# Heading") or Underline ("Heading\\n===").',
      )
      .addDropdown((cb) =>
        cb
          .addOption(HeadingStyle.Prefix, 'Prefix')
          .addOption(HeadingStyle.Underline, 'Underline')
          .setValue(this.plugin.settings.newHeadingStyle)
          .onChange(async (value) => {
            if (value === 'Prefix') {
              this.plugin.settings.newHeadingStyle = HeadingStyle.Prefix;
            }
            if (value === 'Underline') {
              this.plugin.settings.newHeadingStyle = HeadingStyle.Underline;
            }
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Replace Heading Style')
      .setDesc(
        'Whether this plugin should replace existing heading styles when updating headings.',
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.replaceStyle)
          .onChange(async (value) => {
            this.plugin.settings.replaceStyle = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Underline String')
      .setDesc(
        'The string to use when insert Underline-style headings; should be some number of "="s.',
      )
      .addText((text) =>
        text
          .setPlaceholder('===')
          .setValue(this.plugin.settings.underlineString)
          .onChange(async (value) => {
            this.plugin.settings.underlineString = value;
            await this.plugin.saveSettings();
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
