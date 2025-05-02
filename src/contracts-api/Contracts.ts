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

export class Contracts {
  private _provider: Provider;
  private _carbonController: CarbonController | undefined;
  private _multiCall: Multicall | undefined;
  private _voucher: Voucher | undefined;
  private _carbonBatcher: CarbonBatcher | undefined;
  private _gradientVoucher: GradientVoucher | undefined;
  private _gradientController: GradientController | undefined;
  private _config = defaultConfig;

  public constructor(provider: Provider, config?: ContractsConfig) {
    this._provider = provider;
    this._config.carbonControllerAddress =
      config?.carbonControllerAddress || defaultConfig.carbonControllerAddress;
    this._config.multiCallAddress =
      config?.multiCallAddress || defaultConfig.multiCallAddress;
    this._config.voucherAddress =
      config?.voucherAddress || defaultConfig.voucherAddress;
    this._config.gradientVoucherAddress =
      config?.gradientVoucherAddress || defaultConfig.gradientVoucherAddress;
    this._config.gradientControllerAddress =
      config?.gradientControllerAddress ||
      defaultConfig.gradientControllerAddress;
    this._config.carbonBatcherAddress =
      config?.carbonBatcherAddress || defaultConfig.carbonBatcherAddress;
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
    if (!this._gradientController)
      this._gradientController = GradientController__factory.connect(
        this._config.gradientControllerAddress,
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
    if (!this._gradientVoucher)
      this._gradientVoucher = GradientVoucher__factory.connect(
        this._config.gradientVoucherAddress,
        this._provider
      );

    return this._gradientVoucher;
  }

  public token(address: string): Token {
    return Token__factory.connect(address, this._provider);
  }

  public get provider(): Provider {
    return this._provider;
  }
}
