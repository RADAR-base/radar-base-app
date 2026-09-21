import type { NodeComponent } from './types';

/**
 * Singleton registry mapping SDUI node `type` strings to React components. The engine
 * looks up each node here while walking the blueprint tree. Hosts register custom nodes
 * with `NodeRegistry.getInstance().register('MyNode', MyNodeComponent)` at app startup.
 *
 * The manifest's `widgetsRegistry` block is a discovery declaration only — it tells
 * tooling which custom types this app advertises. The actual component must still be
 * registered here so it is type-checked and bundled.
 */
export class NodeRegistry {
  private static instance: NodeRegistry | null = null;
  private readonly registry = new Map<string, NodeComponent>();
  private fallback: NodeComponent | null = null;

  static getInstance(): NodeRegistry {
    if (!NodeRegistry.instance) {
      NodeRegistry.instance = new NodeRegistry();
    }
    return NodeRegistry.instance;
  }

  register(type: string, component: NodeComponent): void {
    this.registry.set(type, component);
  }

  unregister(type: string): void {
    this.registry.delete(type);
  }

  has(type: string): boolean {
    return this.registry.has(type);
  }

  get(type: string): NodeComponent | undefined {
    return this.registry.get(type);
  }

  /**
   * Set the fallback component rendered for unknown node types. Useful for showing a
   * "Coming Soon" placeholder during incremental migrations.
   */
  setFallback(component: NodeComponent | null): void {
    this.fallback = component;
  }

  getFallback(): NodeComponent | null {
    return this.fallback;
  }

  listRegisteredTypes(): string[] {
    return Array.from(this.registry.keys()).sort();
  }
}
