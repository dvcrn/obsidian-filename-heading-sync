import FilenameHeadingSyncPlugin from './main';
import {
  generateFilenameFromHeading,
  generateHeadingFromFilename,
} from './headings';
import { App, MarkdownView, PluginManifest, TFile } from 'obsidian';

describe('FilenameHeadingSyncPlugin', () => {
  let plugin: FilenameHeadingSyncPlugin;
  let app: App;

  beforeEach(() => {
    // Create a proper mock of the App class
    app = {
      vault: {
        on: jest.fn(),
        getFiles: jest.fn().mockReturnValue([]),
      },
      workspace: {
        on: jest.fn(),
        activeLeaf: null,
      },
      fileManager: {},
      // Add other required App properties
    } as unknown as App;

    const manifest: PluginManifest = {
      id: 'test',
      name: 'Test Plugin',
      version: '1.0.0',
      minAppVersion: '0.15.0',
      author: 'Test Author',
      description: 'Test Description',
    };

    plugin = new FilenameHeadingSyncPlugin(app, manifest);
  });

  describe('findHeading', () => {
    it('should find heading after frontmatter', () => {
      const fileLines = [
        '---',
        'title: Test',
        'date: 2023-01-01',
        '---',
        '# First Heading',
        'Some content',
      ];

      const result = plugin.findHeading(
        fileLines,
        plugin.findNoteStart(fileLines),
      );

      expect(result).not.toBeNull();
      expect(result?.text).toBe('First Heading');
      expect(result?.style).toBe('Prefix');
      expect(result?.lineNumber).toBe(4);
    });

    it('should skip heading in fenced code block', () => {
      const fileLines = [
        '',
        '```',
        '# Heading Inside Code',
        '```',
        '# Actual Heading',
        'Some content',
      ];

      const result = plugin.findHeading(fileLines, 0);

      expect(result).not.toBeNull();
      expect(result?.text).toBe('Actual Heading');
      expect(result?.style).toBe('Prefix');
      expect(result?.lineNumber).toBe(4);
    });

    it('should find underline style heading', () => {
      const fileLines = ['First Heading', '============', 'Some content'];

      const result = plugin.findHeading(fileLines, 0);

      expect(result).not.toBeNull();
      expect(result?.text).toBe('First Heading');
      expect(result?.style).toBe('Underline');
      expect(result?.lineNumber).toBe(0);
    });

    it('should ignore escaped hash prefix', () => {
      const fileLines = [
        '\\# Not a heading',
        '# Actual Heading',
        'Some content',
      ];

      const result = plugin.findHeading(fileLines, 0);

      expect(result).not.toBeNull();
      expect(result?.text).toBe('Actual Heading');
      expect(result?.style).toBe('Prefix');
      expect(result?.lineNumber).toBe(1);
    });

    it('should ignore hash inside inline code', () => {
      const fileLines = [
        '`# Not a heading`',
        '# Actual Heading',
        'Some content',
      ];

      const result = plugin.findHeading(fileLines, 0);

      expect(result).not.toBeNull();
      expect(result?.text).toBe('Actual Heading');
      expect(result?.style).toBe('Prefix');
      expect(result?.lineNumber).toBe(1);
    });

    it('should ignore heading inside frontmatter', () => {
      const fileLines = [
        '---',
        '# Not a heading',
        'title: Test',
        '---',
        '# Actual Heading',
        'Some content',
      ];

      const result = plugin.findHeading(
        fileLines,
        plugin.findNoteStart(fileLines),
      );

      expect(result).not.toBeNull();
      expect(result?.text).toBe('Actual Heading');
      expect(result?.style).toBe('Prefix');
      expect(result?.lineNumber).toBe(4);
    });
  });

  describe('heading to filename sync', () => {
    it('renames an existing unsanitized filename', async () => {
      const file = {
        basename: 'Test "File" *',
        parent: { path: '' },
      } as TFile;
      const renameFile = jest.fn().mockResolvedValue(undefined);
      const read = jest.fn().mockResolvedValue('# Test "File" *');

      app.fileManager.renameFile = renameFile;
      app.vault.read = read;
      app.workspace.getLeavesOfType = jest.fn().mockReturnValue([]);
      plugin.settings = {
        userIllegalSymbols: ['"', '*'],
        spaceReplacementCharacter: '',
      } as unknown as typeof plugin.settings;

      await plugin.forceSyncHeadingToFilename(file);

      expect(renameFile).toHaveBeenCalledWith(file, 'Test File.md');
    });

    it('reads a dirty heading from the editor without forcing a save', async () => {
      const file = {
        basename: 'Old name',
        parent: { path: '' },
      } as TFile;
      const renameFile = jest.fn().mockResolvedValue(undefined);
      const read = jest.fn();
      const save = jest.fn();
      const view = Object.assign(Object.create(MarkdownView.prototype), {
        file,
        dirty: true,
        save,
        editor: { getValue: jest.fn().mockReturnValue('# Live heading') },
      });

      app.fileManager.renameFile = renameFile;
      app.vault.read = read;
      app.workspace.getLeavesOfType = jest.fn().mockReturnValue([{ view }]);
      plugin.settings = {
        userIllegalSymbols: [],
        spaceReplacementCharacter: '',
      } as unknown as typeof plugin.settings;

      await plugin.forceSyncHeadingToFilename(file);

      expect(save).not.toHaveBeenCalled();
      expect(read).not.toHaveBeenCalled();
      expect(renameFile).toHaveBeenCalledWith(file, 'Live heading.md');
    });

    it('ignores its own rename event before asynchronous handlers run', () => {
      const waitForTemplater = jest.spyOn(plugin, 'waitForTemplater');
      plugin.settings = {
        useFileSaveHook: true,
      } as unknown as typeof plugin.settings;
      plugin.isRenameInProgress = true;

      plugin.handleFileRename({} as TFile, 'Old name.md');

      expect(waitForTemplater).not.toHaveBeenCalled();
    });
  });
});

