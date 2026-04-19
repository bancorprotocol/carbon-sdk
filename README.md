# Carbon SDK

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)
![Tests Status](https://github.com/bancorprotocol/carbon-sdk/actions/workflows/test.yml/badge.svg?branch=main)

## Disclaimer

This SDK is in beta. We cannot be held responsible for any losses caused by use of the SDK.

## Overview

The SDK is a READ-ONLY tool, intended to facilitate working with Carbon contracts. It's a convenient wrapper around the Carbon matching algorithm and Carbon contracts, allowing programs and users get a ready to use transaction data that will allow them to manage strategies and fulfill trades.

The SDK supports two strategy families:

- Standard Carbon strategies
- Gradient strategies

Gradient strategies are time-based moving limit orders. Each side of the strategy has:

- a start price
- an end price
- a budget
- a start time
- an end time
- a gradient type

Supported gradient types:

- `LinearIncrease`
- `LinearDecrease`
- `LinearInverseIncrease`
- `LinearInverseDecrease`
- `ExponentialIncrease`
- `ExponentialDecrease`

## Installation

Use npm or yarn to install carbon-sdk.

```bash
yarn add @bancor/carbon-sdk
```

## Usage

```js
import {
  PayableOverrides,
  TradeActionBNStr,
  TokenPair,
  MatchActionBNStr,
  StrategyUpdate,
  EncodedStrategyBNStr,
  GradientStrategyUpdate,
  GradientEncodedStrategyBNStr,
  GradientType,
} from '@bancor/carbon-sdk';
import { Toolkit } from '@bancor/carbon-sdk/strategy-management';
import { ChainCache, initSyncedCache } from '@bancor/carbon-sdk/chain-cache';
import {
  ContractsApi,
  ContractsConfig,
} from '@bancor/carbon-sdk/contracts-api';

let api: ContractsApi;
let sdkCache: ChainCache;
let carbonSDK: Toolkit;
let isInitialized = false;
let isInitializing = false;
const MAX_BLOCK_AGE = 2000; // past this many blocks, the SDK won't attempt to catch up by processing events and instead call the contracts for strategy info.

const init = async (
  rpcUrl: string,
  config: ContractsConfig,
  decimalsMap?: Map<string, number>,
  cachedData?: string
) => {
  if (isInitialized || isInitializing) return;
  isInitializing = true;
  const provider = new StaticJsonRpcProvider(
    { url: rpcUrl, skipFetchSetup: true },
    1
  );
  api = new ContractsApi(provider, config);
  const { cache, startDataSync } = initSyncedCache(api.reader, cachedData, MAX_BLOCK_AGE);
  sdkCache = cache;
  carbonSDK = new Toolkit(
    api,
    sdkCache,
    decimalsMap
      ? (address) => decimalsMap.get(address.toLowerCase())
      : undefined
  );
  sdkCache.on('onPairDataChanged', (affectedPairs) =>
    onPairDataChanged(affectedPairs)
  );
  sdkCache.on('onPairAddedToCache', (affectedPairs) =>
    onPairAddedToCache(affectedPairs)
  );
  await startDataSync();
  isInitialized = true;
  isInitializing = false;
};
```

## Gradient Contracts

Gradient support is optional per chain.

If `gradientControllerAddress` and `gradientVoucherAddress` are provided in `ContractsConfig`, the SDK will:

- read and cache gradient strategies
- process gradient strategy events in `ChainSync`
- expose gradient strategy management methods

If these addresses are omitted, the SDK will not issue calls to gradient contracts. This is useful for chains where gradient contracts have not been deployed yet.

Example:

```ts
const config: ContractsConfig = {
  carbonControllerAddress: '0x...',
  multiCallAddress: '0x...',
  voucherAddress: '0x...',
  carbonBatcherAddress: '0x...',
  gradientControllerAddress: '0x...',
  gradientVoucherAddress: '0x...',
};
```

## Strategy Types

### Standard Strategies

The existing standard strategy flow is unchanged. Main helpers include:

- `createBuySellStrategy`
- `updateStrategy`
- `deleteStrategy`
- `getStrategyById`
- `getStrategiesByPair`
- `getUserStrategies`

### Gradient Strategies

Gradient strategies are exposed in parallel to the standard strategy flow.

Main helpers include:

- `createBuySellGradientStrategy`
- `updateGradientStrategy`
- `deleteGradientStrategy`
- `getGradientStrategyById`
- `getGradientStrategiesByPair`
- `getUserGradientStrategies`

Example:

```ts
const tx = await carbonSDK.createBuySellGradientStrategy(
  baseToken,
  quoteToken,
  '1800', // buyPriceStart
  '1500', // buyPriceEnd
  '1000', // buyBudget
  GradientType.LinearDecrease,
  1710000000, // buyStartTime
  1712592000, // buyEndTime
  '2200', // sellPriceStart
  '2600', // sellPriceEnd
  '1', // sellBudget
  GradientType.ExponentialIncrease,
  1710000000, // sellStartTime
  1712592000 // sellEndTime
);
```

## Encoding Helpers

The shared encoder module supports both strategy types.

Standard helpers:

- `encodeOrder`
- `decodeOrder`
- `encodeStrategy`
- `decodeStrategy`

Gradient helpers:

- `encodeGradientOrder`
- `decodeGradientOrder`
- `encodeGradientStrategy`
- `decodeGradientStrategy`

These live in `@bancor/carbon-sdk/utils`.

## Chain Cache

`ChainCache` and `ChainSync` support both standard and gradient strategies.

The synced cache:

- caches standard strategies by pair and id
- caches gradient strategies by pair and id
- keeps standard trade orders for the existing matcher flow
- processes both standard and gradient strategy create/update/delete events

Gradient cache lookups are available through the toolkit methods listed above.

## Notes

### 1. The SDK Logger supports 3 verbosity levels:

- `0` (default) only prints errors and important logs.
- `1` (debug) prints highly verbose logs.
- `2` (debug readable) is same as `1` but also converts any bigint to an easy to read string (impacting performance).

To use it in Node, set the environment variable `CARBON_DEFI_SDK_VERBOSITY` to the desired level.
To use it from a browser app do, before importing the SDK:

```js
window.CARBON_DEFI_SDK_VERBOSITY = 2;
```

## Authors

- [@zavelevsky](https://www.github.com/zavelevsky)

## Contributing

Pull requests are welcome!

For major changes, please open an issue first
to discuss what you would like to change.

Please make sure to update tests as appropriate.

## License

[MIT](https://choosealicense.com/licenses/mit/)
