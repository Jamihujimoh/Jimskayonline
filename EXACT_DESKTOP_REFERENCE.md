# Jimskay AI — Desktop Reference Build

The five supplied desktop screenshots are treated as the visual source of truth for the initial desktop surfaces:

- `/` — Get Started
- `/dashboard` — Tactical Modules
- `/chat` — Chat empty state
- `/academic` — Study Lab
- `/intel` — Web Search

Reference screenshots are stored in `public/reference-screens/` and the earlier extracted artwork remains in `public/reference-art/`.

The reference surfaces are fixed to the supplied desktop geometry and scale to the window. Interactive hotspots keep navigation usable. Chat and search switch to their live application implementations after the user begins an action, while the untouched initial state remains an exact screenshot surface.

The existing application source/configuration is preserved so the same components can later be adapted for web/mobile or wrapped with Electron/Tauri.
