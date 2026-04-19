import { expect } from 'chai';
import { getEncodedCurrentRate } from '../src/trade-matcher/trade_gradient';
import {
  encodeScaleInitialRate,
  decodeScaleInitialRate,
  encodeFloatInitialRate,
  decodeFloatInitialRate,
  encodeScaleMultiFactor,
  decodeScaleMultiFactor,
  encodeFloatMultiFactor,
  decodeFloatMultiFactor,
} from '../src/utils/encoders';
import { Decimal, BnToDec, DecToBn } from '../src/utils/numerics';

const ONE = new Decimal(1);
const TWO = new Decimal(2);

const EXP_ONE = TWO.pow(127);
const EXP_MAX = EXP_ONE.mul(TWO.ln()).ceil().mul(129);

const getInitialRate = (x: Decimal) => decodeScaleInitialRate(BnToDec(decodeFloatInitialRate(encodeFloatInitialRate(encodeScaleInitialRate(x)))));
const getMultiFactor = (x: Decimal) => decodeScaleMultiFactor(BnToDec(decodeFloatMultiFactor(encodeFloatMultiFactor(encodeScaleMultiFactor(x)))));

function testConfiguration(
  paramName: string,
  preConfig: Decimal,
  postConfig: (x: Decimal) => (Decimal),
  maxAbsoluteError: string,
  maxRelativeError: string
) {
  it(`testConfiguration: ${paramName} = ${preConfig}`, async () => {
    const expected = preConfig;
    const actual = postConfig(preConfig);
    if (!actual.eq(expected)) {
      expect(actual.lt(expected)).to.be.equal(
        true,
        `\n- expected = ${expected.toFixed()}` +
        `\n- actual   = ${actual.toFixed()}`
      );
      const absoluteError = actual.sub(expected).abs();
      const relativeError = actual.div(expected).sub(1).abs();
      expect(absoluteError.lte(maxAbsoluteError) || relativeError.lte(maxRelativeError)).to.be.equal(
        true,
        `\n- expected      = ${expected.toFixed()}` +
        `\n- actual        = ${actual.toFixed()}` +
        `\n- absoluteError = ${absoluteError.toFixed()}` +
        `\n- relativeError = ${relativeError.toFixed()}`
      );
    }
  });
}

function expectedCurrentRate(
  gradientType: number,
  initialRate: Decimal,
  multiFactor: Decimal,
  timeElapsed: Decimal
) {
  switch (gradientType) {
    case 0: return initialRate.mul(ONE.add(multiFactor.mul(timeElapsed)));
    case 1: return initialRate.mul(ONE.sub(multiFactor.mul(timeElapsed)));
    case 2: return initialRate.div(ONE.sub(multiFactor.mul(timeElapsed)));
    case 3: return initialRate.div(ONE.add(multiFactor.mul(timeElapsed)));
    case 4: return initialRate.mul(multiFactor.mul(timeElapsed).exp());
    case 5: return initialRate.div(multiFactor.mul(timeElapsed).exp());
  }
  throw new Error(`Invalid gradientType ${gradientType}`);
}

function testCurrentRate(
  gradientType: number,
  initialRate: Decimal,
  multiFactor: Decimal,
  timeElapsed: Decimal,
  maxError: string
) {
  it(`testCurrentRate: gradientType,initialRate,multiFactor,timeElapsed = ${[gradientType, initialRate, multiFactor, timeElapsed]}`, async () => {
    const rEncoded = encodeFloatInitialRate(encodeScaleInitialRate(initialRate));
    const mEncoded = encodeFloatMultiFactor(encodeScaleMultiFactor(multiFactor));
    const rDecoded = decodeScaleInitialRate(BnToDec(decodeFloatInitialRate(rEncoded)));
    const mDecoded = decodeScaleMultiFactor(BnToDec(decodeFloatMultiFactor(mEncoded)));
    const expected = expectedCurrentRate(gradientType, rDecoded, mDecoded, timeElapsed);
    if (expected.isFinite() && expected.isPositive()) {
      const retVal = getEncodedCurrentRate(gradientType, rEncoded, mEncoded, DecToBn(timeElapsed));
      const actual = BnToDec(retVal[0]).div(BnToDec(retVal[1]));
      if (!actual.eq(expected)) {
        const error = actual.div(expected).sub(1).abs();
        expect(error.lte(maxError)).to.be.equal(
          true,
          `\n- expected = ${expected.toFixed()}` +
          `\n- actual   = ${actual.toFixed()}` +
          `\n- error    = ${error.toFixed()}`
        );
      }
    } else {
      expect(() => {
        getEncodedCurrentRate(gradientType, rEncoded, mEncoded, DecToBn(timeElapsed));
      }).to.throw('InvalidRate');
    }
  });
}

