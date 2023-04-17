import {BigNumber, BnToDec, DecToBn, Decimal} from '../utils/numerics';
import {getOrderInfo} from '../utils/encoders';
import {EncodedOrder} from '../common/types';

export function calc_dxfromdy_f(order: EncodedOrder, dy: BigNumber, byTarget: Boolean): BigNumber {
  const OrderInfo = getOrderInfo(order)
  const newA = OrderInfo.pa.sqrt().sub(OrderInfo.pb.sqrt());
  const newB = OrderInfo.pb.sqrt();

  const y = OrderInfo.y
  const z = OrderInfo.z
  const A = OrderInfo.A
  const B = OrderInfo.B

  const newdy = BnToDec(dy)

  if (B.eq(0) && A.eq(0)){
    console.log('exit 1')
    return BigNumber.from(0);
  }

  if (newdy.lt(0)) {
    return BigNumber.from(0);
  } else if (newdy.gt(y)){
    return BigNumber.from(0);
  } else {
    const num = z.pow(2);
    const denom = (newA.mul(y).add(newB.mul(z))).mul(newA.mul(y).add(newB.mul(z)).sub(newA.mul(newdy)));
    // console.log(newdy.mul(num).div(denom));
    if (byTarget){
      return DecToBn(newdy.mul(num).div(denom).ceil());
    } else {
      return DecToBn(newdy.mul(num).div(denom).floor());
    }

  }
}

export function calc_dyfromp_f(order: EncodedOrder,p: Decimal, byTarget: Boolean): BigNumber {
  const OrderInfo = getOrderInfo(order)
  const y = OrderInfo.y
  const z = OrderInfo.z
  const A = OrderInfo.A
  const B = OrderInfo.B
  const pa = OrderInfo.pa;
  const pb = OrderInfo.pb;
  const newA = OrderInfo.pa.sqrt().sub(OrderInfo.pb.sqrt());
  const newB = OrderInfo.pb.sqrt();

  // console.log(p, pa.toFixed(12), pb.toFixed(12))

  if (B.eq(0) && A.eq(0)){
    // console.log('exit 1')
    return BigNumber.from(0);
  }

  let trade_y: Decimal
  if (p.gt(pa)) {
    // console.log('exit 2')
    trade_y = new Decimal(NaN)
  } else if (p.lt(pb)) {
    // console.log('exit 3')
    trade_y = new Decimal(0)
  } else {
    // console.log('exit 4')
    trade_y = z.mul(p.sqrt().minus(pb.sqrt())).div(pa.sqrt().minus(pb.sqrt()));
  }
  if (trade_y.gt(y)) {
    // console.log('exit 5')
    trade_y = new Decimal(NaN)
  }

  if (trade_y.isNaN()) {
    // console.log('exit 6')
    return BigNumber.from(0);
  }
  // console.log(trade_y)
  // console.log(y.minus(trade_y).ceil())
  if (byTarget){
    return DecToBn(y.minus(trade_y).ceil());  
  } else{
    return DecToBn(y.minus(trade_y).floor());
  }
}

type GoalSeekFunction = (x: Decimal) => BigNumber;

export function goalseek(func: GoalSeekFunction, a: Decimal, b: Decimal, eps: Decimal = new Decimal('1e-30')): Decimal {
  if (!a.lt(b)) {
    throw new Error(`Bracketing value a must be smaller than b: ${a.toString()}, ${b.toString()}`);
  }

  const fa = func(a);
  const fb = func(b);

  if (!(fa.mul(fb).lt(0))) {
    throw new Error(`Sign of f(a) must be opposite of sign of f(b): ${fa.toString()}, ${fb.toString()}, ${a.toString()}, ${b.toString()}`);
  }

  while (true) {
    const m = a.add(b).div(2);
    const fm = func(m);

    if (fm.mul(fa).gt(0)) {
      a = m;
    } else {
      b = m;
    }

    if (b.div(a).sub(1).lt(eps)) {
      return m;
    }
  }
}

export function get_geoprice(order: EncodedOrder): Decimal {
  const OrderInfo = getOrderInfo(order)
  const pmarg = OrderInfo.pmarg
  const pb = OrderInfo.pb
  return ((pmarg.mul(pb)).pow(0.5))
}