import { Rate } from '../common/types';

export const sortByMinRate = (x: Rate, y: Rate): number => {
  const lhs = x.output * y.input;
  const rhs = y.output * x.input;
  const lt = lhs < rhs;
  const gt = lhs > rhs;
  const eq = !lt && !gt;
  const is_lt = lt || (eq && x.output < y.output);
  const is_gt = gt || (eq && x.output > y.output);
  return +is_lt - +is_gt;
};

export const sortByMaxRate = (x: Rate, y: Rate): number => sortByMinRate(y, x);
