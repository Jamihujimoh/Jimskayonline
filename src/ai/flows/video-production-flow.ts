'use server';

/**
 * Multi-shot educational video production coordinator.
 * It does not replace Veo; it turns the shared lesson storyboard into a
 * validated, continuity-aware sequence of short directed shots.
 */

import { z } from 'genkit';
import type { VisualLesson } from '@/lib/visual-lesson';
import { clampLesson } from '@/lib/visual-lesson';
import { createLessonCreationProject, type ProductionShot } from '@/lib/creation-pipeline';

export const VideoProductionInputSchema = z.object({
  lesson: z.any(),
  maxScenes: z.number().int().min(1).max(8).default(8),
  quality: z.enum(['educational', 'cinematic', 'documentary', 'diagrammatic']).optional(),
});

export type VideoProductionInput = z.infer<typeof VideoProductionInputSchema>;

export type VideoProductionPlan = {
  version: 1;
  title: string;
  shots: ProductionShot[];
  overlayPolicy: 'programmatic-only';
  validation: { errors: string[]; warnings: string[]; score: number };
};

export async function buildVideoProductionPlan(input: VideoProductionInput): Promise<VideoProductionPlan> {
  const lesson = clampLesson(input.lesson as VisualLesson);
  const project = createLessonCreationProject(lesson);
  const shots = project.shots.slice(0, input.maxScenes).map((shot) => ({
    ...shot,
    qualityProfile: input.quality || shot.qualityProfile,
  }));

  const warnings = [...project.quality.warnings];
  if (shots.length < lesson.scenes.length) warnings.push(`Only ${shots.length} of ${lesson.scenes.length} scenes are scheduled for generated video.`);

  return {
    version: 1,
    title: lesson.title,
    shots,
    overlayPolicy: 'programmatic-only',
    validation: {
      errors: project.quality.errors,
      warnings,
      score: project.quality.score,
    },
  };
}
