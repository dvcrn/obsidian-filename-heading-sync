import { App, TFile } from 'obsidian';

export function isExcalidraw(app: App, f: TFile) {
  if (f.extension === 'excalidraw' || /.*\.excalidraw\.md$/g.test(f.path)) {
    return true;
  }
  const fileCache = app.metadataCache.getFileCache(f);
  return (
    !!fileCache?.frontmatter && !!fileCache.frontmatter['excalidraw-plugin']
  );
}

export function isKanban(app: App, f: TFile) {
  const fileCache = app.metadataCache.getFileCache(f);
  return !!fileCache?.frontmatter && !!fileCache.frontmatter['kanban-plugin'];
}

/**
 * Files opened with "Open file from outside the vault" are TFiles without a
 * parent folder. Renaming one would move it into the vault root.
 */
export function isOutsideVault(f: TFile) {
  return f.parent === null;
}

export function isExcluded(app: App, f: TFile) {
  if (isExcalidraw(app, f)) {
    return true;
  }
  if (isKanban(app, f)) {
    return true;
  }

  return false;
}
