import { getRuntimeConfig } from '../runtime-config';

const verbosity = getRuntimeConfig().logVerbosityLevel;

function isVerbose(): boolean {
  return verbosity >= 1;
}

function shouldConvertBigIntsToStrings(): boolean {
  return verbosity >= 2;
}

const originalLog = console.log;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertBigIntsToStrings(obj: any): any {
  if (obj === undefined || obj === null) return obj;
  if (typeof obj === 'bigint') {
    return obj.toString();
  }
  if (Array.isArray(obj)) {
    return obj.map(convertBigIntsToStrings);
  }
  if (typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [
        key,
        convertBigIntsToStrings(value),
      ])
    );
  }
  return obj;
}

if (shouldConvertBigIntsToStrings()) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  console.debug = (...args: any[]) => {
    const convertedArgs = args.map(convertBigIntsToStrings);
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