describe('trade_gradient', () => {
  for (let a = 1; a <= 100; a++) {
    const initialRate = new Decimal(a).mul(1234.5678);
    testConfiguration('initialRate', initialRate, getInitialRate, '0', '0.00000000000002');
  }

  for (let b = 1; b <= 100; b++) {
    const multiFactor = new Decimal(b).mul(0.00001234);
    testConfiguration('multiFactor', multiFactor, getMultiFactor, '0', '0.0000002');
  }

  for (let a = -28; a <= 28; a++) {
    const initialRate = new Decimal(10).pow(a);
    testConfiguration('initialRate', initialRate, getInitialRate, '0.0000000000000005', '0.00000000000002');
  }

  for (let b = -14; b <= -1; b++) {
    const multiFactor = new Decimal(10).pow(b);
    testConfiguration('multiFactor', multiFactor, getMultiFactor, '0.000000000000004', '0.00000007');
  }

  for (let a = 1; a <= 10; a++) {
    for (let b = 1; b <= 10; b++) {
      for (let c = 1; c <= 10; c++) {
        const initialRate = new Decimal(a).mul(1234.5678);
        const multiFactor = new Decimal(b).mul(0.00001234);
        const timeElapsed = new Decimal(c).mul(3600);
        testCurrentRate(0, initialRate, multiFactor, timeElapsed, '0');
        testCurrentRate(1, initialRate, multiFactor, timeElapsed, '0');
        testCurrentRate(2, initialRate, multiFactor, timeElapsed, '0');
        testCurrentRate(3, initialRate, multiFactor, timeElapsed, '0');
        testCurrentRate(4, initialRate, multiFactor, timeElapsed, '0.00000000000000000000000000000000000002');
        testCurrentRate(5, initialRate, multiFactor, timeElapsed, '0.00000000000000000000000000000000000002');
      }
    }
  }

  for (let a = -27; a <= 27; a++) {
    for (let b = -14; b <= -1; b++) {
      for (let c = 1; c <= 10; c++) {
        const initialRate = new Decimal(10).pow(a);
        const multiFactor = new Decimal(10).pow(b);
        const timeElapsed = Decimal.min(
          TWO.pow(4).div(multiFactor).sub(1).ceil(),
          TWO.pow(25).sub(1)
        ).mul(c).div(10).ceil();
        testCurrentRate(0, initialRate, multiFactor, timeElapsed, '0');
        testCurrentRate(1, initialRate, multiFactor, timeElapsed, '0');
        testCurrentRate(2, initialRate, multiFactor, timeElapsed, '0');
        testCurrentRate(3, initialRate, multiFactor, timeElapsed, '0');
        testCurrentRate(4, initialRate, multiFactor, timeElapsed, '0.00000000000000000000000000000000000006');
        testCurrentRate(5, initialRate, multiFactor, timeElapsed, '0.00000000000000000000000000000000000006');
      }
    }
  }

  for (const a of [-27, -10, 0, 10, 27]) {
    for (const b of [-14, -9, -6, -1]) {
      for (const c of [1, 4, 7, 10]) {
        const initialRate = new Decimal(10).pow(a);
        const multiFactor = new Decimal(10).pow(b);
        const timeElapsed = Decimal.min(
          EXP_MAX.div(EXP_ONE).div(multiFactor).sub(1).ceil(),
          TWO.pow(25).sub(1)
        ).mul(c).div(10).ceil();
        testCurrentRate(0, initialRate, multiFactor, timeElapsed, '0');
        testCurrentRate(1, initialRate, multiFactor, timeElapsed, '0');
        testCurrentRate(2, initialRate, multiFactor, timeElapsed, '0');
        testCurrentRate(3, initialRate, multiFactor, timeElapsed, '0');
        testCurrentRate(4, initialRate, multiFactor, timeElapsed, '0.000000000004');
        testCurrentRate(5, initialRate, multiFactor, timeElapsed, '0.0000000000000000000000000000000000003');
      }
    }
  }

  for (const a of [-27, -10, 0, 10, 27]) {
    for (const b of [-14, -9, -6, -1]) {
      for (const c of [19, 24, 29]) {
        const initialRate = new Decimal(10).pow(a);
        const multiFactor = new Decimal(10).pow(b);
        const timeElapsed = new Decimal(2).pow(c).sub(1);
        testCurrentRate(0, initialRate, multiFactor, timeElapsed, '0.0000000000000000000000000000000000000000003');
        testCurrentRate(1, initialRate, multiFactor, timeElapsed, '0');
        testCurrentRate(2, initialRate, multiFactor, timeElapsed, '0');
        testCurrentRate(3, initialRate, multiFactor, timeElapsed, '0');
      }
    }
  }
});
