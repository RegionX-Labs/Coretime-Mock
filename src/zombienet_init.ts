import { ApiPromise, WsProvider, Keyring } from "@polkadot/api";
import { KeyringPair } from "@polkadot/keyring/types";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import { Timeslice } from "./types";
import * as consts from "./consts";
import process from 'process';

const FULL_NETWORK = "fullNetwork";

const CORETIME_CHAIN_PARA_ID = 1005;
const CONTRACTS_CHAIN_PARA_ID = 2000;

const keyring = new Keyring({ type: "sr25519" });

async function init() {
  const rococoWsProvider = new WsProvider("ws://127.0.0.1:9900");
  const coretimeWsProvider = new WsProvider("ws://127.0.0.1:9910");

  const coretimeApi = await ApiPromise.create({ provider: coretimeWsProvider });
  const rococoApi = await ApiPromise.create({ provider: rococoWsProvider });

  await cryptoWaitReady();

  if(featureFlag("fullNetwork")) {
    await openHrmpChannel(rococoApi, CORETIME_CHAIN_PARA_ID, CONTRACTS_CHAIN_PARA_ID);
  }

  //await startBulkSale(rococoApi, coretimeApi);
}

init().then(() => process.exit(0));

async function openHrmpChannel(rococoApi: ApiPromise, sender: number, recipient: number): Promise<void> {
    console.log(`Openeing HRMP channel between ${sender} - ${recipient}`);

    const newHrmpChannel = [
      sender,
      recipient,
      8, // Max capacity
      512, // Max message size
    ];

    const alice = keyring.addFromUri("//Alice");

    const callTx = async (resolve: () => void) => {
        const openHrmp = rococoApi.tx.hrmp.forceOpenHrmpChannel(...newHrmpChannel);
        const sudoCall = rococoApi.tx.sudo.sudo(openHrmp);
        const unsub = await sudoCall.signAndSend(alice, (result: any) => {
        if (result.status.isInBlock) {
            unsub();
            resolve();
        }
        });
    };

  return new Promise(callTx);
}

function featureFlag(flagName: string): boolean {
  return process.argv.includes(`--${flagName}`);
}
