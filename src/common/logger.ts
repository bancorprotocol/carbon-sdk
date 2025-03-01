import { BigNumber } from '../utils/numerics';
import { getRuntimeConfig } from '../runtime-config';

const verbosity = getRuntimeConfig().logVerbosityLevel;

function isVerbose(): boolean {
  return verbosity >= 1;
}

function shouldConvertBigNumbersToStrings(): boolean {
  return verbosity >= 2;
}

const originalLog = console.log;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public error(...args: any[]) {
    console.error(this._prefix, ...args);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public log(...args: any[]) {
    console.log(this._prefix, ...args);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public debug(...args: any[]) {
    if (isVerbose()) console.debug(this._prefix, ...args);
  }
}
