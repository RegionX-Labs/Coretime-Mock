import { ApiPromise, WsProvider, Keyring } from "@polkadot/api";
import { u8aToHex } from "@polkadot/util";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import { purchaseRegion, log, normalizePath } from "./common";
import { Abi, ContractPromise } from "@polkadot/api-contract";
import { program } from "commander";
import fs from "fs";
import * as consts from "./consts";
import { Region, RegionId } from "./types";
import process from "process";

program.option("--fullNetwork").option("--contracts <string>");

program.parse(process.argv);

const CORETIME_CHAIN_PARA_ID = 1005;
const CONTRACTS_CHAIN_PARA_ID = 2000;

const ROCOCO_ENDPOINT = "ws://127.0.0.1:9900";
const CORETIME_ENDPOINT = "ws://127.0.0.1:9910";
const CONTRACTS_ENDPOINT = "ws://127.0.0.1:9920";

const keyring = new Keyring({ type: "sr25519" });

async function init() {
  const rococoWsProvider = new WsProvider(ROCOCO_ENDPOINT);
  const coretimeWsProvider = new WsProvider(CORETIME_ENDPOINT);

  const coretimeApi = await ApiPromise.create({ provider: coretimeWsProvider });
  const rococoApi = await ApiPromise.create({ provider: rococoWsProvider });

  await cryptoWaitReady();

  if (program.opts().fullNetwork) {
    await openHrmpChannel(rococoApi, CORETIME_CHAIN_PARA_ID, CONTRACTS_CHAIN_PARA_ID);

    const contractsProvider = new WsProvider(CONTRACTS_ENDPOINT);
    const contractsApi = await ApiPromise.create({ provider: contractsProvider });

    await deployXcRegionsCode(contractsApi);
  }

  await configureBroker(rococoApi, coretimeApi);
  await startSales(rococoApi, coretimeApi);

  const alice = keyring.addFromUri("//Alice");
  await setBalance(rococoApi, coretimeApi, alice.address, 1000 * consts.UNIT);

  // Takes some time to get everything ready before being able to perform a purchase.
  await sleep(60000);
  await purchaseRegion(coretimeApi, alice);
}

init().then(() => process.exit(0));

async function configureBroker(rococoApi: ApiPromise, coretimeApi: ApiPromise): Promise<void> {
  log(`Setting the initial configuration for the broker pallet`);

  const configCall = u8aToHex(coretimeApi.tx.broker.configure(consts.CONFIG).method.toU8a());
  return forceSendXcmCall(rococoApi, CORETIME_CHAIN_PARA_ID, configCall);
}

async function startSales(rococoApi: ApiPromise, coretimeApi: ApiPromise): Promise<void> {
  log(`Starting the bulk sale`);

  const startSaleCall = u8aToHex(
    coretimeApi.tx.broker.startSales(consts.INITIAL_PRICE, consts.CORE_COUNT).method.toU8a()
  );
  return forceSendXcmCall(rococoApi, CORETIME_CHAIN_PARA_ID, startSaleCall);
}

async function setBalance(rococoApi: ApiPromise, coretimeApi: ApiPromise, who: string, balance: number) {
  log(`Setting balance of ${who} to ${balance}`);

  const setBalanceCall = u8aToHex(coretimeApi.tx.balances.forceSetBalance(who, balance).method.toU8a());
  return forceSendXcmCall(rococoApi, CORETIME_CHAIN_PARA_ID, setBalanceCall);
}

async function openHrmpChannel(rococoApi: ApiPromise, sender: number, recipient: number): Promise<void> {
  log(`Openeing HRMP channel between ${sender} - ${recipient}`);

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

async function deployXcRegionsCode(contractsApi: ApiPromise): Promise<void> {
  log(`Uploading xcRegions contract code`);
  const alice = keyring.addFromUri("//Alice");

  const contractsPath = normalizePath(program.opts().contracts);

  const value = 0;
  const storageDepositLimit = null;
  const wasm = getXcRegionsWasm(contractsPath);
  const metadata = getXcRegionsMetadata(contractsApi, contractsPath);

  const instantiate = contractsApi.tx.contracts.instantiateWithCode(
    value,
    getMaxGasLimit(),
    storageDepositLimit,
    u8aToHex(wasm),
    metadata.findConstructor(0).toU8a([]),
    null
  );

  const callTx = async (resolve: () => void) => {
    const unsub = await instantiate.signAndSend(alice, (result: any) => {
      if (result.status.isInBlock) {
        unsub();
        resolve();
      }
    });
  };

  return new Promise(callTx);
}

// Create a mock collection that will represent regions.
async function createRegionCollection(contractsApi: ApiPromise) {
  // TODO
}

async function mintRegion(contractsApi: ApiPromise, regionId: RegionId) {
  // TODO
}

async function initXcRegion(contractsApi: ApiPromise, address: string, region: Region) {
  log(`Initializing the metadata for a xc-region`);

  const contractsPath = normalizePath(program.opts().contracts);

  const metadata = getXcRegionsMetadata(contractsApi, contractsPath);
  const xcRegionsContract = new ContractPromise(contractsApi, metadata, address);

  // Init the metadata:
  // TODO
}

async function forceSendXcmCall(api: ApiPromise, destParaId: number, encodedCall: string): Promise<void> {
  const xcmCall = api.tx.xcmPallet.send(parachainMultiLocation(destParaId), {
    V3: [
      {
        UnpaidExecution: {
          check_origin: null,
          weight_limit: "Unlimited",
        },
      },
      {
        Transact: {
          originKind: "Superuser",
          requireWeightAtMost: getMaxGasLimit(),
          call: {
            encoded: encodedCall,
          },
        },
      },
    ],
  });

  const sudoCall = api.tx.sudo.sudo(xcmCall);

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

function parachainMultiLocation(paraId: number): any {
  return {
    V3: {
      parents: 0,
      interior: {
        X1: {
          Parachain: paraId,
        },
      },
    },
  };
}

const getMaxGasLimit = () => {
  return {
    refTime: 5000000000,
    proofSize: 900000,
  };
};

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

const getXcRegionsMetadata = (contractsApi: ApiPromise, contractsPath: string) =>
  new Abi(
    fs.readFileSync(`${contractsPath}/xc_regions/xc_regions.json`, "utf-8"),
    contractsApi.registry.getChainProperties()
  );

const getXcRegionsWasm = (contractsPath: string) => fs.readFileSync(`${contractsPath}/xc_regions/xc_regions.wasm`);
