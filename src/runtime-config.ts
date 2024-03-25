/**
 * This module provides a way to read runtime configuration passed by means of global object.
 * This is useful in case the configuration is not available at compile time, such as log verbosity.
 */

const globalObject = (() => {
  try {
    return self;
  } catch (e) {
    try {
      return window;
    } catch (e) {
      return global;
    }
  }
})();

export type RuntimeConfig = {
  logVerbosityLevel: number;
  legacyTradeBySourceRange: boolean;
};

function getVerbosityLevel(): number {
  if (globalObject !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return Number((globalObject as any).CARBON_DEFI_SDK_VERBOSITY) || 0;
  }

  return 0;
}

function getLegacyTradeBySourceRange(): boolean {
  if (globalObject !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return Boolean((globalObject as any).LEGACY_TRADE_BY_SOURCE_RANGE);
  }

  return false;
}

export function getRuntimeConfig(): RuntimeConfig {
  const logVerbosityLevel = getVerbosityLevel();
  const legacyTradeBySourceRange = getLegacyTradeBySourceRange();
  return {
    logVerbosityLevel,
    legacyTradeBySourceRange,
  };
}
