import { ApiPromise, WsProvider, Keyring } from "@polkadot/api";
import { u8aToHex } from '@polkadot/util';
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

  if(featureFlag(FULL_NETWORK)) {
    await openHrmpChannel(rococoApi, CORETIME_CHAIN_PARA_ID, CONTRACTS_CHAIN_PARA_ID);
  }

  await configureBroker(rococoApi, coretimeApi);
}

init().then(() => process.exit(0));

async function configureBroker(rococoApi: ApiPromise, coretimeApi: ApiPromise): Promise<void> {
  console.log(`Setting the initial configuration for the broker pallet`);

  const configCall = u8aToHex(coretimeApi.tx.broker.configure(consts.CONFIG).method.toU8a());
  const xcmCall = rococoApi.tx.xcmPallet.send(CORETIME_CHAIN, {V3: [
    {
      UnpaidExecution: {
        check_origin: null,
        weight_limit: "Unlimited"
      }
    },
    {
      Transact: {
        originKind: "Superuser",
        requireWeightAtMost: {
          refTime: 1000000000,
          proofSize: 900000,
        },
        call: {
          encoded: configCall
        }
      }
    }
  ]});

  const sudoCall = rococoApi.tx.sudo.sudo(xcmCall);

  const alice = keyring.addFromUri("//Alice");

  const callTx = async (resolve: () => void) => {
      const unsub = await sudoCall.signAndSend(alice, (result: any) => {
      if (result.status.isInBlock) {
          unsub();
          resolve();
      }
      });
  };

  return new Promise(callTx);
}

async function openHrmpChannel(rococoApi: ApiPromise, sender: number, recipient: number): Promise<void> {
    console.log(`Openeing HRMP channel between ${sender} - ${recipient}`);

    const newHrmpChannel = [
      sender,
      recipient,
      8, // Max capacity
      512, // Max message size
    ];

    const alice = keyring.addFromUri("//Alice");

    const openHrmp = rococoApi.tx.hrmp.forceOpenHrmpChannel(...newHrmpChannel);
    const sudoCall = rococoApi.tx.sudo.sudo(openHrmp);

    const callTx = async (resolve: () => void) => {
        const unsub = await sudoCall.signAndSend(alice, (result: any) => {
        if (result.status.isInBlock) {
            unsub();
            resolve();
        }
        });
    };

  return new Promise(callTx);
}

const CORETIME_CHAIN = {
  V3: {
    parents: 0,
    interior: {
      X1: {
        Parachain: CORETIME_CHAIN_PARA_ID
      }
    }
  }
}

function featureFlag(flagName: string): boolean {
  return process.argv.includes(`--${flagName}`);
}
