export const VISUAL_LESSON_PROTOCOL = `
VISUAL LESSON / PROFESSIONAL DIRECTOR PROTOCOL

When the latest request asks for a narrated explanation, teaching animation, explainer video, animated lesson, voice explanation with visuals, or a video that demonstrates a concept, create a structured visual lesson.

The output is a storyboard for a deterministic educational video engine. Do NOT generate a random collection of animated shapes.

Return exactly one JSON payload between:
<<<VISUAL_LESSON>>>
{...}
<<<END_VISUAL_LESSON>>>

BASE SHAPE:
{
  "version": 3,
  "title": "Lesson title",
  "subject": "subject",
  "summary": "short description",
  "width": 1280,
  "height": 720,
  "fps": 30,
  "voice": {"name":"Kore","style":"clear, warm teacher","language":"en"},
  "theme": {"accent":"#22d3ee","mode":"cinematic"},
  "scenes": [
    {
      "id":"scene-1",
      "title":"Scene title",
      "durationMs":8000,
      "narration":"What the teacher says during this scene.",
      "caption":"Short scene caption",
      "videoVisualDescription":"Concrete shot direction showing the actual requested subject performing this scene's action.",
      "visualMode":"cinematic",
      "focusElementId":"main-object",
      "keyTakeaway":"The one idea the learner should remember.",
      "camera":{"targetId":"main-object","zoom":1.05,"transitionMs":700},
      "transition":{"type":"crossfade","durationMs":450},
      "elements":[
        {"id":"main-object","type":"circle","x":420,"y":330,"radius":90,"fill":"#ffffff"},
        {"id":"label","type":"label","relativeTo":"main-object","relation":"below","gap":55,"text":"Main object","fontSize":28}
      ],
      "visualBeats":[
        {
          "id":"beat-1",
          "startMs":0,
          "durationMs":900,
          "targetId":"main-object",
          "emphasis":0.4,
          "purpose":"explain",
          "narrationCue":"the main object",
          "visualAction":"highlight the main object"
        }
      ]
    }
  ]
}

ELEMENT TYPES:
- text / label / equation:
  x/y or relativeTo/relation/gap, text, fontSize, fontWeight, fill.
- circle:
  x/y, radius, fill, stroke, strokeWidth.
- rect:
  x/y, width, height, fill, stroke, strokeWidth.
- line:
  x/y/x2/y2, stroke, strokeWidth, dash.
- arrow:
  fromX/fromY/toX/toY, stroke, strokeWidth, text.
- path:
  points:[{x,y},...], stroke, strokeWidth, fill.

SEMANTIC IDs:
Every meaningful object MUST have a stable unique id.
If an object continues into the next scene, reuse the same id.
Do not create a new id for the same conceptual object merely because its position changes.

SEMANTIC LAYOUT:
Prefer relativeTo + relation + gap for labels and annotations.
Place label boxes outside the full bounds of their target, not from its center point. Center above/below labels and vertically center left/right labels.
Use absolute x/y for the main diagram geometry when precision matters.
Keep critical content inside approximately 60px safe margins.
Give neighboring labels enough room for the full rendered text; short default gaps often cause collisions.
Never overlap labels, equations, arrows, or important diagram components.

VISUAL BEATS:
visualBeats are the authoritative teaching timeline.
Each beat says what the learner should be looking at while the narration discusses that concept.
Use:
- startMs
- durationMs
- targetId
- emphasis 0..1
- purpose
- narrationStartMs / narrationEndMs when known
- narrationCue: a short exact phrase from the narration that this beat explains
- visualAction: the concrete change the learner should see at that moment
- optional camera x/y/zoom
The narration cue is the synchronization anchor. Never schedule a visual change before the phrase it explains.

Do NOT rely on element order to imply timing.
Do NOT animate every element.
Most objects should enter once, then remain stable until the teaching idea changes.

CAMERA:
Use camera movement sparingly.
A camera move is justified when:
- the explanation shifts to a detail,
- a formula/result needs emphasis,
- a complex diagram needs a closer view,
- the visual relationship becomes easier to understand at another scale.

Never continuously zoom or pan just to make the video look busy.

NARRATION SYNCHRONIZATION:
The narration and visual beats must agree semantically.
If the narration says "the electron moves to the right", a beat should focus the electron and its motion arrow.
If the narration introduces a formula, the formula should appear or transform at that point.
Do not show the final answer before the narration has explained the intermediate steps.

WORKED EXAMPLES:
For calculations, use separate visual elements for:
1. givens,
2. required quantity,
3. formula,
4. substitution,
5. calculation,
6. final answer.

For equations, use stable IDs so the renderer can visually emphasize or transform the relevant step.

SUBJECT-SPECIFIC VISUALS:
Choose visual structures appropriate to the actual subject.

Physics:
vectors, force diagrams, trajectories, circuits, waves, lenses, graphs, fields, springs.

Chemistry:
atoms, molecules, bonds, reaction flows, electrolysis, titration, periodic-table relationships, organic structures.

Mathematics:
number lines, coordinate planes, graphs, functions, geometric constructions, matrices, transformations, probability trees.

Biology:
cells, organs, pathways, cycles, labeled structures, processes.

History/geography:
maps, timelines, routes, locations, causal chains.

Programming:
code blocks, data flow, execution states, architecture, terminal/process diagrams.

For other subjects, invent an appropriate educational representation rather than defaulting to generic circles and rectangles.

GENERATED VIDEO SUBJECT FIDELITY:
- For every scene, write videoVisualDescription as a concrete shot direction: name the recognizable subject, setting, visible action, framing, and motion. Do not describe only a concept, metaphor, or diagram.
- When the request is about a tangible real-world object or process, make that object/process the large, recognizable, dominant subject in the generated footage. Use live-action or polished 3D/2D character animation as appropriate; do not substitute line art, floating arrows, abstract geometry, or a generic diagram for the requested subject.
- Show a distinct useful action for each scene and preserve the same subject identity, appearance, scale, and environment across connected scenes.
- Reserve diagrams, vectors, labels, and equations for the programmatic lesson layer unless the user explicitly asks for diagram-style video.
- For abstract topics without a tangible subject, choose a specific subject-appropriate visualization instead of generic decorative lines.
- Use visualMode "cinematic" for footage centered on real or animated physical subjects; use "diagram" only when a diagram is the requested visual style.

SCENE STRUCTURE AND RUNTIME:
- For a normal explanatory video without a requested duration, target 2–4 minutes of spoken narration (roughly 260–520 words) across 12–16 scenes. Give each scene a distinct teaching purpose and about 20–40 useful narration words; do not pad or repeat.
- Cover the complete explanation: context, parts, mechanism or sequence, cause-and-effect, a concrete example or observation, common misconception or limitation where relevant, and recap. Adapt these to the subject rather than forcing irrelevant sections.
- Respect an explicit requested duration or a request for a short clip; scale scene count and narration to fit it.
- Keep each generated shot focused on one visible action, but let narration explain the full step. Do not compress a multi-step mechanism into a single scene.

KNOWLEDGE CHECKS:
When useful, add a checkpoint to reinforce a concept:
{
  "checkpoint":{
    "question":"...",
    "options":["A","B","C","D"],
    "answer":1,
    "explanation":"..."
  }
}
Do not turn the lesson into a game unless the user asks for one.

QUALITY RULES:
- Every animation must have a teaching purpose.
- No decorative particle spam.
- No random bouncing.
- No constant scaling.
- No giant title cards replacing the lesson.
- No tiny diagram surrounded by empty space.
- No unrelated stock-looking visuals.
- No labels embedded into generated video footage; the application overlays them.
- No subtitles in generated Veo footage.
- No UI, logos, borders, watermarks, or fake controls in generated footage.
- Keep typography readable.
- Use restrained high-contrast colors.
- Keep the visual hierarchy obvious.
- One dominant teaching focus at a time.
- Do not invent facts.
- Preserve exact numbers and formulas supplied by the user.

The application supplies playback controls, narration, captions, camera movement, validation, export, transcript, bookmarks, checkpoints, and debugging. The storyboard should focus on the teaching content and timing, not on building UI.

SHARED CREATION PIPELINE CONTRACT
=================================
The storyboard is the canonical semantic source for the Visual Artifact, Video, and PDF outputs.
Do not create independent facts, numbers, equations, labels, or teaching steps for one output that contradict the storyboard.

CREATION OBJECTIVES:
- Build one coherent teaching representation first; render it into multiple media afterwards.
- Stable semantic IDs are persistent across scenes and outputs.
- Every important diagram, equation, graph, and example should have a semantic identity.
- Programmatic overlays are authoritative for text, equations, labels, axes, and precise diagrams.
- Generated video is responsible for motion, physical demonstration, environment, and cinematic context—not mathematical typography.
- Each scene must have a clear teaching purpose: establish, introduce, explain, demonstrate, derive, compare, emphasize, check, or recap.
- Prefer 12–16 scenes for a standard explainer video, with runtime scaled to the user's request; shorter or longer lessons are appropriate when explicitly requested.
- Every scene needs a meaningful visual beat plan and narration alignment.

CROSS-MEDIA CONSISTENCY:
- If an equation appears in the storyboard, the same equation must be used in the artifact/PDF/video overlays.
- If a numerical value is supplied, preserve it exactly.
- If a worked example exists, maintain the same Given → Required → Formula → Substitution → Calculation → Answer structure across outputs.
- Do not invent a visual example merely because a video model performs better on it.
- The final lesson, artifact, PDF, and video should feel like different presentations of the same lesson.

VIDEO SHOT CONTRACT:
- Each generated-video shot is a maximum five-second directed shot under the current Veo 2 contract.
- A lesson may contain multiple shots; continuity keys identify the persistent subject.
- Camera movement must be explicit and purposeful.
- Negative prompts must forbid text, subtitles, logos, UI, watermarks, invented equations, and unrelated objects.
- Prefer one dominant physical action per generated shot.
- Use programmatic overlays for exact labels and equations after generation.

QUALITY GATE:
Before accepting a lesson, verify:
1. Every scene has narration.
2. Every scene has meaningful visual content.
3. Semantic IDs are unique.
4. Visual beats target existing elements.
5. Camera targets exist when specified.
6. Worked examples preserve calculation order.
7. Video shots cover the lesson scenes.
8. Generated footage does not become the source of truth for exact text or equations.
9. There is no decorative animation without teaching purpose.
10. The lesson remains understandable with reduced motion.
`;
