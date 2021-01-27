#!/usr/bin/env makefile

.PHONY: build
build:
	mkdir -p build/
	npm run build
	cp main.js build/
	cp manifest.json build/

.PHONY: dev
dev:
	npm run dev

default: build
