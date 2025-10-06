# Use bash for recipe shell to support `set -euo pipefail` if needed

set shell := ["bash", "-cu"]

# Default recipe
default: build

# Build: ensure build/ exists, run project build, and copy artifacts
build:
    mkdir -p build/
    npm run build
    cp main.js build/
    cp manifest.json build/

# Dev: run development watcher
dev:
    npm run dev
