# Carbon SDK - Concentrated AMM Integration Demo

This project demonstrates how Carbon strategies can be adapted for use with services that require a concentrated AMM format by leveraging the Carbon-to-Concentrated-AMM adapter.

## Prerequisites

- Node.js (v14 or higher)
- Yarn or npm
- Alchemy API key (or another Ethereum provider)

## Installation

Clone the repository and install dependencies:

```bash
git clone <repository-url>
cd carbon-integration-demo
yarn install
# or
npm install
```

## Configuration

Before running the demo, you need to configure your Ethereum provider:

1. Open `demo.ts`
2. Replace `<YOUR_API_KEY>` in the `PROVIDER_URL` constant with your Alchemy API key:

```typescript
const PROVIDER_URL = 'https://eth-mainnet.g.alchemy.com/v2/<YOUR_API_KEY>';
```

## Running the Demo

You can run the demo in the following ways:

### Using ts-node (development)

This will run the TypeScript file directly without explicit compilation:

```bash
yarn dev
# or
npm run dev
```

### Build and Run

First compile the TypeScript to JavaScript, then run the compiled code:

```bash
# Build
yarn build
# or
npm run build

# Run
yarn start
# or
npm start
```

## What the Demo Does

1. Connects to the Ethereum mainnet (via your configured provider)
2. Queries for Carbon StrategyUpdated events, handling only the ones with `reason` TRADE.
3. Extracts relevant information from each Carbon strategy and transforms it into an object that represents a position in a concentrated AMM.
4. Demonstrates how a service could consume this converted data

## Notes

- This is a demo application. For production use, you should implement proper error handling and configuration management.
- The integration demonstrates how to transform Carbon strategies into a concentrated AMM format, making them compatible with services that expect concentrated liquidity position data.
