import { BigNumber, BigNumberish } from '../utils/numerics';
import { PayableOverrides } from 'ethers';
import { Interface } from '@ethersproject/abi';
import { Multicall } from '../abis/types';
import { TradeAction } from '../common/types';

const ETH_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'.toLowerCase();

export interface MultiCall {
  contractAddress: string;
  interface: Interface;
  methodName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  methodParameters: any[];
}

export interface MulticallService {
  execute(calls: MultiCall[], blockHeight?: number): Promise<unknown[][]>;
}

export class DefaultMulticallService implements MulticallService {
  constructor(private readonly multicallContract: Multicall) {}

  async execute(
    calls: MultiCall[],
    blockHeight?: number
  ): Promise<unknown[][]> {
    try {
      const encoded = calls.map((call) => ({
        target: call.contractAddress.toLocaleLowerCase(),
        callData: call.interface.encodeFunctionData(
          call.methodName,
          call.methodParameters
        ),
      }));
      const encodedRes = await this.multicallContract.tryAggregate(
        false,
        encoded,
        {
          blockTag: blockHeight,
        }
      );

      return encodedRes.map((call, i) => {
        if (!call.success) return [];
        const result = calls[i].interface.decodeFunctionResult(
          calls[i].methodName,
          call.returnData
        );
        return Array.isArray(result) ? result : [result];
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Multicall execution failed: ${errorMessage}`);
    }
  }
}

// For backward compatibility
export const multicall = async (
  calls: MultiCall[],
  multicallContract: Multicall,
  blockHeight?: number
): Promise<unknown[][]> => {
  const service = new DefaultMulticallService(multicallContract);
  return service.execute(calls, blockHeight);
};

export const isETHAddress = (address: string) => {
  return address.toLowerCase() === ETH_ADDRESS;
};

export const buildTradeOverrides = (
  sourceToken: string,
  tradeActions: TradeAction[],
  byTarget: boolean,
  maxInput: BigNumberish,
  overrides?: PayableOverrides
): PayableOverrides => {
  const customOverrides = { ...overrides };
  if (isETHAddress(sourceToken)) {
    if (byTarget) {
      customOverrides.value = BigNumber.from(maxInput);
    } else {
      customOverrides.value = tradeActions.reduce(
        (acc, cur) => acc.add(cur.amount as BigNumberish),
        BigNumber.from(0)
      );
    }
  }
  return customOverrides;
};
