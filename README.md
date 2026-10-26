# xyz

XYZ is a neutral, content-first video browser for music and learning, built with Next.js 16 and React 19. It keeps discovery lightweight, playback session state explicit, and the app chrome quiet enough to stay out of the way.

## What it does

- Browses catalog and search content without warming playback infrastructure on the home screen.
- Keeps native playback, YouTube embeds, and direct HLS sources separated behind clear provider logic.
- Uses explicit playback sessions so retrying or switching videos cannot overwrite the active attempt.
- Keeps recent search history private in the browser and avoids leaking API keys into URLs or logs.
- Uses a restrained neutral palette, clearer typography, and mobile-safe layouts.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Verification

```bash
npm test
npm run lint
npm run build
```

## Notes

- Built-in native playback remains the default path for network-restricted environments.
- YouTube embeds still depend on browser access and provider restrictions.
- Public playback instances are treated as a best-effort path and are not a universal guarantee for all content.
