// @ts-nocheck
import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { promises as fs } from 'fs';
import path from 'path';

const BUILD_DIR = path.resolve('build');
const OBSIDIAN_PLUGIN_PATH = process.env.OBSIDIAN_PLUGIN_PATH
  ? path.resolve(process.env.OBSIDIAN_PLUGIN_PATH)
  : null;
const IS_WATCH = Boolean(process.env.ROLLUP_WATCH);

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function copyFileSafe(source, destination) {
  await ensureDir(path.dirname(destination));
  await fs.copyFile(source, destination);
}

async function copyManifestIntoBuild() {
  const manifestSource = path.resolve('manifest.json');
  const manifestDestination = path.join(BUILD_DIR, 'manifest.json');
  await copyFileSafe(manifestSource, manifestDestination);
}

async function syncToObsidian() {
  if (!OBSIDIAN_PLUGIN_PATH) {
    console.warn(
      'Skipping sync to Obsidian: OBSIDIAN_PLUGIN_PATH environment variable not set',
    );
    return;
  }

  const mainSource = path.join(BUILD_DIR, 'main.js');
  const manifestSource = path.join(BUILD_DIR, 'manifest.json');

  await ensureDir(OBSIDIAN_PLUGIN_PATH);
  await copyFileSafe(mainSource, path.join(OBSIDIAN_PLUGIN_PATH, 'main.js'));
  await copyFileSafe(
    manifestSource,
    path.join(OBSIDIAN_PLUGIN_PATH, 'manifest.json'),
  );
}

function artifactSyncPlugin() {
  return {
    name: 'artifact-sync-plugin',
    async writeBundle() {
      try {
        await copyManifestIntoBuild();
        if (IS_WATCH) {
          await syncToObsidian();
        }
      } catch (error) {
        console.warn('Failed to synchronize build artifacts:', error);
      }
    },
  };
}

export default {
  input: 'main.ts',
  output: {
    dir: BUILD_DIR,
    sourcemap: 'inline',
    format: 'cjs',
    exports: 'default',
  },
  external: ['obsidian'],
  plugins: [
    typescript(),
    nodeResolve({ browser: true }),
    commonjs(),
    artifactSyncPlugin(),
  ],
};
