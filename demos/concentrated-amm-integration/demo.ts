/**
 * Carbon SDK - UniswapV3 Integration Demo
 *
 * This demo shows how Carbon strategies can be used with Services that expect UniswapV3 format
 * by leveraging the Carbon-to-UniswapV3 adapter.
 */

import { ethers } from 'ethers';
import { Contracts } from '@bancor/carbon-sdk/contracts-api';
import { castToUniV3, UniV3CastStrategy } from '@bancor/carbon-sdk/adapters';
import { EncodedStrategy } from '@bancor/carbon-sdk';
import { decodeStrategy } from '@bancor/carbon-sdk/strategy-management';

// Mock typical types to demonstrate integration
enum AMMAlgorithm {
  UniswapV3 = 'UniswapV3',
  // Other AMMs would be listed here
}

// RPC provider URL including API key
const PROVIDER_URL =
  'https://eth-mainnet.g.alchemy.com/v2/oBk4KxWELF9-8Grh_bEds_Y6T2OVMoYL';

const REASON_TRADE = 1; // Event reason for trade

/**
 * Main function to demonstrate integration with Carbon
 */
async function demonstrateCarbonIntegration() {
  console.log('Starting Carbon integration demo...');

  // Initialize provider with proper error handling
  const provider = new ethers.providers.StaticJsonRpcProvider(PROVIDER_URL);

  // Initialize Carbon contracts
  const contracts = new Contracts(provider, {
    carbonControllerAddress: '0xC537e898CD774e2dCBa3B14Ea6f34C93d5eA45e1',
    voucherAddress: '0x3660F04B79751e31128f6378eAC70807e38f554E',
    carbonBatcherAddress: '0x0199f3A6C4B192B9f9C3eBE31FBC535CdD4B7D4e',
    multiCallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
  });

  // const reader = new Reader(contracts);

  // Start syncing data (in a real implementation)
  console.log('Initializing Carbon data sync...');

  // Get current block for demo purposes
  const currentBlock = await provider.getBlockNumber();
  const fromBlock = currentBlock - 1000; // Look back 1000 blocks for demo

  console.log(
    `Querying for StrategyUpdated events from block ${fromBlock} to ${currentBlock}`
  );

  // Create filter for StrategyUpdated events with reason REASON_TRADE
  const filter = contracts.carbonController.filters.StrategyUpdated(
    null, // id
    null, // token0
    null, // token1
    null, // order0
    null, // order1
    null // reason - using null instead of REASON_TRADE to match expected parameter type
  );

  // Query for events
  const logs = await contracts.carbonController.queryFilter(
    filter,
    fromBlock,
    currentBlock
  );

  console.log(`Found ${logs.length} StrategyUpdated events`);

  const tradeLogs = logs.filter((log) => log.args?.reason === REASON_TRADE);

  console.log(`Found ${tradeLogs.length} trade events`);

  // Process each event
  for (const log of tradeLogs) {
    const eventArgs = log.args;
    if (!eventArgs) continue;

    const strategyId = eventArgs.id;
    const token0 = eventArgs.token0;
    const token1 = eventArgs.token1;
    const order0 = eventArgs.order0;
    const order1 = eventArgs.order1;

    // Construct the encoded strategy from event data
    const carbonStrategy: EncodedStrategy = {
      id: strategyId,
      token0,
      token1,
      order0: {
        y: order0.y,
        z: order0.z,
        A: order0.A,
        B: order0.B,
      },
      order1: {
        y: order1.y,
        z: order1.z,
        A: order1.A,
        B: order1.B,
      },
    };

    console.log(`Processing Carbon strategy ID: ${strategyId.toString()}`);
    console.log("here's a breakdown of the strategy:", {
      token0: token0,
      token1: token1,
      order0: {
        y: order0.y.toString(),
        z: order0.z.toString(),
        A: order0.A.toString(),
        B: order0.B.toString(),
      },
      order1: {
        y: order1.y.toString(),
        z: order1.z.toString(),
        A: order1.A.toString(),
        B: order1.B.toString(),
      },
    });

    // Just for educational purposes, let's decode the strategy
    const decodedStrategy = decodeStrategy(carbonStrategy);
    console.log("here's a breakdown of the decoded strategy:", {
      token0: decodedStrategy.token0,
      token1: decodedStrategy.token1,
      order0: decodedStrategy.order0,
      order1: decodedStrategy.order1,
    });

    // Convert Carbon strategy to UniswapV3 format using the adapter
    const uniV3Strategy = castToUniV3(carbonStrategy);
    console.log(`here's a breakdown of the uniV3 strategy:`, uniV3Strategy);

    // Demonstrate how an integrator could consume this data
    demonstrateIntegratorConsumption(uniV3Strategy);
  }
}

