/**
 * This module provides a way to read runtime configuration passed by means of global object.
 * This is useful in case the configuration is not available at compile time, such as log verbosity.
 */

const globalObject = (() => {
  try {
    return self;
  } catch {
    try {
      return window;
    } catch {
      return global;
    }
  }
})();

export type RuntimeConfig = {
  logVerbosityLevel: number;
};

function getVerbosityLevel(): number {
  if (globalObject !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return Number((globalObject as any).CARBON_DEFI_SDK_VERBOSITY) || 0;
  }

  return 0;
}

export function getRuntimeConfig(): RuntimeConfig {
  const logVerbosityLevel = getVerbosityLevel();
  return {
    logVerbosityLevel,
  };
}
