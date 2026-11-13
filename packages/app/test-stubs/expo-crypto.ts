// Exercise real hashes in Node/Chromium without booting Expo's native module registry.
export const CryptoDigestAlgorithm = { SHA256: "SHA-256" } as const;

export async function digestStringAsync(algorithm: string, text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(algorithm, new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const randomUUID = () => globalThis.crypto.randomUUID();
export const getRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
