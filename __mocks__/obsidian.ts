export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  minAppVersion: string;
  author: string;
  description: string;
}

export class App {
  vault: any;
  workspace: any;
  constructor() {
    this.vault = {};
    this.workspace = {};
  }
}

export class Plugin {
  app: App;
  manifest: any;

  constructor(app: App, manifest: any) {
    this.app = app;
    this.manifest = manifest;
  }

  loadData(): Promise<any> {
    return Promise.resolve({});
  }

  saveData(data: any): Promise<void> {
    return Promise.resolve();
  }
}

export class PluginSettingTab {}
export class Setting {}
export class TAbstractFile {}
export class TFile extends TAbstractFile {
  basename: string;
  extension: string;
  path: string;
  parent: any;

  constructor() {
    super();
    this.basename = '';
    this.extension = '';
    this.path = '';
    this.parent = { path: '' };
  }
}
export class Editor {}
export class MarkdownView {}
