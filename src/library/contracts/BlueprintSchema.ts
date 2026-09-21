import { z } from 'zod';
import { NodeSchema } from './NodeSchema';

/**
 * A screen blueprint — a JSON document describing one screen as a node tree. Loaded
 * on demand by the SDUI engine when a tab or secondary view is opened. Blueprints are
 * cached by `viewPath` in the loader and validated against this schema before render.
 */
export const BlueprintSchema = z.object({
  blueprintVersion: z.string().min(1, 'blueprintVersion is required'),
  root: NodeSchema,
});

export type ScreenBlueprint = z.infer<typeof BlueprintSchema>;
