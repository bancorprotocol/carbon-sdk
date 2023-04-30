import { BigNumber } from '../utils/numerics';

declare global {
  interface Window {
    CARBON_DEFI_SDK_VERBOSITY?: number;
  }
}

function getVerbosityLevel(): number {
  if (typeof window !== 'undefined') {
    return Number(window.CARBON_DEFI_SDK_VERBOSITY) || 0;
  } else if (typeof process !== 'undefined' && process.env) {
    return Number(process.env.CARBON_DEFI_SDK_VERBOSITY) || 0;
  }
  return 0;
}

const verbose = getVerbosityLevel();

function isVerbose(): boolean {
  return verbose >= 1;
}

function shouldConvertBigNumbersToStrings(): boolean {
  return verbose >= 2;
}

const originalLog = console.log;

function convertBigNumbersToStrings(obj: any): any {
  if (obj instanceof BigNumber) {
    return obj.toString();
  }
  if (Array.isArray(obj)) {
    return obj.map(convertBigNumbersToStrings);
  }
  if (typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [
        key,
        convertBigNumbersToStrings(value),
      ])
    );
  }
  return obj;
}

if (shouldConvertBigNumbersToStrings()) {
  console.debug = (...args: any[]) => {
    const convertedArgs = args.map(convertBigNumbersToStrings);
    originalLog.apply(console, convertedArgs);
  };
}
export class Logger {
  private _prefix: string;
  public constructor(file: string) {
    this._prefix = `[SDK][${file}]:`;
  }

  public error(...args: any[]) {
    console.error(this._prefix, ...args);
  }

  public log(...args: any[]) {
    console.log(this._prefix, ...args);
  }

  public debug(...args: any[]) {
    isVerbose() && console.debug(this._prefix, ...args);
  }
}
