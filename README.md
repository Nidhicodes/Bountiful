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


