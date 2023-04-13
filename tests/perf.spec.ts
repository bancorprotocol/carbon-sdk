// import assert from 'assert';
// import { performance } from 'perf_hooks';

// describe.skip('getOrders performance tests', () => {
//   it('creating pairToStrategies map', async () => {
//     const start = performance.now();
//     const pairToStrategies = await createPairToStrategiesMap();
//     const end = performance.now();
//     assert(end - start < 1000, 'Creating pairToStrategies map took too long');
//   });

//   it('retrieving strategies for token pair', async () => {
//     const pairId = 'token0-token1';
//     const start = performance.now();
//     const strategies = await getStrategiesForTokenPair(pairId);
//     const end = performance.now();
//     assert(
//       end - start < 1000,
//       'Retrieving strategies for token pair took too long'
//     );
//   });

//   it('adding new strategy to pairToStrategies map', async () => {
//     const strategy = { id: 1, token0: 'token0', token1: 'token1' };
//     const start = performance.now();
//     onStrategyCreated(strategy);
//     const end = performance.now();
//     assert(
//       end - start < 1000,
//       'Adding new strategy to pairToStrategies map took too long'
//     );
//   });

//   it('modifying order in pairToStrategies map', async () => {
//     const strategyId = 1;
//     const orderIndex = 0;
//     const order = { y: 1, z: 2, A: 3, B: 4 };
//     const start = performance.now();
//     onOrderModified(strategyId, orderIndex, order);
//     const end = performance.now();
//     assert(
//       end - start < 1000,
//       'Modifying order in pairToStrategies map took too long'
//     );
//   });
// });

// describe.skip('getOrders performance tests with many orders', () => {
//   it('retrieving strategies for token pair with many orders', async () => {
//     // Populate the pairToStrategies map with a large number of strategies
//     const numStrategies = 100000;
//     const pairToStrategies = { 'token0-token1': [] };
//     for (let i = 0; i < numStrategies; i++) {
//       const strategy = { id: i, token0: 'token0', token1: 'token1' };
//       pairToStrategies['token0-token1'].push(strategy);
//     }

//     const pairId = 'token0-token1';
//     const start = performance.now();
//     const strategies = await getStrategiesForTokenPair(pairId);
//     const end = performance.now();
//     assert(
//       end - start < 1000,
//       'Retrieving strategies for token pair with many orders took too long'
//     );
//   });

//   it('adding new strategy to pairToStrategies map with many orders', async () => {
//     // Populate the pairToStrategies map with a large number of strategies
//     const numStrategies = 100000;
//     const pairToStrategies = { 'token0-token1': [] };
//     for (let i = 0; i < numStrategies; i++) {
//       const strategy = { id: i, token0: 'token0', token1: 'token1' };
//       pairToStrategies['token0-token1'].push(strategy);
//     }

//     const strategy = {
//       id: numStrategies + 1,
//       token0: 'token0',
//       token1: 'token1',
//     };
//     const start = performance.now();
//     onStrategyCreated(strategy);
//     const end = performance.now();
//     assert(
//       end - start < 1000,
//       'Adding new strategy to pairToStrategies map with many orders took too long'
//     );
//   });

//   it('modifying order in pairToStrategies map with many orders', async () => {
//     // Populate the pairToStrategies map with a large number of strategies
//     const numStrategies = 100000;
//     const pairToStrategies = { 'token0-token1': [] };
//     for (let i = 0; i < numStrategies; i++) {
//       const strategy = { id: i, token0: 'token0', token1: 'token1' };
//       pairToStrategies['token0-token1'].push(strategy);
//     }

//     const strategyId = 1;
//     const orderIndex = 0;
//     const order = { y: 1, z: 2, A: 3, B: 4 };
//     const start = performance.now();
//     onOrderModified(strategyId, orderIndex, order);
//     const end = performance.now();
//     assert(
//       end - start < 1000,
//       'Modifying order in pairToStrategies map with many orders took too long'
//     );
//   });
//   it('getting orders', async () => {
//     // Set up the input parameters for the getOrders function
//     const token0 = 'token0';
//     const token1 = 'token1';
//     const pairId = `${token0}-${token1}`;

//     // Populate the pairToStrategies map with some strategies
//     const pairToStrategies = { [pairId]: [] };
//     const numStrategies = 10;
//     for (let i = 0; i < numStrategies; i++) {
//       const strategy = {
//         id: i,
//         token0: token0,
//         token1: token1,
//         order0: { y: i, z: i + 1, A: i + 2, B: i + 3 },
//       };
//       pairToStrategies[pairId].push(strategy);
//     }

//     // Measure the time it takes for the getOrders function to complete execution
//     const start = performance.now();
//     const orders = getOrders(token0, token1);
//     const end = performance.now();
//     assert(end - start < 1000, 'Getting orders took too long');
//   });
//   it('getting orders when ordersCache is already full', async () => {
//     // Set up the input parameters for the getOrders function
//     const token0 = 'token0';
//     const token1 = 'token1';
//     const pairId = `${token0}-${token1}`;

//     // Populate the pairToStrategies map with some strategies
//     const pairToStrategies = { [pairId]: [] };
//     const numStrategies = 10;
//     for (let i = 0; i < numStrategies; i++) {
//       const strategy = {
//         id: i,
//         token0: token0,
//         token1: token1,
//         order0: { y: i, z: i + 1, A: i + 2, B: i + 3 },
//       };
//       pairToStrategies[pairId].push(strategy);
//     }

//     // Populate the ordersCache with the orders for the given token pair
//     const orders = getOrders(token0, token1);
//     const tokens = [token0, token1].sort();
//     const cacheKey = `${pairId}-${tokens[0].toString()}`;
//     ordersCache.set(cacheKey, orders);

//     // Measure the time it takes for the getOrders function to complete execution
//     // when the orders are already cached
//     const start = performance.now();
//     const cachedOrders = getOrders(token0, token1);
//     const end = performance.now();
//     assert(
//       end - start < 1000,
//       'Getting orders when ordersCache is already full took too long'
//     );
//   });
// });
