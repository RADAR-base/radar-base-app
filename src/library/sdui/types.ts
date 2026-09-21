import type { ReactNode } from 'react';
import type { Node } from '../contracts/NodeSchema';
import type { ThemeManifest } from '../contracts/ManifestSchema';

/**
 * Variables available for `{{template}}` interpolation inside node props. The shape is
 * intentionally open: hosts can extend it via the `templateContext` prop on `SDUIShell`.
 */
export interface TemplateContext {
  user?: Record<string, unknown>;
  study?: Record<string, unknown>;
  schedule?: Record<string, unknown>;
  [scope: string]: Record<string, unknown> | undefined;
}

/**
 * The actions an `ActionNode` can dispatch. Engine handles `OpenCustomView` / `Navigate`
 * internally; `TriggerEvent` is forwarded to the host EventBus; `OpenExternalUrl` opens
 * the system browser. Unknown actions are no-ops with a console warning.
 */
export type ActionPayload =
  | { type: 'OpenCustomView'; viewUrl: string; params?: Record<string, unknown> }
  | { type: 'Navigate'; tabId: string }
  | { type: 'OpenExternalUrl'; url: string }
  | { type: 'TriggerEvent'; eventName: string; payload?: unknown }
  | { type: string; [key: string]: unknown };

export interface SDUIContext {
  /** Template variables (`{{user.firstName}}` etc.). */
  template: TemplateContext;
  /** Dispatch a node action — engine handles routing. */
  dispatch: (action: ActionPayload) => void | Promise<void>;
  /** Theme block from the manifest, made available to nodes that want to style themselves. */
  theme: ThemeManifest;
  /** Optional EventBus pass-through for nodes that want to emit custom events. */
  eventBus?: {
    emit: (event: string, data?: unknown) => void;
  };
}

/**
 * Props every node component receives. Children are pre-resolved by the engine — call
 * `render(node.children)` from a canvas node to render them. Non-canvas nodes can read
 * type-specific props directly off `node`.
 */
export interface NodeProps<T extends Node = Node> {
  node: T;
  context: SDUIContext;
  /** Render an array of child nodes into ReactNodes. Pass `node.children` to keep tree order. */
  render: (children: Node[] | undefined) => ReactNode;
}

export type NodeComponent<T extends Node = Node> = React.ComponentType<NodeProps<T>>;
