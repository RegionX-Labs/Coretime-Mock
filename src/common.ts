import { ApiPromise } from "@polkadot/api";
import { KeyringPair } from "@polkadot/keyring/types";
import * as consts from "./consts";
import fs from "fs";

export async function purchaseRegion(
  coretimeApi: ApiPromise,
  buyer: KeyringPair,
): Promise<void> {
  log(`Purchasing a reigon.`);

  const callTx = async (resolve: () => void) => {
    const purchase = coretimeApi.tx.broker.purchase(consts.INITIAL_PRICE * 2);
    const unsub = await purchase.signAndSend(buyer, (result: any) => {
      if (result.status.isInBlock) {
        unsub();
        resolve();
      }
    });
  };

  return new Promise(callTx);
}

export function log(message: string) {
  // Green log.
  console.log("\x1b[42m%s\x1b[0m", message);
}

export function loadFileAsBytes(filePath: string) {
  try {
      const data = fs.readFileSync(filePath);
      return new Uint8Array(data);
  } catch (error) {
      console.error(error);
      throw error;
  }
}

export function normalizePath(path: string) {
  if (path.endsWith('/') && path.length > 1) {
    return path.slice(0, -1);
  }
  return path;
}
