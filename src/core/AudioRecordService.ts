/**
 * Audio recording service — captures microphone input and returns base64-encoded audio.
 *
 * Ported from RADAR-Questionnaire's `AudioRecordService` (Capacitor/Ionic), redesigned for
 * React Native with several improvements:
 *
 *   - No mutable shared state: `stopRecording()` returns the full result directly.
 *   - Real-time metering via an `onLevel` callback (drives SpeechInput's live waveform).
 *   - Playback support so the participant can review their recording.
 *   - Clean lifecycle: `destroy()` releases all native resources.
 *
 * Two implementations ship:
 *
 *   - `DefaultAudioRecordService` — a no-op that warns when called. Used when no audio
 *     library is installed. SpeechInput gracefully degrades: phases and animations work,
 *     but no audio is captured.
 *
 *   - `ExpoAudioRecordService` — wraps `expo-audio` (the modern successor to the
 *     deprecated `expo-av`). The host app must install `expo-audio` and pass an
 *     instance via `ServiceOverrides.audioRecord`.
 */
import type { AudioRecordService, AudioRecordingResult, LoggerService } from '../types';

// ---------------------------------------------------------------------------
// No-op default — used when no audio library is available
// ---------------------------------------------------------------------------

export class DefaultAudioRecordService implements AudioRecordService {
  private readonly warn: (msg: string) => void;

  constructor(logger?: LoggerService) {
    this.warn = logger
      ? (msg) => logger.log(`[AudioRecordService] ${msg}`)
      : (msg) => console.warn(`[AudioRecordService] ${msg}`);
  }

  async requestPermission(): Promise<boolean> {
    this.warn('No audio library installed — requestPermission() is a no-op');
    return true; // let the UI proceed; recording just won't capture anything
  }

  async startRecording(): Promise<void> {
    this.warn('No audio library installed — startRecording() is a no-op');
  }

  async stopRecording(): Promise<AudioRecordingResult> {
    this.warn('No audio library installed — stopRecording() returns empty data');
    return { base64Data: '', mimeType: 'audio/m4a', durationMs: 0, fileUri: '' };
  }

  async playAudio(): Promise<void> {
    this.warn('No audio library installed — playAudio() is a no-op');
  }

  async stopPlayback(): Promise<void> {}
  async destroy(): Promise<void> {}
}

// ---------------------------------------------------------------------------
// expo-audio implementation
// ---------------------------------------------------------------------------

/** Metering poll interval (ms). expo-audio's `getStatus()` returns a `metering` field when
 *  `isMeteringEnabled` is set — we poll it at this rate to feed the waveform. */
const METERING_INTERVAL_MS = 100;

/**
 * Concrete `AudioRecordService` backed by `expo-audio` (the successor to the deprecated `expo-av`).
 *
 * Usage in the host app:
 * ```ts
 * import { ExpoAudioRecordService } from '@radarbase/app-kit';
 *
 * <CoreServicesProvider overrides={{ audioRecord: new ExpoAudioRecordService() }}>
 * ```
 *
 * Requires `expo-audio` (>= 0.3.0) to be installed in the host.
 */
export interface AudioRecordConfig {
  /** Sample rate in Hz. Defaults to 44100. */
  sampleRate?: number;
  /** Bit rate in bps. Defaults to 128000. */
  bitRate?: number;
  /** Audio encoder on Android (e.g. 'aac', 'amr_nb'). Defaults to 'aac'. */
  audioEncoder?: string;
}

export class ExpoAudioRecordService implements AudioRecordService {
  // Lazily resolved `expo-audio` module — lets this file be imported even when
  // expo-audio isn't installed (the import only runs when a method is called).
  // Typed as `any` to avoid a compile-time dependency on expo-audio.
  private mod: any = null;
  private recorder: any = null; // AudioRecorder
  private player: any = null; // AudioPlayer
  private meteringTimer: ReturnType<typeof setInterval> | null = null;
  private readonly config: AudioRecordConfig;

  constructor(config?: AudioRecordConfig) {
    this.config = {
      sampleRate: 16000,
      bitRate: 16384,
      audioEncoder: 'aac',
      ...config,
    };
  }

