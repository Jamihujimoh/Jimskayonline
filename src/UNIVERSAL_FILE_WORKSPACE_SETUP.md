# Jimskay Universal File Workspace — dependencies

Add these packages to the project that contains this `src` folder:

```bash
npm install jszip pdf-parse@1.1.1 mammoth xlsx docx pdf-lib
```

## What the upgrade does

- Any normal file can be attached instead of only text/code extensions.
- PDF text is extracted server-side.
- DOCX text is extracted server-side.
- XLS/XLSX sheets are converted into readable tabular context.
- ZIP files are inspected and supported text/code files inside them are exposed to the AI.
- A folder can be selected from the file picker and is packaged into a ZIP on the server.
- Original uploads are stored in Firebase Storage.
- Text/code updates are rebuilt directly.
- DOCX, XLS/XLSX and PDF updates are rebuilt into real downloadable files.
- ZIP/folder updates use an explicit `UPDATED_ARCHIVE` JSON protocol and are rebuilt as ZIP.
- The chat stores the original/updated Storage download URL so the download button retrieves the real binary file.

## Important format limitation

No generic AI text interface can perfectly reconstruct every proprietary binary format. Unknown binary formats are safely stored and can be downloaded, but the extractor does not pretend it can edit their internal structure. For supported formats, the rebuilt file is a new valid file generated from the AI's edited representation; the original binary remains preserved in Firebase Storage.

## Firebase Storage / Firestore rules

The existing Firebase Storage rules must allow authenticated users to write/read their own:

`users/{uid}/files/**`

The existing Firestore rules must allow the user's own chat messages to store the `fileAttachment` / `updatedFile` metadata.

## Security

The extracted file content is explicitly treated as untrusted user data. It must never override the system prompt or application instructions. The server limits extracted context to prevent a huge file from overflowing a Firestore document or model request.


## Visual Lesson + Narrated Video Engine

The source now includes a general-purpose narrated visual lesson pipeline. The AI can return a structured `VISUAL_LESSON` timeline for any subject, including science, mathematics, history, programming, engineering, geography, medicine, literature, business, systems, and process explanations.

### Added files
- `src/lib/visual-lesson.ts` — lesson timeline types, validation, parsing, and duration helpers.
- `src/ai/prompts/visual-lesson-protocol.ts` — subject-agnostic scene-generation protocol.
- `src/ai/flows/generate-narration-flow.ts` — Gemini TTS narration generation.
- `src/components/VisualLessonPlayer.tsx` — canvas animation player, narration playback, timeline/seek, speed, mute, and WebM video export.

### How it works
1. Jimskay detects requests for narrated videos, teaching animations, voice explanations, or explainer videos.
2. The model generates a structured scene timeline rather than an unstructured video prompt.
3. Each scene contains visual primitives, movement, labels/arrows, captions, duration, and narration.
4. The player renders the same timeline in the chat.
5. Gemini TTS generates synchronized narration for each scene.
6. The browser can record the rendered canvas plus generated narration into a downloadable WebM video.

### TTS model
The narration flow uses `googleai/gemini-3.8-flash-tts`. Keep the Google/Genkit dependency versions current enough to support this model. Gemini's current TTS API supports controllable educational narration and WAV output.

### Video format
Browser-side export currently produces WebM because `MediaRecorder` support is widely available for canvas + audio recording while MP4 encoding is not a universal browser capability. The same lesson timeline is deliberately kept renderer-neutral so a future server FFmpeg/Remotion renderer can produce MP4 without changing the AI lesson format.

### Important design principle
Do not replace the existing HTML/SVG visual artifact engine. The two systems have different purposes:
- Visual artifacts: self-contained HTML/SVG diagrams and interactive demonstrations.
- Visual lessons: timed teaching sequences with synchronized narration and video export.

Both can be produced by the same AI response pipeline depending on the user's request.
