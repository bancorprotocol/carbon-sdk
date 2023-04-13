import { Decimal } from '../src/utils/numerics';

export const isAlmostEqual = (
  actualStr: string,
  expectedStr: string,
  maxAbsErr: string,
  maxRelErr: string
): [boolean, string] => {
  if (actualStr !== expectedStr) {
    const [actual, expected] = [actualStr, expectedStr].map(
      (arg) => new Decimal(arg)
    );
    const absErr = actual.sub(expected).abs();
    const relErr = absErr.div(expected);
    if (absErr.gt(maxAbsErr) && relErr.gt(maxRelErr)) {
      return [
        false,
        `\n- expected value = ${expected}` +
          `\n- actual   value = ${actual}` +
          `\n- absolute error = ${absErr}` +
          `\n- relative error = ${relErr}`,
      ];
    }
  }
  return [true, ''];
};
