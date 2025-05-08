import { expect } from 'chai';
import { BigNumber, MAX_UINT256 } from '../src/utils/numerics';
import {
  castToUniV3,
  batchCastToUniV3,
  UniV3CastStrategy,
} from '../src/adapters/uni-v3';
import { EncodedStrategy } from '../src/common/types';

describe('Uniswap V3 Adapter', () => {
  const testStrategies = [
    {
      id: '3402823669209384634633746074317682114600',
      token0: '0x3894085Ef7Ff0f0aeDf52E2A2704928d1Ec074F1',
      token1: '0xB75D0B03c06A926e488e2659DF1A861F860bD3d1',
      order0: {
        y: '20087035',
        z: '30967255',
        A: '126661297459',
        B: '281404634343767',
      },
      order1: {
        y: '10888810',
        z: '30976451',
        A: '126661281627',
        B: '281404599168185',
      },
    },
    {
      id: '3402823669209384634633746074317682114738',
      token0: '0xB75D0B03c06A926e488e2659DF1A861F860bD3d1',
      token1: '0x3894085Ef7Ff0f0aeDf52E2A2704928d1Ec074F1',
      order0: {
        y: '0',
        z: '551464',
        A: '1202697222036',
        B: '281473569277354',
      },
      order1: {
        y: '550021',
        z: '550021',
        A: '1197292820108',
        B: '280208748612269',
      },
    },
    {
      id: '3402823669209384634633746074317682114719',
      token0: '0xB75D0B03c06A926e488e2659DF1A861F860bD3d1',
      token1: '0x3894085Ef7Ff0f0aeDf52E2A2704928d1Ec074F1',
      order0: {
        y: '43799711416',
        z: '50176766065',
        A: '143448208456',
        B: '281334344687532',
      },
      order1: {
        y: '6378253420',
        z: '50179471315',
        A: '143512020824',
        B: '281459495161182',
      },
    },
    {
      id: '3402823669209384634633746074317682114720',
      token0: '0xB75D0B03c06A926e488e2659DF1A861F860bD3d1',
      token1: '0x3894085Ef7Ff0f0aeDf52E2A2704928d1Ec074F1',
      order0: {
        y: '17046009009',
        z: '49915542880',
        A: '437952831887',
        B: '281306243569279',
      },
      order1: {
        y: '32904958612',
        z: '49946589434',
        A: '437777089951',
        B: '281193360855543',
      },
    },
    {
      id: '3402823669209384634633746074317682114721',
      token0: '0xB75D0B03c06A926e488e2659DF1A861F860bD3d1',
      token1: '0x3894085Ef7Ff0f0aeDf52E2A2704928d1Ec074F1',
      order0: {
        y: '8672',
        z: '140169718',
        A: '0',
        B: '281460904017263',
      },
      order1: {
        y: '140182466',
        z: '140182466',
        A: '0',
        B: '281460902609959',
      },
    },
    {
      id: '3402823669209384634633746074317682115196',
      token0: '0x3894085Ef7Ff0f0aeDf52E2A2704928d1Ec074F1',
      token1: '0xB75D0B03c06A926e488e2659DF1A861F860bD3d1',
      order0: {
        y: '2035076',
        z: '3957684',
        A: '2053115268909',
        B: '280385818861323',
      },
      order1: {
        y: '1916874',
        z: '3959496',
        A: '2053542813739',
        B: '280444206964961',
      },
    },
    {
      id: '3402823669209384634633746074317682114666',
      token0: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
      token1: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      order0: {
        A: '9233',
        B: '22290',
        y: '400000000',
        z: '737165668',
      },
      order1: {
        A: '9202255432088846',
        B: '9483730408799505',
        y: '10000000000000000000000000000',
        z: '22247448713915602419910470490',
      },
    },
    {
      id: '3402823669209384634633746074317682114777',
      token0: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
      token1: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      order0: {
        A: '0',
        B: '22290',
        y: '400000000',
        z: '737165668',
      },
      order1: {
        A: '9202255432088846',
        B: '9483730408799505',
        y: '0',
        z: '0',
      },
    },
    {
      id: '3402823669209384634633746074317682114778',
      token0: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
      token1: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      order0: {
        A: '2053115268909',
        B: '280385818861323',
        y: '1982591',
        z: '3957684',
      },
      order1: {
        A: '2053542813739',
        B: '280444206964961',
        y: '1969350',
        z: '3959496',
      },
    },
  ];
  const simulationResults = [
    {
      axes_assignments: {
        x: {
          original_designation: 'base',
          token_ticker: '0x3894085Ef7Ff0f0aeDf52E2A2704928d1Ec074F1',
          token_wei_quantity: 20087035,
        },
        y: {
          original_designation: 'quote',
          token_ticker: '0xB75D0B03c06A926e488e2659DF1A861F860bD3d1',
          token_wei_quantity: 10888810,
        },
      },
      sell_order: {
        tick_upper: 5,
        tick_lower: -5,
        L_constant: '68817449013',
        sqrt_price_x96: '79224836465462438675975356707',
      },
      buy_order: {
        tick_upper: 4,
        tick_lower: -6,
        L_constant: '68837893567',
        sqrt_price_x96: '79220885344707642275114776626',
      },
    },
    {
      axes_assignments: {
        x: {
          original_designation: 'quote',
          token_ticker: '0x3894085Ef7Ff0f0aeDf52E2A2704928d1Ec074F1',
          token_wei_quantity: 550021,
        },
        y: {
          original_designation: 'base',
          token_ticker: '0xB75D0B03c06A926e488e2659DF1A861F860bD3d1',
          token_wei_quantity: 0,
        },
      },
      sell_order: {
        tick_upper: 86,
        tick_lower: -1,
        L_constant: '129062671',
        sqrt_price_x96: '79227766357008435341871284224',
      },
      buy_order: {
        tick_upper: 91,
        tick_lower: 4,
        L_constant: '129306002',
        sqrt_price_x96: '79247570823349155506041465764',
      },
    },
    {
      axes_assignments: {
        x: {
          original_designation: 'quote',
          token_ticker: '0x3894085Ef7Ff0f0aeDf52E2A2704928d1Ec074F1',
          token_wei_quantity: '6378253420',
        },
        y: {
          original_designation: 'base',
          token_ticker: '0xB75D0B03c06A926e488e2659DF1A861F860bD3d1',
          token_wei_quantity: '43799711416',
        },
      },
      sell_order: {
        tick_upper: 1,
        tick_lower: -10,
        L_constant: '98457165910817',
        sqrt_price_x96: '79223823604743748521516406530',
      },
      buy_order: {
        tick_upper: 2,
        tick_lower: -10,
        L_constant: '98418693003175',
        sqrt_price_x96: '79227385624419637146265735656',
      },
    },
    {
      axes_assignments: {
        x: {
          original_designation: 'quote',
          token_ticker: '0x3894085Ef7Ff0f0aeDf52E2A2704928d1Ec074F1',
          token_wei_quantity: '32904958612',
        },
        y: {
          original_designation: 'base',
          token_ticker: '0xB75D0B03c06A926e488e2659DF1A861F860bD3d1',
          token_wei_quantity: '17046009009',
        },
      },
      sell_order: {
        tick_upper: 20,
        tick_lower: -12,
        L_constant: '32081026189763',
        sqrt_price_x96: '79222765638153419595004999602',
      },
      buy_order: {
        tick_upper: 21,
        tick_lower: -12,
        L_constant: '32113866669645',
        sqrt_price_x96: '79226250510185713983827472934',
      },
    },
    {
      axes_assignments: {
        x: {
          original_designation: 'quote',
          token_ticker: '0x3894085Ef7Ff0f0aeDf52E2A2704928d1Ec074F1',
          token_wei_quantity: '140182466',
        },
        y: {
          original_designation: 'base',
          token_ticker: '0xB75D0B03c06A926e488e2659DF1A861F860bD3d1',
          token_wei_quantity: '8672',
        },
      },
      sell_order: {
        tick_upper: -1,
        tick_lower: -2,
        L_constant: MAX_UINT256.toString(),
        sqrt_price_x96: '79224201403219286715980054528',
      },
      buy_order: {
        tick_upper: 2,
        tick_lower: 1,
        L_constant: MAX_UINT256.toString(),
        sqrt_price_x96: '79232124219520464283601405494',
      },
    },
    {
      axes_assignments: {
        x: {
          original_designation: 'base',
          token_ticker: '0x3894085Ef7Ff0f0aeDf52E2A2704928d1Ec074F1',
          token_wei_quantity: '2035076',
        },
        y: {
          original_designation: 'quote',
          token_ticker: '0xB75D0B03c06A926e488e2659DF1A861F860bD3d1',
          token_wei_quantity: '1916874',
        },
      },
      sell_order: {
        tick_upper: 78,
        tick_lower: -69,
        L_constant: '542584738',
        sqrt_price_x96: '79237572743490683591415751070',
      },
      buy_order: {
        tick_upper: 73,
        tick_lower: -74,
        L_constant: '542720140',
        sqrt_price_x96: '79217858518035503902683150680',
      },
    },
    {
      axes_assignments: {
        x: {
          original_designation: 'quote',
          token_ticker: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
          token_wei_quantity: '10000000000000000000000000000',
        },
        y: {
          original_designation: 'base',
          token_ticker: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
          token_wei_quantity: '400000000',
        },
      },
      sell_order: {
        tick_upper: -458274,
        tick_lower: -465207,
        L_constant: '22473052012584769084',
        sqrt_price_x96: '7684266865468597954',
      },
      buy_order: {
        tick_upper: -450164,
        tick_lower: -458275,
        L_constant: '7474814787921475037',
        sqrt_price_x96: '10867363161216075543',
      },
    },
    {
      axes_assignments: {
        x: {
          original_designation: 'quote',
          token_ticker: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
          token_wei_quantity: '0',
        },
        y: {
          original_designation: 'base',
          token_ticker: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
          token_wei_quantity: '400000000',
        },
      },
      sell_order: {
        tick_upper: -465206,
        tick_lower: -465207,
        L_constant: MAX_UINT256.toString(),
        sqrt_price_x96: '6274077230880522240',
      },
      buy_order: {
        tick_upper: -450164,
        tick_lower: -458275,
        L_constant: '0',
        sqrt_price_x96: '8873164864832891564',
      },
    },
    {
      axes_assignments: {
        x: {
          original_designation: 'quote',
          token_ticker: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
        },
        y: {
          original_designation: 'base',
          token_ticker: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
        },
      },
      sell_order: {
        tick_upper: 69,
        tick_lower: -78,
        L_constant: '542584738',
        sqrt_price_x96: '79211089548797623989214284238',
      },
      buy_order: {
        tick_upper: 74,
        tick_lower: -73,
        L_constant: '542720140',
        sqrt_price_x96: '79230805970778530560142249674',
      },
    },
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const strategyFromDemoStrategy = (strategy: any): EncodedStrategy => ({
    id: BigNumber.from(strategy.id),
    token0: strategy.token0,
    token1: strategy.token1,
    order0: {
      y: BigNumber.from(strategy.order0.y),
      z: BigNumber.from(strategy.order0.z),
      A: BigNumber.from(strategy.order0.A),
      B: BigNumber.from(strategy.order0.B),
    },
    order1: {
      y: BigNumber.from(strategy.order1.y),
      z: BigNumber.from(strategy.order1.z),
      A: BigNumber.from(strategy.order1.A),
      B: BigNumber.from(strategy.order1.B),
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uniV3StrategyFromSimulationResult = (res: any): UniV3CastStrategy => ({
    pool: {
      xAxisToken: res.axes_assignments.x.token_ticker,
      yAxisToken: res.axes_assignments.y.token_ticker,
      tickSpacing: 1,
    },
    sellOrder: {
      tickLower: res.sell_order.tick_lower,
      tickUpper: res.sell_order.tick_upper,
      liquidity: res.sell_order.L_constant,
      sqrtPriceX96: res.sell_order.sqrt_price_x96,
    },
    buyOrder: {
      tickLower: res.buy_order.tick_lower,
      tickUpper: res.buy_order.tick_upper,
      liquidity: res.buy_order.L_constant,
      sqrtPriceX96: res.buy_order.sqrt_price_x96,
    },
  });

  const demoStrategies = testStrategies.map(strategyFromDemoStrategy);

  describe('castToUniV3', () => {
    demoStrategies.forEach((strategy, index) => {
      it(`should correctly convert demo strategy number ${strategy.id}`, () => {
        const uniV3Strategy = castToUniV3(strategy);
        const uniV3StrategyFromSimulation = uniV3StrategyFromSimulationResult(
          simulationResults[index]
        );

        expect(uniV3Strategy).to.deep.equal(uniV3StrategyFromSimulation);
        // check that the tick lower and upper are in the correct order
        expect(uniV3Strategy.sellOrder.tickLower).to.be.lessThan(
          uniV3Strategy.sellOrder.tickUpper
        );
        expect(uniV3Strategy.buyOrder.tickLower).to.be.lessThan(
          uniV3Strategy.buyOrder.tickUpper
        );

        // check that token0 is the xAxisToken only if the address is lower than token1
        const addr0 = BigNumber.from(strategy.token0);
        const addr1 = BigNumber.from(strategy.token1);
        const isToken0XAxis = addr0.lt(addr1);
        expect(uniV3Strategy.pool.xAxisToken).to.equal(
          isToken0XAxis ? strategy.token0 : strategy.token1
        );

        // check that if order0.A is 0 then the liquidity is MAX_UINT256 in the sell order and if order1.A is 0 then the liquidity is MAX_UINT256 in the buy order
        if (strategy.order0.A.eq(0)) {
          expect(uniV3Strategy.sellOrder.liquidity).to.equal(
            MAX_UINT256.toString()
          );
        }
        if (strategy.order1.A.eq(0)) {
          expect(uniV3Strategy.buyOrder.liquidity).to.equal(
            MAX_UINT256.toString()
          );
        }

        // check that if order0.z is 0 then the liquidity is 0 in the sell order and if order1.z is 0 then the liquidity is 0 in the buy order
        if (strategy.order0.z.eq(0)) {
          expect(uniV3Strategy.sellOrder.liquidity).to.equal('0');
        }
        if (strategy.order1.z.eq(0)) {
          expect(uniV3Strategy.buyOrder.liquidity).to.equal('0');
        }
      });
    });
  });

  describe('batchCasToUniV3', () => {
    it('should convert multiple encoded strategies', () => {
      const uniV3Strategies = batchCastToUniV3(demoStrategies);

      expect(uniV3Strategies).to.have.length(demoStrategies.length);
      uniV3Strategies.forEach((uniV3Strategy, index) => {
        expect(uniV3Strategy).to.deep.equal(
          uniV3StrategyFromSimulationResult(simulationResults[index])
        );
      });
    });

    it('should handle empty array', () => {
      const uniV3Strategies = batchCastToUniV3([]);
      expect(uniV3Strategies).to.have.length(0);
    });
  });
});
