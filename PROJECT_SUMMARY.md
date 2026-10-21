# XYZ Project Feature Summary

## Overview

XYZ is a cinematic, distraction-free video workspace built with Next.js 16. The project is designed around an immersive media experience: large playback surfaces, ambient visual treatment, and keyboard-first controls that keep the focus on content instead of cluttered UI.

## Core Product Features

### 1. Cinematic media stage
- Full-screen, immersive video canvas with ambient glow and color-driven visual treatment.
- Designed to feel like a focused "cinema stage" rather than a traditional social video feed.
- Encourages attention on playback, discovery, and flow rather than page clutter.

### 2. Keyboard-first controls
- Playback shortcuts such as play/pause, seek, next/previous media, and mute toggles.
- Optimized for fast navigation without needing to move the mouse often.
- Includes standard hotkey patterns for a smoother, streamlined interface.

### 3. Adaptive workspace modes
- Zen Stage for a minimal, borderless playback experience.
- Studio Split for a dual-view layout with queue and supporting content.
- Focus Mode for more ambient, minimal audio-first sessions.
- Supports different user contexts without changing the underlying media workflow.

### 4. Command center / spotlight interface
- Unified command palette for quick actions and media entry.
- Supports fast ingestion of links or IDs, custom feed navigation, and workspace switching.
- Helps centralize discovery and control in one compact interaction layer.

### 5. Persistent background playback
- Audio keep-alive behavior helps media continue playing when tab focus is lost.
- Useful for keeping music, talk content, or background sessions active while multitasking.

### 6. Ambient and immersive interface polish
- Dynamic background effects, floating UI layers, and minimal HUD overlays.
- Provides a premium visual experience while preserving playback clarity.
- Makes content feel more like a media workspace than a standard video app.

## Content and media model

The project includes logic for resolving, organizing, and presenting media content from multiple sources and formats.

- Content resolution utilities map incoming requests and IDs to the appropriate source.
- Provider modules handle formats, thumbnails, manifest generation, YouTube data, RSS, and instance metadata.
- Media utilities support playback adaptation and structured data flow for sections and video lists.

## Technical stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- HLS.js and Shaka Player for modern streaming playback
- Vitest for automated tests
- ESLint for code quality

## Project structure highlights

- app/: application routes and UI entry points
- components/: reusable UI components and player controls
- lib/: media logic, providers, hooks, and content resolution
- tests/: validation for playback, content lists, and core project behavior

## Validation status

The current project state is healthy based on the repository checks:

- Test suite: 62/62 passing
- Lint check: passes without errors

## Summary

XYZ is best described as a modern cinematic video and media workspace: visually immersive, fast to navigate, keyboard-friendly, and built around a persistent playback experience. Its strongest differentiators are the ambient design, adaptive workspace modes, and a modular media architecture that can resolve and present content from different sources.
