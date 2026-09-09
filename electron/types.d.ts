declare global {
  interface Window {
    electronLlama?: typeof import("../electron/preload/llama").llamaBridge;
  }
}
