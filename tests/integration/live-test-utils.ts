import { JsonRpcProvider } from 'ethers';

export const LIVE_TEST_TIMEOUT_MS = 60_000;
export const LIVE_POLLING_INTERVAL_MS = 1_000;
export const LIVE_POLLING_REFRESH_TIMEOUT_MS = 30_000;
export const LIVE_CHAIN_SYNC_WAIT_MS = 250;
export const LIVE_CHAIN_SYNC_BATCH_SIZE = 10;
export const LIVE_CHAIN_SYNC_CHUNK_SIZE = 250;
const DEFAULT_NON_EMPTY_PAIR_SCAN_LIMIT = 5;

export function requireEnvOrSkip(
  context: Mocha.Context,
  envVarName: string
): string {
  context.timeout(LIVE_TEST_TIMEOUT_MS);

  const value = process.env[envVarName]?.trim();
  if (!value) {
    console.warn(
      `Skipping live integration suite because ${envVarName} is not set.`
    );
    context.skip();
  }

  return value as string;
}

export function createTenderlyProvider(rpcUrl: string): JsonRpcProvider {
  return new JsonRpcProvider(rpcUrl);
}

export async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  timeoutMs: number,
  intervalMs: number = 250
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await condition()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timed out waiting for condition after ${timeoutMs}ms`);
}

export async function findPairWithStrategies(
  pairs: [string, string][],
  readStrategiesByPair: (
    token0: string,
    token1: string
  ) => Promise<unknown[]>,
  maxPairsToScan: number = DEFAULT_NON_EMPTY_PAIR_SCAN_LIMIT
): Promise<{ pair: [string, string]; strategies: unknown[] } | undefined> {
  for (const pair of pairs.slice(0, maxPairsToScan)) {
    const strategies = await readStrategiesByPair(pair[0], pair[1]);
    if (strategies.length > 0) {
      return { pair, strategies };
    }
  }

  return undefined;
}
