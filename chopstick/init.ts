import { ApiPromise, WsProvider, Keyring } from '@polkadot/api';
import { KeyringPair } from "@polkadot/keyring/types";

const keyring = new Keyring({ type: "sr25519" });

type Timeslice = number;
type CoreIndex = number;
type CoreMask = string;

type Balance = number;

const UNIT = 10**12; // ROC has 12 decimals

const INITIAL_PRICE = 50 * UNIT;
const CORE_COUNT = 10;
const TIMESLICE_PERIOD = 2;

const FULL_MASK = "0xFFFFFFFFFFFFFFFFFFFF"; // hex encoded 80 bit bitmap.
const HALF_FULL_MASK = "0xFFFFFFFFFF0000000000"; // hex encoded 80 bit bitmap.

type RegionId = {
    begin: Timeslice,
    core: CoreIndex,
    mask: CoreMask,
};

type RegionRecord = {
    end: Timeslice,
    owner: string,
    paid: null | Balance,
};

type Region = {
    regionId: RegionId,
    regionRecord: RegionRecord,
};

const CONFIG = {
    advance_notice: 20,
    interlude_length: 10,
    leadin_length: 10,
    ideal_bulk_proportion: 0,
    limit_cores_offered: 50,
    region_length: 30,
    renewal_bump: 10,
    contribution_timeout: 5,
}

async function init() {
    const coretimeWsProvider = new WsProvider("ws://127.0.0.1:8000");
    const rococoWsProvider = new WsProvider("wss://rococo-rpc.polkadot.io/");

    const coretimeApi = await ApiPromise.create({provider: coretimeWsProvider});
    const rococoApi = await ApiPromise.create({provider: rococoWsProvider});

    startBulkSale(rococoApi, coretimeApi);
}

init();

async function startBulkSale(rococoApi: ApiPromise, coretimeApi: ApiPromise) {
    const latestRcBlock = (await rococoApi.rpc.chain.getHeader()).number.toNumber()
    await setStatus(coretimeApi, latestRcBlock);
    await createMockRegions(coretimeApi, currentTimeslice(latestRcBlock), 5);
}

async function setStatus(coretimeApi: ApiPromise, latestRcBlock: number) {
    const commitTimeslice = getLatestTimesliceReadyToCommit(latestRcBlock);

    console.log(commitTimeslice);

    const status = {
        core_count: CORE_COUNT,
        private_pool_size: 0,
        system_pool_size: 0,
        last_committed_timeslice: currentTimeslice(commitTimeslice) - 1,
        last_timeslice: currentTimeslice(latestRcBlock)
    };

    await coretimeApi.rpc('dev_setStorage', {
    broker: {
        status
    }
    })
    await coretimeApi.rpc('dev_newBlock');
} 

async function createMockRegions(coretimeApi: ApiPromise, currentTimeslice: Timeslice, regionCount: number) {
    let regions: Array<Region> = [];
    const owner = keyring.addFromUri("//Alice").address;

    for(let i = 0; i < regionCount; i++) {
        const mask = i % 2 == 0 ? FULL_MASK : HALF_FULL_MASK;
        const duration = 10;
        regions.push(mockRegion(currentTimeslice, i, mask, currentTimeslice + duration, owner));
    }

    await coretimeApi.rpc('dev_setStorage', {
    broker: {
        regions: regions.map((region) => [[region.regionId], region.regionRecord])
    }
    });
    await coretimeApi.rpc('dev_newBlock');
}

function mockRegion(begin: Timeslice, core: CoreIndex, mask: string, end: Timeslice, owner: string): Region {
    return {
        regionId: {
        begin,
        core,
        mask
    },
    regionRecord: {
        end,
        owner,
        paid: null
    }
}
}

function currentTimeslice(latestRcBlock: number) {
    return Math.floor(latestRcBlock / TIMESLICE_PERIOD);
}

function getLatestTimesliceReadyToCommit(latestRcBlock: number): Timeslice {
    let advanced = latestRcBlock + CONFIG.advance_notice;
    return advanced / TIMESLICE_PERIOD;
}
