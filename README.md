# Bountiful - Ergo Bounty Platform

A decentralized bounty platform built on the Ergo blockchain that transforms development funding through trust-based and competitive bounties.

## Overview

Bountiful leverages smart contracts for secure escrow, ensuring funds are only released when problems are verifiably solved. This eliminates intermediaries and centralized control, creating a merit-based ecosystem where contributors are rewarded solely on their work quality, enhancing transparency and efficiency in the blockchain development space.

## Key Features

- **Hybrid Trust Model**: Dual-track evaluation system that optimizes bounty resolution based on project trust status
  - Trusted projects benefit from creator-led evaluation, reducing overhead
  - Untrusted projects utilize independent judges selected through reputation-based mechanisms

- **Smart Contract Escrow System**: Secure fund management protocols that prevent premature payouts and ensure fair compensation

- **Reputation-Based Judge Selection**: Robust ranking system for judges based on:
  - Historical accuracy of evaluations
  - Past contributions to the ecosystem
  - Community feedback metrics
  - External reputation in the community

## Project Structure

```
bountiful/
├── contracts/        # ErgoScript smart contracts
├── src/
│   ├── components/   # Svelte UI components
│   ├── lib/          # Library functions and utilities
│   ├── routes/       # Page routes and layouts
│   ├── services/     # Blockchain and API services
│   ├── stores/       # Svelte stores for state management
│   └── utils/        # Helper functions
├── static/           # Static assets
├── tests/            # Test files
└── scripts/          # Deployment and utility scripts
```

## Technology Stack

- **Blockchain**: Ergo Blockchain, ErgoScript
- **Frontend**: Svelte, Vite, Tailwind CSS
- **Backend Services**: Node.js, Express, TypeScript
- **Wallet Integration**: fleetSDK, nautilusSDK

## Getting Started

### Prerequisites

- Node.js (v16 or later)
- npm or yarn
- Ergo wallet (Nautilus recommended)

### Installation

1. Clone the repository
   ```bash
   git clone https://github.com/yourusername/bountiful.git
   cd bountiful
   ```

2. Install dependencies
   ```bash
   npm install
   # or
   yarn install
   ```

3. Start the development server
   ```bash
   npm run dev
   # or
   yarn dev
   ```

4. Open your browser and navigate to `http://localhost:5173`

## Smart Contract Development

The platform utilizes the Ergo blockchain's UTXO model with ErgoScript for smart contracts. The contract structure includes:

- **Bounty Box**: Stores bounty details, rewards, and submission tracking
- **Reputation Box**: Maintains judge reputation and feedback records

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