  private getModule() {
    if (!this.mod) {
      // Dynamic require hidden from Metro's static analysis so the bundle doesn't
      // fail when expo-audio isn't installed. The host app must install expo-audio
      // before instantiating ExpoAudioRecordService.
      const name = 'expo-' + 'audio';
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      this.mod = require(name);
    }
    return this.mod;
  }

  async requestPermission(): Promise<boolean> {
    const { requestRecordingPermissionsAsync } = this.getModule();
    const status = await requestRecordingPermissionsAsync();
    return status.granted;
  }

  async startRecording(onLevel?: (level: number) => void): Promise<void> {
    const { AudioModule, RecordingPresets, setAudioModeAsync } = this.getModule();

    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });

    const preset = RecordingPresets.HIGH_QUALITY;
    const options = {
      ...preset,
      isMeteringEnabled: true,
      ...(this.config.sampleRate != null && { sampleRate: this.config.sampleRate }),
      ...(this.config.bitRate != null && { bitRate: this.config.bitRate }),
      ...(this.config.audioEncoder != null && {
        android: { ...preset.android, audioEncoder: this.config.audioEncoder },
      }),
    };
    this.recorder = new AudioModule.AudioRecorder(options);
    await this.recorder.prepareToRecordAsync();
    this.recorder.record();

    // Poll metering — expo-audio exposes it on getStatus().metering (dBFS, roughly -160..0).
    if (onLevel) {
      this.meteringTimer = setInterval(() => {
        try {
          const status = this.recorder?.getStatus?.();
          if (status?.isRecording && status.metering != null) {
            // Map -60..0 dBFS → 0..1 which gives a usable dynamic range for the waveform.
            const normalized = Math.max(0, Math.min(1, (status.metering + 60) / 60));
            onLevel(normalized);
          }
        } catch { /* recorder may have been stopped between ticks */ }
      }, METERING_INTERVAL_MS);
    }
  }

  async stopRecording(): Promise<AudioRecordingResult> {
    if (!this.recorder) throw new Error('No active recording');

    this.clearMeteringTimer();

    const durationMs = (this.recorder.currentTime ?? 0) * 1000;
    await this.recorder.stop();

    const fileUri: string = this.recorder.uri ?? '';
    this.recorder = null;

    const { setAudioModeAsync } = this.getModule();
    await setAudioModeAsync({ allowsRecording: false });

    const base64Data = fileUri ? await readFileAsBase64(fileUri) : '';

    return {
      base64Data,
      mimeType: 'audio/m4a',
      durationMs: Math.round(durationMs),
      fileUri,
    };
  }

  async playAudio(fileUri: string, onComplete?: () => void): Promise<void> {
    await this.stopPlayback();

    const { createAudioPlayer, setAudioModeAsync } = this.getModule();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });

    // createAudioPlayer accepts a string URI or an AudioSource object.
    this.player = createAudioPlayer(fileUri);
    if (onComplete) {
      this.player.addListener('playbackStatusUpdate', (status: any) => {
        if (status.didJustFinish) {
          onComplete();
        }
      });
    }
    this.player.play();
  }

  async stopPlayback(): Promise<void> {
    if (this.player) {
      try { this.player.remove(); } catch { /* already cleaned up */ }
      this.player = null;
    }
  }

  async destroy(): Promise<void> {
    this.clearMeteringTimer();
    if (this.recorder) {
      try { await this.recorder.stop(); } catch { /* best effort */ }
      this.recorder = null;
    }
    await this.stopPlayback();
  }

  private clearMeteringTimer() {
    if (this.meteringTimer != null) {
      clearInterval(this.meteringTimer);
      this.meteringTimer = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read a local file URI as a base64 string using fetch + FileReader (no extra deps). */
async function readFileAsBase64(uri: string): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      // Strip the "data:...;base64," prefix
      const commaIndex = dataUrl.indexOf(',');
      resolve(commaIndex >= 0 ? dataUrl.substring(commaIndex + 1) : dataUrl);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates an `ExpoAudioRecordService` when `expo-audio` is installed, otherwise
 * falls back to the no-op `DefaultAudioRecordService`.
 */
export function audioRecordServiceFactory(deps?: { logger?: LoggerService }): AudioRecordService {
  try {
    const name = 'expo-' + 'audio';
    require(name);
    return new ExpoAudioRecordService();
  } catch {
    return new DefaultAudioRecordService(deps?.logger);
  }
}
