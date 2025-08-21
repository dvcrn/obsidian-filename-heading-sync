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
      metadataCache: {
        getFileCache: jest.fn().mockReturnValue(null),
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

  describe('fileIsIgnored', () => {
    let mockFile: any;
    
    beforeEach(() => {
      mockFile = {
        path: 'test/file.md',
        basename: 'file',
        extension: 'md',
        name: 'file.md',
        stat: { ctime: 0, mtime: 0, size: 0 },
        saving: false,
        cache: null,
        parent: { path: 'test' },
        vault: null
      } as any;
    });

    describe('ignore mode (default)', () => {
      beforeEach(async () => {
        await plugin.loadSettings();
        plugin.settings.useIncludeMode = false;
      });

      it('should not ignore files when no rules are set', () => {
        plugin.settings.ignoreRegex = '';
        plugin.settings.ignoredFiles = {};
        
        const result = plugin.fileIsIgnored(mockFile, 'test/file.md');
        expect(result).toBe(false);
      });

      it('should ignore files matching ignore regex', () => {
        plugin.settings.ignoreRegex = 'test/.*';
        
        const result = plugin.fileIsIgnored(mockFile, 'test/file.md');
        expect(result).toBe(true);
      });

      it('should not ignore files not matching ignore regex', () => {
        plugin.settings.ignoreRegex = 'other/.*';
        
        const result = plugin.fileIsIgnored(mockFile, 'test/file.md');
        expect(result).toBe(false);
      });

      it('should ignore manually ignored files', () => {
        plugin.settings.ignoredFiles = { 'test/file.md': null };
        
        const result = plugin.fileIsIgnored(mockFile, 'test/file.md');
        expect(result).toBe(true);
      });
    });

    describe('include mode', () => {
      beforeEach(async () => {
        await plugin.loadSettings();
        plugin.settings.useIncludeMode = true;
      });

      it('should ignore all files when no include rules are set', () => {
        plugin.settings.includeRegex = '';
        plugin.settings.includedFiles = {};
        
        const result = plugin.fileIsIgnored(mockFile, 'test/file.md');
        expect(result).toBe(true);
      });

      it('should not ignore files matching include regex', () => {
        plugin.settings.includeRegex = 'test/.*';
        
        const result = plugin.fileIsIgnored(mockFile, 'test/file.md');
        expect(result).toBe(false);
      });

      it('should ignore files not matching include regex', () => {
        plugin.settings.includeRegex = 'other/.*';
        
        const result = plugin.fileIsIgnored(mockFile, 'test/file.md');
        expect(result).toBe(true);
      });

      it('should not ignore manually included files', () => {
        plugin.settings.includedFiles = { 'test/file.md': null };
        
        const result = plugin.fileIsIgnored(mockFile, 'test/file.md');
        expect(result).toBe(false);
      });

      it('should not ignore manually included files even when regex doesnt match', () => {
        plugin.settings.includeRegex = 'other/.*';
        plugin.settings.includedFiles = { 'test/file.md': null };
        
        const result = plugin.fileIsIgnored(mockFile, 'test/file.md');
        expect(result).toBe(false);
      });
    });

    describe('exclusions (both modes)', () => {
      it('should always ignore excluded files regardless of mode', async () => {
        // Test ignore mode
        await plugin.loadSettings();
        plugin.settings.useIncludeMode = false;
        plugin.settings.includeRegex = 'test/.*';
        
        const excalidrawFile = {
          path: 'test/drawing.excalidraw.md',
          basename: 'drawing.excalidraw',
          extension: 'md',
          name: 'drawing.excalidraw.md',
          stat: { ctime: 0, mtime: 0, size: 0 },
          saving: false,
          cache: null,
          parent: { path: 'test' },
          vault: null
        } as any;
        
        let result = plugin.fileIsIgnored(excalidrawFile, 'test/drawing.excalidraw.md');
        expect(result).toBe(true);
        
        // Test include mode
        plugin.settings.useIncludeMode = true;
        plugin.settings.includeRegex = 'test/.*';
        
        result = plugin.fileIsIgnored(excalidrawFile, 'test/drawing.excalidraw.md');
        expect(result).toBe(true);
      });
    });
  });
});
