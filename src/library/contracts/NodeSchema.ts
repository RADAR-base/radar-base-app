import { z } from 'zod';

/**
 * Recursive schema for an SDUI node. Each node has a stable `id` (used for analytics,
 * targeting, and incremental updates), a `type` that the engine resolves against the
 * `NodeRegistry`, and arbitrary type-specific props. Nodes that act as containers
 * advertise this via `isCanvas: true` and supply a `children` array.
 *
 * The schema is intentionally permissive via `.passthrough()` so feature nodes can carry
 * their own props without forcing the engine to know every shape. Per-node validation is
 * the responsibility of the node component itself.
 */
export type NodeShape = {
  id: string;
  type: string;
  isCanvas?: boolean;
  children?: NodeShape[];
  [key: string]: unknown;
};

export const NodeSchema: z.ZodType<NodeShape> = z.lazy(() =>
  z
    .object({
      id: z.string().min(1, 'Node id is required'),
      type: z.string().min(1, 'Node type is required'),
      isCanvas: z.boolean().optional(),
      children: z.array(NodeSchema).optional(),
    })
    .passthrough(),
);

export type Node = z.infer<typeof NodeSchema>;
