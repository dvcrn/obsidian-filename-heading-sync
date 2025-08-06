import FilenameHeadingSyncPlugin from './main';
import { App, PluginManifest } from 'obsidian';

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

    // Initialize settings with default values
    plugin.settings = {
      userIllegalSymbols: [],
      ignoredFiles: {},
      ignoreRegex: '',
      useFileOpenHook: true,
      useFileSaveHook: true,
      newHeadingStyle: 'Prefix' as any,
      replaceStyle: false,
      underlineString: '===',
      renameDebounceTimeout: 1000,
      insertHeadingIfMissing: true,
      ignoreFilenamePrefix: 0,
    };
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

  describe('extractTitleFromFilename', () => {
    it('should return full filename when ignoreFilenamePrefix is 0', () => {
      plugin.settings.ignoreFilenamePrefix = 0;
      const result = plugin.extractTitleFromFilename('202409261558 My Document');
      expect(result).toBe('202409261558 My Document');
    });

    it('should extract title after date prefix', () => {
      plugin.settings.ignoreFilenamePrefix = 13; // "202409261558 " is 13 characters
      const result = plugin.extractTitleFromFilename('202409261558 My Document');
      expect(result).toBe('My Document');
    });

    it('should handle space after prefix correctly', () => {
      plugin.settings.ignoreFilenamePrefix = 12; // "202409261558" is 12 characters
      const result = plugin.extractTitleFromFilename('202409261558 My Document');
      expect(result).toBe('My Document');
    });

    it('should handle no space after prefix', () => {
      plugin.settings.ignoreFilenamePrefix = 12; // "202409261558" is 12 characters
      const result = plugin.extractTitleFromFilename('202409261558My Document');
      expect(result).toBe('My Document');
    });
  });

  describe('createFilenameWithPrefix', () => {
    it('should return heading when ignoreFilenamePrefix is 0', () => {
      plugin.settings.ignoreFilenamePrefix = 0;
      const result = plugin.createFilenameWithPrefix('My Document', '202409261558 Old Title');
      expect(result).toBe('My Document');
    });

    it('should preserve prefix when creating new filename', () => {
      plugin.settings.ignoreFilenamePrefix = 13; // "202409261558 " is 13 characters
      const result = plugin.createFilenameWithPrefix('My Document', '202409261558 Old Title');
      expect(result).toBe('202409261558 My Document');
    });

    it('should handle different prefix lengths', () => {
      plugin.settings.ignoreFilenamePrefix = 8; // "20240926" is 8 characters
      const result = plugin.createFilenameWithPrefix('My Document', '20240926 Old Title');
      expect(result).toBe('20240926 My Document');
    });
  });
});
