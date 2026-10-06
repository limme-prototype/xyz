# xyz 2.0 &bull; Cinematic Video Workspace

A distraction-free, next-generation cinematic video workspace built with Next.js 16 and Bun. Moving away completely from traditional video feed clutter into an ambient, keyboard-first media stage.

## ✨ Highlights & New UX

- **Cinema Stage & Ambient Bloom**: Hardware-accelerated dynamic backdrop glow reflecting the dominant color tones of the video, creating an edge-to-edge immersive canvas.
- **Floating Island HUD**: Controls reveal themselves smoothly on cursor movement or hotkeys, leaving playback unobstructed.
- **Spotlight Command Palette (`⌘K` or `/`)**: Unified omnibar supporting real-time autocomplete suggestions, raw link/ID ingestion, quick feeds, and workspace mode switching.
- **Adaptive Workspace Modes**:
  - **Zen Stage**: Borderless hero canvas for maximum focus.
  - **Studio Split**: 65/35 sidecar view with queue management, active video notes, and up next list.
  - **Focus Mode**: Aesthetic audio visualizer with ambient pulse concentric rings for music, lo-fi, and study sessions.
- **Persistent Background Playback**: Web Audio keep-alive engine ensuring audio continues playing across background tabs.
- **Keyboard-First Controls**:
  - `Space` / `K`: Play / Pause
  - `J` / `L` or `←` / `→`: Seek backward / forward 10s
  - `N` / `P`: Next / Previous video
  - `M`: Toggle Picture-in-Picture Mini-Player
  - `⌘K` / `/`: Open Spotlight Command Palette

## 🚀 Getting Started

```bash
bun install
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🧪 Quality & Tests

```bash
bun test
bun run lint
bun run build
```
