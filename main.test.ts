import FilenameHeadingSyncPlugin from './main';
import {
  generateFilenameFromHeading,
  generateHeadingFromFilename,
  headingMatchesFilename,
  titlePropertyValue,
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

  describe('filename to heading sync', () => {
    it('keeps a heading whose stripped characters are absent from the filename', async () => {
      const file = { basename: 'text text' } as TFile;
      const modify = jest.fn();

      app.vault.read = jest.fn().mockResolvedValue('# text: text\n\nbody');
      app.vault.modify = modify;
      app.workspace.getLeavesOfType = jest.fn().mockReturnValue([]);
      plugin.settings = {
        userIllegalSymbols: [],
        spaceReplacementCharacter: '',
        insertHeadingIfMissing: true,
      } as unknown as typeof plugin.settings;

      await plugin.forceSyncFilenameToHeading(file);
      await new Promise(process.nextTick);

      expect(modify).not.toHaveBeenCalled();
    });

    describe('inserting a missing heading', () => {
      function setup(frontmatter: Record<string, unknown>) {
        const file = { basename: 'Coffee Yes' } as TFile;
        const modify = jest.fn();

        app.vault.read = jest
          .fn()
          .mockResolvedValue('---\ntitle: x\n---\nbody');
        app.vault.modify = modify;
        app.workspace.getLeavesOfType = jest.fn().mockReturnValue([]);
        app.metadataCache = {
          getFileCache: jest.fn().mockReturnValue({ frontmatter }),
        } as unknown as App['metadataCache'];
        plugin.settings = {
          userIllegalSymbols: [],
          spaceReplacementCharacter: '',
          insertHeadingIfMissing: true,
          newHeadingStyle: 'Prefix',
          titleProperty: 'title',
        } as unknown as typeof plugin.settings;

        return { file, modify };
      }

      it('uses the stored title property', async () => {
        const { file, modify } = setup({ title: 'Coffee? Yes' });

        await plugin.forceSyncFilenameToHeading(file);
        await new Promise(process.nextTick);

        expect(modify.mock.calls[0][1]).toContain('# Coffee? Yes');
      });

      it('uses a stored title that YAML parsed as a number', async () => {
        const { file, modify } = setup({ title: 1984 });

        await plugin.forceSyncFilenameToHeading(file);
        await new Promise(process.nextTick);

        expect(modify.mock.calls[0][1]).toContain('# 1984');
      });

      it('uses the filename without a stored title', async () => {
        const { file, modify } = setup({});

        await plugin.forceSyncFilenameToHeading(file);
        await new Promise(process.nextTick);

        expect(modify.mock.calls[0][1]).toContain('# Coffee Yes');
      });
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

    describe('title property', () => {
      function setup(heading: string, frontmatter: Record<string, unknown>) {
        const file = {
          basename: 'Old name',
          parent: { path: '' },
        } as TFile;
        const stored = { ...frontmatter };
        const processFrontMatter = jest.fn(async (_file, fn) => fn(stored));

        app.fileManager.renameFile = jest.fn(async (_file, newPath) => {
          file.basename = newPath.replace(/\.md$/, '');
        });
        app.fileManager.processFrontMatter = processFrontMatter;
        app.vault.read = jest.fn().mockResolvedValue(`# ${heading}`);
        app.workspace.getLeavesOfType = jest.fn().mockReturnValue([]);
        app.metadataCache = {
          getFileCache: jest.fn().mockReturnValue({ frontmatter }),
        } as unknown as App['metadataCache'];
        plugin.settings = {
          userIllegalSymbols: ['?'],
          spaceReplacementCharacter: '',
          titleProperty: 'title',
        } as unknown as typeof plugin.settings;

        return { file, stored, processFrontMatter };
      }

      it('stores the heading when the filename had to be sanitized', async () => {
        const { file, stored } = setup('Coffee? Yes', {});

        await plugin.forceSyncHeadingToFilename(file);

        expect(file.basename).toBe('Coffee Yes');
        expect(stored).toEqual({ title: 'Coffee? Yes' });
      });

      it('removes the property when filename and heading are equal', async () => {
        const { file, stored } = setup('Coffee', {
          title: 'Coffee?',
          tags: ['x'],
        });

        await plugin.forceSyncHeadingToFilename(file);

        expect(stored).toEqual({ tags: ['x'] });
      });

      it('does not write when the property is already correct', async () => {
        const { file, processFrontMatter } = setup('Coffee? Yes', {
          title: 'Coffee? Yes',
        });

        await plugin.forceSyncHeadingToFilename(file);

        expect(processFrontMatter).not.toHaveBeenCalled();
      });

      it('does not add frontmatter when no title is needed', async () => {
        const { file, processFrontMatter } = setup('Coffee', {});

        await plugin.forceSyncHeadingToFilename(file);

        expect(processFrontMatter).not.toHaveBeenCalled();
      });

      it('does nothing when the setting is empty', async () => {
        const { file, processFrontMatter } = setup('Coffee? Yes', {});
        plugin.settings.titleProperty = '';

        await plugin.forceSyncHeadingToFilename(file);

        expect(processFrontMatter).not.toHaveBeenCalled();
      });

      it('stores a heading made only of illegal characters', async () => {
        const { file, stored } = setup('?', {});

        await plugin.forceSyncHeadingToFilename(file);

        expect(file.basename).toBe('Old name');
        expect(stored).toEqual({ title: '?' });
      });

      it('does not write while the editor has unsaved changes', async () => {
        const { file, processFrontMatter } = setup('Coffee? Yes', {});
        const view = Object.assign(Object.create(MarkdownView.prototype), {
          file,
          dirty: true,
          editor: { getValue: jest.fn().mockReturnValue('# Coffee? Yes') },
        });
        app.workspace.getLeavesOfType = jest.fn().mockReturnValue([{ view }]);

        await plugin.forceSyncHeadingToFilename(file);

        expect(processFrontMatter).not.toHaveBeenCalled();
      });

      it('removes a stale property when filename-to-heading sync replaces the heading', async () => {
        const { file, stored } = setup('Coffee?', { title: 'Coffee?' });
        file.basename = 'Tea';
        app.vault.modify = jest.fn().mockResolvedValue(undefined);
        (plugin.settings as any).newHeadingStyle = 'Prefix';

        await plugin.forceSyncFilenameToHeading(file);

        expect((app.vault.modify as jest.Mock).mock.calls[0][1]).toContain(
          '# Tea',
        );
        expect(stored).toEqual({});
      });
    });

    it('ignores its own rename event before asynchronous handlers run', async () => {
      const file = Object.assign(new TFile(), {
        basename: 'Old name',
        path: 'Old name.md',
        extension: 'md',
      });
      const waitForTemplater = jest.spyOn(plugin, 'waitForTemplater');
      app.workspace.getLeavesOfType = jest.fn().mockReturnValue([]);
      app.vault.read = jest.fn().mockResolvedValue('# New name');
      app.fileManager.renameFile = jest.fn(async () => {
        plugin.handleFileRename(file, 'Old name.md');
      });
      plugin.settings = {
        useFileSaveHook: true,
        userIllegalSymbols: [],
        spaceReplacementCharacter: '',
      } as unknown as typeof plugin.settings;

      await plugin.forceSyncHeadingToFilename(file);

      expect(app.fileManager.renameFile).toHaveBeenCalled();
      expect(waitForTemplater).not.toHaveBeenCalled();
    });

    describe('concurrent synchronization', () => {
      let file: TFile;
      let heading: string;
      let releaseRename: () => void;
      let renameStarted: Promise<void>;
      let reverseSync: jest.SpyInstance;

      beforeEach(() => {
        file = Object.assign(new TFile(), {
          basename: 'Old',
          path: 'Old.md',
          extension: 'md',
        });
        heading = '# First';
        plugin.settings = {
          userIllegalSymbols: [],
          spaceReplacementCharacter: '',
          useFileSaveHook: true,
        } as unknown as typeof plugin.settings;
        const view = Object.assign(Object.create(MarkdownView.prototype), {
          file,
          editor: { getValue: () => heading },
        });
        app.workspace.getLeavesOfType = jest.fn().mockReturnValue([{ view }]);
        jest.spyOn(plugin, 'waitForTemplater').mockResolvedValue(undefined);
        reverseSync = jest
          .spyOn(plugin, 'forceSyncFilenameToHeading')
          .mockResolvedValue(undefined);
        jest.spyOn(plugin, 'fileIsIgnored').mockReturnValue(false);
        let markStarted: () => void;
        renameStarted = new Promise<void>((resolve) => {
          markStarted = resolve;
        });
        const gate = new Promise<void>((resolve) => {
          releaseRename = resolve;
        });
        app.fileManager.renameFile = jest.fn(async (renamedFile, path) => {
          markStarted();
          await gate;
          const oldPath = renamedFile.path;
          renamedFile.path = path;
          if (renamedFile instanceof TFile) {
            renamedFile.basename = path.slice(0, -3);
          }
          plugin.handleFileRename(renamedFile, oldPath);
        });
      });

      it('serializes overlapping requests and reads the latest heading when queued work starts', async () => {
        const first = plugin.forceSyncHeadingToFilename(file);
        await renameStarted;
        heading = '# Intermediate';
        const second = plugin.forceSyncHeadingToFilename(file);
        const third = plugin.forceSyncHeadingToFilename(file);
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(app.fileManager.renameFile).toHaveBeenCalledTimes(1);
        heading = '# Latest';
        releaseRename();
        await Promise.all([first, second, third]);
        expect(app.fileManager.renameFile).toHaveBeenCalledTimes(2);
        expect(app.fileManager.renameFile).toHaveBeenLastCalledWith(
          file,
          'Latest.md',
        );
        expect(reverseSync).not.toHaveBeenCalled();
        plugin.handleFileRename(file, 'Previous.md');
        await Promise.resolve();
        expect(reverseSync).toHaveBeenCalledWith(file);
      });

      it('does not suppress external renames of another file', async () => {
        const sync = plugin.forceSyncHeadingToFilename(file);
        await renameStarted;
        const other = Object.assign(new TFile(), {
          basename: 'Other',
          path: 'Other.md',
          extension: 'md',
        });
        plugin.handleFileRename(other, 'Previous.md');
        await Promise.resolve();
        expect(reverseSync).toHaveBeenCalledWith(other);
        releaseRename();
        await sync;
        expect(reverseSync).toHaveBeenCalledTimes(1);
      });

      it('allows different files to synchronize independently', async () => {
        const first = plugin.forceSyncHeadingToFilename(file);
        await renameStarted;
        const other = Object.assign(new TFile(), {
          basename: 'Other',
          path: 'Other.md',
          extension: 'md',
        });
        app.vault.read = jest.fn().mockResolvedValue('# Other heading');
        const second = plugin.forceSyncHeadingToFilename(other);
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(app.fileManager.renameFile).toHaveBeenCalledTimes(2);
        releaseRename();
        await Promise.all([first, second]);
        expect(reverseSync).not.toHaveBeenCalled();
      });

      it('clears suppression and permits another sync after a rename fails', async () => {
        const renameFile = jest
          .fn()
          .mockRejectedValueOnce(new Error('Conflict'))
          .mockImplementationOnce(async () => {
            plugin.handleFileRename(file, 'Old.md');
          });
        app.fileManager.renameFile = renameFile;
        await plugin.forceSyncHeadingToFilename(file);
        plugin.handleFileRename(file, 'Previous.md');
        await Promise.resolve();
        expect(reverseSync).toHaveBeenCalledTimes(1);
        heading = '# Available';
        await plugin.forceSyncHeadingToFilename(file);
        expect(renameFile).toHaveBeenLastCalledWith(file, 'Available.md');
        expect(reverseSync).toHaveBeenCalledTimes(1);
      });

      it('continues queued work after a content read fails', async () => {
        app.workspace.getLeavesOfType = jest.fn().mockReturnValue([]);
        app.vault.read = jest
          .fn()
          .mockRejectedValueOnce(new Error('Read failed'))
          .mockResolvedValueOnce('# Recovered');
        releaseRename();
        const first = plugin.forceSyncHeadingToFilename(file);
        const second = plugin.forceSyncHeadingToFilename(file);
        await expect(first).rejects.toThrow('Read failed');
        await second;
        expect(app.fileManager.renameFile).toHaveBeenCalledWith(
          file,
          'Recovered.md',
        );
        expect(reverseSync).not.toHaveBeenCalled();
      });
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

describe('headingMatchesFilename', () => {
  const defaultSettings = {
    userIllegalSymbols: [],
    spaceReplacementCharacter: '',
  };

  it('matches a heading containing characters stripped from the filename', () => {
    expect(
      headingMatchesFilename('text: text', 'text text', defaultSettings),
    ).toBe(true);
  });

  it('matches a heading whose spaces are replaced in the filename', () => {
    const settings = { ...defaultSettings, spaceReplacementCharacter: '-' };
    expect(
      headingMatchesFilename('My Cool Note', 'My-Cool-Note', settings),
    ).toBe(true);
  });

  it('does not match a heading for a different filename', () => {
    expect(
      headingMatchesFilename('text: text', 'other text', defaultSettings),
    ).toBe(false);
  });
});

describe('titlePropertyValue', () => {
  const settings = { spaceReplacementCharacter: '' };

  it('returns the heading when the filename differs', () => {
    expect(titlePropertyValue('Coffee? Yes', 'Coffee Yes', settings)).toBe(
      'Coffee? Yes',
    );
  });

  it('returns null when the filename equals the heading', () => {
    expect(titlePropertyValue(' Coffee ', 'Coffee', settings)).toBeNull();
  });

  it('returns null when only spaces were replaced in the filename', () => {
    const dashed = { spaceReplacementCharacter: '-' };
    expect(titlePropertyValue('Coffee Yes', 'Coffee-Yes', dashed)).toBeNull();
    expect(titlePropertyValue('Coffee? Yes', 'Coffee-Yes', dashed)).toBe(
      'Coffee? Yes',
    );
  });
});
