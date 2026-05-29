import { Linking, type EmitterSubscription } from 'react-native';

export interface OAuthCallback {
  code: string;
  state: string;
  error?: string;
  errorDescription?: string;
}

export type OAuthCallbackListener = (callback: OAuthCallback) => void;

/**
 * Parses an OAuth callback URL emitted by the IdP redirect back into the app.
 * Returns `null` when the URL is unrelated to OAuth (i.e. some other deep link).
 */
export function parseOAuthCallback(rawUrl: string): OAuthCallback | null {
  if (!rawUrl.includes('code=') && !rawUrl.includes('error=')) {
    return null;
  }
  try {
    const url = new URL(rawUrl);
    const params = url.searchParams;
    return {
      code: params.get('code') ?? '',
      state: params.get('state') ?? '',
      error: params.get('error') ?? undefined,
      errorDescription: params.get('error_description') ?? undefined,
    };
  } catch {
    return {
      code: '',
      state: '',
      error: 'invalid_callback',
      errorDescription: `Failed to parse OAuth callback URL: ${rawUrl}`,
    };
  }
}

/**
 * Listens for OAuth callback deep links and dispatches them to `listener`.
 *
 * Handles two cases:
 *   - App already running and brought to the foreground by the redirect (`url` event).
 *   - App opened cold by the redirect (`Linking.getInitialURL()`).
 *
 * Returns an `unsubscribe` function. Call it from your effect cleanup.
 */
export function listenForOAuthCallbacks(listener: OAuthCallbackListener): () => void {
  const handle = (event: { url: string }) => {
    const callback = parseOAuthCallback(event.url);
    if (callback) listener(callback);
  };

  const subscription: EmitterSubscription = Linking.addEventListener('url', handle);

  Linking.getInitialURL()
    .then((url) => {
      if (url) handle({ url });
    })
    .catch(() => undefined);

  return () => subscription.remove();
}
