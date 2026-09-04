import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Node } from '../contracts/NodeSchema';
import { NodeErrorBoundary } from './NodeErrorBoundary';
import { NodeRegistry } from './NodeRegistry';
import { interpolateDeep } from './templating';
import type { NodeProps, SDUIContext } from './types';

interface NodeRendererProps {
  node: Node;
  context: SDUIContext;
}

/**
 * Renders a single node. Looks up the node's `type` in the `NodeRegistry`, interpolates
 * its props against the template context, wraps it in an error boundary, and gives it a
 * `render(children)` helper it can call to recurse.
 */
export function NodeRenderer({ node, context }: NodeRendererProps) {
  const Component = useMemo(() => {
    const registry = NodeRegistry.getInstance();
    return registry.get(node.type) ?? registry.getFallback();
  }, [node.type]);

  const interpolatedNode = useMemo(
    () => interpolateDeep(node, context.template),
    [node, context.template],
  );

  if (!Component) {
    return <UnknownNode node={node} />;
  }

  const renderChildren: NodeProps['render'] = (children) => {
    if (!children || children.length === 0) return null;
    return children.map((child) => (
      <NodeRenderer key={child.id} node={child} context={context} />
    ));
  };

  return (
    <NodeErrorBoundary node={interpolatedNode}>
      <Component node={interpolatedNode} context={context} render={renderChildren} />
    </NodeErrorBoundary>
  );
}

function UnknownNode({ node }: { node: Node }) {
  return (
    <View style={styles.unknown}>
      <Text style={styles.unknownTitle}>Unknown node type</Text>
      <Text style={styles.unknownBody}>
        {String(node.type)} ({String(node.id)})
      </Text>
      <Text style={styles.unknownHint}>
        Register it with NodeRegistry.getInstance().register(&apos;{String(node.type)}&apos;, YourNode)
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  unknown: {
    borderRadius: 8,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#dc3545',
    padding: 12,
    marginBottom: 12,
  },
  unknownTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#dc3545',
    marginBottom: 4,
  },
  unknownBody: {
    fontSize: 12,
    color: '#6c757d',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  unknownHint: {
    fontSize: 11,
    color: '#6c757d',
    fontStyle: 'italic',
  },
});