describe('generateFilenameFromHeading', () => {
  const defaultSettings = {
    userIllegalSymbols: [] as string[],
    spaceReplacementCharacter: '',
  };

  it('should strip stock illegal characters', () => {
    expect(generateFilenameFromHeading('My: File/Name', defaultSettings)).toBe(
      'My FileName',
    );
  });

  it('should strip user-defined illegal symbols', () => {
    const settings = { ...defaultSettings, userIllegalSymbols: ['@', '!'] };
    expect(generateFilenameFromHeading('Hello@World!', settings)).toBe(
      'HelloWorld',
    );
  });

  it('should replace spaces with configured character', () => {
    const settings = { ...defaultSettings, spaceReplacementCharacter: '-' };
    expect(generateFilenameFromHeading('My Cool Note', settings)).toBe(
      'My-Cool-Note',
    );
  });

  it('should replace spaces with underscore', () => {
    const settings = { ...defaultSettings, spaceReplacementCharacter: '_' };
    expect(generateFilenameFromHeading('My Cool Note', settings)).toBe(
      'My_Cool_Note',
    );
  });

  it('should strip illegal chars then replace spaces', () => {
    const settings = { ...defaultSettings, spaceReplacementCharacter: '-' };
    expect(generateFilenameFromHeading('My: Cool Note', settings)).toBe(
      'My-Cool-Note',
    );
  });

  it('should replace spaces with multi-character string', () => {
    const settings = { ...defaultSettings, spaceReplacementCharacter: '---' };
    expect(generateFilenameFromHeading('My Cool Note', settings)).toBe(
      'My---Cool---Note',
    );
  });

  it('should preserve current behavior when space replace is empty', () => {
    expect(generateFilenameFromHeading('My Cool Note', defaultSettings)).toBe(
      'My Cool Note',
    );
  });

  it('should trim whitespace', () => {
    expect(
      generateFilenameFromHeading('  Hello World  ', defaultSettings),
    ).toBe('Hello World');
  });
});

describe('generateHeadingFromFilename', () => {
  const defaultSettings = {
    spaceReplacementCharacter: '',
  };

  it('should return filename as-is when no replace configured', () => {
    expect(generateHeadingFromFilename('My-Cool-Note', defaultSettings)).toBe(
      'My-Cool-Note',
    );
  });

  it('should replace hyphens with spaces', () => {
    const settings = { spaceReplacementCharacter: '-' };
    expect(generateHeadingFromFilename('My-Cool-Note', settings)).toBe(
      'My Cool Note',
    );
  });

  it('should replace underscores with spaces', () => {
    const settings = { spaceReplacementCharacter: '_' };
    expect(generateHeadingFromFilename('My_Cool_Note', settings)).toBe(
      'My Cool Note',
    );
  });

  it('should replace multi-character string with spaces', () => {
    const settings = { spaceReplacementCharacter: '---' };
    expect(generateHeadingFromFilename('My---Cool---Note', settings)).toBe(
      'My Cool Note',
    );
  });

  it('should handle regex special characters in replace string', () => {
    const settings = { spaceReplacementCharacter: '.' };
    expect(generateHeadingFromFilename('My.Cool.Note', settings)).toBe(
      'My Cool Note',
    );
  });

  it('should trim whitespace', () => {
    const settings = { spaceReplacementCharacter: '-' };
    expect(generateHeadingFromFilename('-Hello-World-', settings)).toBe(
      'Hello World',
    );
  });
});
