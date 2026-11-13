import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Node } from '../contracts/NodeSchema';
import { fontFamily } from '../../theme/theme';

interface Props {
  node: Pick<Node, 'id' | 'type'>;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Per-node error boundary. Wraps every rendered node so a single broken node can't take
 * the whole screen down. Renders a compact inline message with the node id + type so
 * the failure is locatable in dev. In production builds, consider replacing this with a
 * silent fallback and logging via the AnalyticsService.
 */
export class NodeErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error(`[SDUI] Node "${this.props.node.id}" (${this.props.node.type}) crashed:`, error, info);
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Node failed to render</Text>
          <Text style={styles.body}>
            {this.props.node.type} ({this.props.node.id})
          </Text>
          <Text style={styles.error} numberOfLines={3}>
            {this.state.error.message}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    backgroundColor: '#fff3cd',
    borderLeftWidth: 4,
    borderLeftColor: '#dc3545',
    padding: 12,
    marginBottom: 12,
  },
  title: {
    fontSize: 13,
    fontFamily: fontFamily.bold,
    includeFontPadding: false,
    fontWeight: '700',
    color: '#856404',
    marginBottom: 4,
  },
  body: {
    fontSize: 12,
    includeFontPadding: false,
    color: '#856404',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  error: {
    fontSize: 12,
    includeFontPadding: false,
    color: '#721c24',
    fontFamily: 'monospace',
  },
});
