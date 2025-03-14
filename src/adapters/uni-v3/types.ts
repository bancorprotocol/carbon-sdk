/**
 * Represents a Uniswap V3 pool configuration
 */
export interface UniV3Pool {
  xAxisToken: string;
  yAxisToken: string;
  tickSpacing: number;
}

/**
 * Represents a Uniswap V3 position
 */
export interface UniV3Position {
  tickUpper: number;
  tickLower: number;
  liquidity: string;
}

/**
 * Represents a Carbon strategy cast to Uniswap V3 format
 */
export interface UniV3CastStrategy {
  pool: UniV3Pool;
  sellOrder: UniV3Position;
  buyOrder: UniV3Position;
}
