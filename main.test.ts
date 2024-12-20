import FilenameHeadingSyncPlugin from './main';
import { App, PluginManifest } from 'obsidian';

// Import HeadingStyle enum from main.ts
import { HeadingStyle } from './main';

describe('FilenameHeadingSyncPlugin', () => {
  let plugin: FilenameHeadingSyncPlugin;
  let app: App;

  beforeEach(() => {
    // Create a proper mock of the App class
    app = ({
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
    } as unknown) as App;

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
});
