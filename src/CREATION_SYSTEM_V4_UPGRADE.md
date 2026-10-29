# Jimskay Creation System V4 Upgrade

## Attachment pipeline
- Selected files now appear immediately in the chat composer instead of waiting for server inspection.
- Folder selections appear immediately with file count and packaging status.
- Inspection/packaging errors no longer make the selected item disappear.
- Attachment chips show filename, extension, size, file count, live status, and remove action.
- Existing server inspection, Firebase Storage persistence, and AI file context remain intact.

## PDF engine
- Preserves the existing HTML-first publication styling and MiKTeX/XeLaTeX hybrid math path.
- Enables Chromium running header/footer rendering so page numbers and date are visible on multi-page PDFs.
- Keeps automatic table of contents, semantic callouts, tables, equation normalization, print-safe math scaling, and page-break controls.

## Video generation
- Adds a directed-shot layer around Veo generation with educational/cinematic/documentary/diagrammatic quality profiles.
- Adds explicit camera-motion and negative-prompt controls.
- Keeps the five-second Veo 2 shot contract while improving composition, continuity, safe margins, and teaching-purpose motion.
- Existing lesson-scene compositing and narrated WebM export remain supported by the visual lesson player.

## Animation / visual lessons
- Uses the V3 semantic storyboard contract with stable element IDs, visual beats, camera targets, checkpoints, semantic layout, and teaching-purpose motion.
- Player supports narrated playback, scene navigation, bookmarks, transcript, checkpoints, debug information, reduced motion, Veo scene playback, narrated scene export, and full narrated WebM export.

## Visual artifacts
- Stronger extraction and safety normalization.
- Responsive-structure validation is now part of the automatic repair gate.
- Interactive HTML/SVG artifacts can be opened in a new tab or downloaded as standalone files.
- Existing sandbox/CSP preview isolation remains in place.

## Verification
The source was inspected after the changes. A full TypeScript build cannot be completed from the source-only archive because the archive intentionally does not contain the project's installed npm dependencies. The changed files produced no parser/syntax diagnostics; dependency/module errors are environment errors from the source-only check.
