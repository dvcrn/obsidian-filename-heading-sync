# Use bash shell so we can rely on bashisms when needed

set shell := ["bash", "-cu"]

OBSIDIAN_PLUGIN_DIR := "/Users/david/Obsidian/Primary/.obsidian/plugins/obsidian-filename-heading-sync"

default: build

# Build production artifacts into build/
build:
    npm run build

# Build and copy artifacts into the live Obsidian plugin directory
sync:
    just build
    mkdir -p {{ OBSIDIAN_PLUGIN_DIR }}
    rsync -a --delete build/ {{ OBSIDIAN_PLUGIN_DIR }}/

# Run the watch build (Rollup sets ROLLUP_WATCH automatically)
watch:
    npm run dev

# Ensure initial sync, then run the watch build to keep Obsidian updated
watch-sync:
    just sync
    npm run dev