/**
 * Demonstrates how an integrator could consume the converted Carbon strategy
 */
function demonstrateIntegratorConsumption(uniV3Strategy: UniV3CastStrategy) {
  console.log('Integrator consumption of converted Carbon strategy:');

  // Extract data that integrator would use
  const { pool, sellOrder, buyOrder } = uniV3Strategy;

  // Mock integrator data structures based on the provided code
  const integratorData = {
    // Pool information
    pool: {
      token0: pool.xAxisToken,
      token1: pool.yAxisToken,
      tickSpacing: pool.tickSpacing,
    },

    // Position information (combining both orders for demonstration)
    positions: [
      {
        // Sell order position
        tickLower: sellOrder.tickLower,
        tickUpper: sellOrder.tickUpper,
        liquidity: sellOrder.liquidity,
        sqrtPriceX96: sellOrder.sqrtPriceX96,
      },
      {
        // Buy order position
        tickLower: buyOrder.tickLower,
        tickUpper: buyOrder.tickUpper,
        liquidity: buyOrder.liquidity,
        sqrtPriceX96: buyOrder.sqrtPriceX96,
      },
    ],

    // Global state information (using sell order for demonstration)
    globalState: {
      sqrtPriceX96: sellOrder.sqrtPriceX96,
    },
  };

  // Demonstrate mapping to integrator's expected format
  console.log('Mapped to integrator format:');
  console.log(`Pool: ${pool.yAxisToken} / ${pool.xAxisToken}`);
  console.log(`Tick Spacing: ${pool.tickSpacing}`);

  // Show how integrator would access position data using their constants
  console.log('\nAccessing data using integrators constants:');

  // For UniswapV3 algorithm
  const algorithm = AMMAlgorithm.UniswapV3;

  // Token addresses
  console.log(`Token0 (${Token0[algorithm]}): ${integratorData.pool.token0}`);
  console.log(`Token1 (${Token1[algorithm]}): ${integratorData.pool.token1}`);

  // Position data
  console.log('\nPosition data:');
  integratorData.positions.forEach((position, index) => {
    console.log(`Position ${index + 1}:`);
    console.log(
      `- ${DecodePositionsTickLower[algorithm]}: ${position.tickLower}`
    );
    console.log(
      `- ${DecodePositionsTickUpper[algorithm]}: ${position.tickUpper}`
    );
    console.log(
      `- ${DecodePositionsLiquidity[algorithm]}: ${position.liquidity}`
    );
  });

  // Price data
  console.log('\nPrice data:');
  console.log(
    `- ${SqrtPrice[algorithm]}: ${integratorData.globalState.sqrtPriceX96}`
  );

  console.log(
    "\nThis data can now be consumed by integrator's systems that expect UniswapV3 format"
  );
}

// Mock in constants based on the provided code
const Token0: { [key in AMMAlgorithm]: string } = {
  [AMMAlgorithm.UniswapV3]: 'token0',
};

const Token1: { [key in AMMAlgorithm]: string } = {
  [AMMAlgorithm.UniswapV3]: 'token1',
};

const SqrtPrice: { [key in AMMAlgorithm]: string } = {
  [AMMAlgorithm.UniswapV3]: 'sqrtPriceX96',
};

const DecodePositionsLiquidity: { [key in AMMAlgorithm]: string | number } = {
  [AMMAlgorithm.UniswapV3]: 'liquidity',
};

const DecodePositionsTickLower: { [key in AMMAlgorithm]: string | number } = {
  [AMMAlgorithm.UniswapV3]: 'tickLower',
};

const DecodePositionsTickUpper: { [key in AMMAlgorithm]: string | number } = {
  [AMMAlgorithm.UniswapV3]: 'tickUpper',
};

// Run the demo
demonstrateCarbonIntegration().catch((error) => {
  console.error('Error in Carbon integration demo:', error);
});
