# XYZ Project Feature Summary

## Overview

XYZ is a neutral video browser for music and learning, built with Next.js 16. The project emphasizes content discovery, dependable playback sessions, and a quiet interface that stays out of the way while the user watches or browses.

## Core Product Features

### 1. Minimal, calm interface
- Neutral charcoal surfaces and restrained contrast rather than bright color treatments.
- Clear English and Khmer-friendly typography that stays legible across cards, headers, and player metadata.
- A calmer, content-first browsing pattern without a rotating promotional banner or oversized hero card.

### 2. Playback reliability
- Explicit playback sessions prevent stale metadata and old request handlers from overwriting the active attempt.
- Retry and selection flows create fresh session attempts so same-video retries and rapid switching stay predictable.
- The app keeps provider limitations explicit instead of pretending unsupported playback is universally available.

### 3. Lightweight discovery
- Home browsing avoids triggering media-engine startup or manifest resolution until the user deliberately opens a watch session.
- Discovery and search prioritize fast rendering and relevant thumbnails without speculative playback warm-up.
- Search history is kept local and request state is protected against stale responses.

### 4. Keyboard and accessibility
- Settings focus is moved into the dialog with Escape-to-close and focus restoration.
- Search, controls, and dialogs remain keyboard-friendly without conflicting with editable fields.
- Video controls reflect actual engine capabilities instead of overlaying unsupported UI.

### 5. Provider honesty
- Native playback remains the default for deployed environments where YouTube is restricted or blocked.
- YouTube embeds are still used when supported, but they are not treated as a universal reliability guarantee.
- Public instance fallback is treated as best-effort rather than as a promise of a universally playable network path.

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
