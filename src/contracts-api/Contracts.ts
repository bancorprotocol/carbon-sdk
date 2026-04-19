import {
  CarbonController__factory,
  CarbonController,
  Multicall,
  Multicall__factory,
  Voucher,
  Voucher__factory,
  Token,
  Token__factory,
  CarbonBatcher,
  CarbonBatcher__factory,
  GradientVoucher,
  GradientVoucher__factory,
  GradientController,
  GradientController__factory,
} from '../abis/types';

import { Provider } from 'ethers';
import { config as defaultConfig } from './config';
import { ContractsConfig } from './types';

type ResolvedContractsConfig = Required<
  Pick<
    ContractsConfig,
    | 'carbonControllerAddress'
    | 'multiCallAddress'
    | 'voucherAddress'
    | 'carbonBatcherAddress'
  >
> &
  Pick<
    ContractsConfig,
    'gradientControllerAddress' | 'gradientVoucherAddress'
  >;

export class Contracts {
  private _provider: Provider;
  private _carbonController: CarbonController | undefined;
  private _multiCall: Multicall | undefined;
  private _voucher: Voucher | undefined;
  private _carbonBatcher: CarbonBatcher | undefined;
  private _gradientVoucher: GradientVoucher | undefined;
  private _gradientController: GradientController | undefined;
  private _config: ResolvedContractsConfig;

  public constructor(provider: Provider, config?: ContractsConfig) {
    this._provider = provider;
    this._config = {
      carbonControllerAddress:
        config?.carbonControllerAddress ?? defaultConfig.carbonControllerAddress,
      multiCallAddress:
        config?.multiCallAddress ?? defaultConfig.multiCallAddress,
      voucherAddress: config?.voucherAddress ?? defaultConfig.voucherAddress,
      carbonBatcherAddress:
        config?.carbonBatcherAddress ?? defaultConfig.carbonBatcherAddress,
      // Gradient contracts are opt-in per chain. If omitted, the SDK must not
      // attempt to call them.
      gradientControllerAddress: config?.gradientControllerAddress,
      gradientVoucherAddress: config?.gradientVoucherAddress,
    };
  }

  public get carbonController(): CarbonController {
    if (!this._carbonController)
      this._carbonController = CarbonController__factory.connect(
        this._config.carbonControllerAddress,
        this._provider
      );

    return this._carbonController;
  }

  public get gradientController(): GradientController {
    if (!this.hasGradientController) {
      throw new Error('GradientController address not configured');
    }
    if (!this._gradientController)
      this._gradientController = GradientController__factory.connect(
        this._config.gradientControllerAddress!,
        this._provider
      );

    return this._gradientController;
  }

  public get carbonBatcher(): CarbonBatcher {
    if (!this._carbonBatcher)
      this._carbonBatcher = CarbonBatcher__factory.connect(
        this._config.carbonBatcherAddress,
        this._provider
      );

    return this._carbonBatcher;
  }

  public get multicall(): Multicall {
    if (!this._multiCall)
      this._multiCall = Multicall__factory.connect(
        this._config.multiCallAddress,
        this._provider
      );

    return this._multiCall;
  }

  public get voucher(): Voucher {
    if (!this._voucher)
      this._voucher = Voucher__factory.connect(
        this._config.voucherAddress,
        this._provider
      );

    return this._voucher;
  }

  public get gradientVoucher(): GradientVoucher {
    if (!this.hasGradientVoucher) {
      throw new Error('GradientVoucher address not configured');
    }
    if (!this._gradientVoucher)
      this._gradientVoucher = GradientVoucher__factory.connect(
        this._config.gradientVoucherAddress!,
        this._provider
      );

    return this._gradientVoucher;
  }

  public get hasGradientController(): boolean {
    return !!this._config.gradientControllerAddress;
  }

  public get hasGradientVoucher(): boolean {
    return !!this._config.gradientVoucherAddress;
  }

  public token(address: string): Token {
    return Token__factory.connect(address, this._provider);
  }

  public get provider(): Provider {
    return this._provider;
  }
}
