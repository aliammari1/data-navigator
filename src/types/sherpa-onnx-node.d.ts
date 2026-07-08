declare module "sherpa-onnx-node" {
  export type WaveObject = {
    samples: Float32Array;
    sampleRate: number;
  };

  export type OfflineRecognizerStream = {
    acceptWaveform(input: WaveObject): void;
  };

  export type OfflineRecognizerResult = {
    text?: string;
    lang?: string;
  };

  export type OfflineRecognizer = {
    createStream(): OfflineRecognizerStream;
    decodeAsync(stream: unknown): Promise<OfflineRecognizerResult>;
    getResult(stream: unknown): OfflineRecognizerResult;
  };

  export const OfflineRecognizer: {
    createAsync(config: Record<string, unknown>): Promise<OfflineRecognizer>;
  };

  export type OfflineTtsResult = WaveObject;

  export type OfflineTts = {
    generateAsync(input: {
      text: string;
      sid?: number;
      speed?: number;
      generationConfig?: unknown;
    }): Promise<OfflineTtsResult>;
  };

  export const OfflineTts: {
    createAsync(config: Record<string, unknown>): Promise<OfflineTts>;
  };

  export const GenerationConfig: new (config: Record<string, unknown>) => unknown;

  export function writeWave(filename: string, wave: WaveObject): void;
}
