# Carbon SDK

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)
![Tests Status](https://github.com/bancorprotocol/carbon-sdk/actions/workflows/test.yml/badge.svg?branch=main)

## Disclaimer

This SDK is in beta. We cannot be held responsible for any losses caused by use of the SDK.

## Overview

The SDK is a READ-ONLY tool, intended to facilitate working with Carbon contracts. It's a convenient wrapper around the Carbon matching algorithm and Carbon contracts, allowing programs and users get a ready to use transaction data that will allow them to manage strategies and fulfill trades

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
  const { cache, startDataSync } = initSyncedCache(api.reader, cachedData);
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

## Authors

- [@zavelevsky](https://www.github.com/zavelevsky)

## Contributing

Pull requests are welcome!

For major changes, please open an issue first
to discuss what you would like to change.

Please make sure to update tests as appropriate.

## License

[MIT](https://choosealicense.com/licenses/mit/)
