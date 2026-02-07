// Polyfill for Baileys crypto requirement in Electron main process
import { webcrypto } from "crypto";

// Baileys expects globalThis.crypto to exist with subtle property
if (typeof globalThis.crypto === "undefined") {
  (globalThis as any).crypto = webcrypto;
}

export {};
