# Obsidian Filename Heading Sync

This is a Obsidian plugin to keep the filename and the first heading of a file in sync

![demo](./demo.gif)

**Note**: This plugin will overwrite your first heading at the top of the file the moment you open it, so this can be considered _destructive_.

Discussion on the obsidian forum [here](https://forum.obsidian.md/t/plugin-for-keeping-the-filename-and-first-heading-of-a-file-in-sync/12042)

## Features

- When renaming the current file -> will update the heading
- When opening a file that doesn't have a heading yet -> will insert one
- When opening a file with a different heading than the current file name -> will update the heading
- When updating the heading of a file -> will rename the file

## This plugin conflicts with plugin X, how do I solve this?

- First check if this is already solvable by adding a regex rule. For example if your file always ends in `myfile.foo.md` (ending `foo`), you can exclude this globally by adding the following regex rule in the plugins settings: `.*\.foo\.md`

- If that didn't do it, see if the other plugin acts on file-open. If it does, you can go into the settings of this plugin and disable the 'file open hook' as a workaround

- If this still didn't solve the issue, [open a new issue](https://github.com/dvcrn/obsidian-filename-heading-sync/issues/new) with steps and examples how to reproduce the problem.

## Current limitations and to do

- When renaming a file that isn't the current file, nothing will happen. The heading will get updated the next time the file is opened in edit mode
- [Special characters](https://github.com/dvcrn/obsidian-filename-header-sync/blob/bc3a1a7805f2b63ad5767c3d01dcef7b65b1aebd/main.ts) that obsidian can't handle will get auto-stripped

## LICENSE

MIT
