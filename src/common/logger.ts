import { BigNumber } from '../utils/numerics';

const verbose = true; //process.env.NODE_ENV !== 'production';

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

if (verbose) {
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

  public log(...args: any[]) {
    console.log(this._prefix, ...args);
  }

  public debug(...args: any[]) {
    verbose && console.debug(this._prefix, ...args);
  }
}
