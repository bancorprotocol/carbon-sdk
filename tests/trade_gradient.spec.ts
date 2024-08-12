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

const EXP_ONE = new Decimal(2).pow(127);
const MAX_VAL = new Decimal(2).pow(131);

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

describe.only('trade_gradient', () => {
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
          MAX_VAL.div(EXP_ONE).div(multiFactor).sub(1).ceil(),
          TWO.pow(25).sub(1)
        ).mul(c).div(10).ceil();
        testCurrentRate(0, initialRate, multiFactor, timeElapsed, '0');
        testCurrentRate(1, initialRate, multiFactor, timeElapsed, '0');
        testCurrentRate(2, initialRate, multiFactor, timeElapsed, '0');
        testCurrentRate(3, initialRate, multiFactor, timeElapsed, '0');
        testCurrentRate(4, initialRate, multiFactor, timeElapsed, '0.000000000000000000000000000000000002');
        testCurrentRate(5, initialRate, multiFactor, timeElapsed, '0.000000000000000000000000000000000002');
      }
    }
  }
});
