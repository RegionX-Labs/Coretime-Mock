import { Keyring } from "@polkadot/api";

export const keyring = new Keyring({ type: "sr25519" });

export function log(message: string) {
  // Green log.
  console.log("\x1b[32m%s\x1b[0m", message);
}

export function normalizePath(path: string) {
  if (path.endsWith("/") && path.length > 1) {
    return path.slice(0, -1);
  }
  return path;
}
