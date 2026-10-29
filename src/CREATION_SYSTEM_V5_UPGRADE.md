# Jimskay Creation System V5

This upgrade makes the shared lesson storyboard the canonical source for visual artifacts, visual lessons, generated video shots, narration timing and downstream document representations.

## New core
- `src/lib/creation-pipeline.ts` — shared semantic lesson/project contract.
- `src/lib/visual-artifact-quality.ts` — second-stage deterministic artifact quality/security gate.
- `src/ai/flows/video-production-flow.ts` — converts a lesson into validated multi-shot production plans.

## Visual lessons
- Stable semantic element IDs remain authoritative.
- Scenes now carry teaching purpose, semantic assets, narration segments and video-shot metadata.
- Creation quality score/warnings are attached to the lesson.
- Camera/beat target validation is stricter.

## Visual artifacts
- Responsive/security/semantic checks run after the existing artifact validators.
- The protocol now explicitly requires real educational geometry, exact equations/numbers, purposeful interaction and reduced-motion support.

## Video
- Every lesson scene can become a directed five-second shot.
- Quality profile, camera direction, continuity key, teaching purpose and negative prompt are passed into Veo.
- Programmatic overlays remain the authority for exact labels, equations, captions and diagrams.
- Up to eight lesson scenes are eligible for generated clips instead of the previous four-scene cap.

## Compatibility
The changes are additive. Existing V1/V2/V3 lessons continue to load because the new fields are optional and `clampLesson()` remains the compatibility boundary.
