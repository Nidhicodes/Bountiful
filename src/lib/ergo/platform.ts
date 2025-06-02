// src/ergo/platform.ts
import type { Platform } from '../common/platform';
import type { Bounty } from '../common/bounty';
import { explorer_uri, network_id } from './envs';
import { address, connected, network, balance } from "../common/store";
import type { contract_version } from './contract';
import type { Box, Amount } from '@fleet-sdk/core';
import { PUBLIC_DEV_CONTRACT_ADDRESS as dev_fee_contract_address } from '$env/static/public';

declare global {
  interface Window {
    ergo?: {
      get_change_address(): Promise<string>;
      get_utxos(): Promise<any[]>;
      get_current_height(): Promise<number>;
      sign_tx(tx: any): Promise<any>;
      submit_tx(tx: any): Promise<string>;
    };
    ergoConnector?: {
      nautilus?: {
        connect(): Promise<boolean>;
        isConnected(): Promise<boolean>;
      };
    };
  }
}

export class ErgoPlatform implements Platform {
  // Platform identifiers
  id = "ergo";
  main_token = "ERG";
  icon = "";
  time_per_block = 2 * 60 * 1000; // 2 minutes per block
  last_version: contract_version = "v1_1";

  // --- Wallet Connection ---
  async connect(): Promise<void> {
    if (typeof window.ergoConnector !== 'undefined') {
      const nautilus = window.ergoConnector.nautilus;
      if (nautilus) {
        if (await nautilus.connect()) {
          console.log('Connected to Nautilus!');
          address.set(await window.ergo?.get_change_address() ?? '');
          network.set(network_id === "mainnet" ? "ergo-mainnet" : "ergo-testnet");
          await this.get_balance();
          connected.set(true);
        }
      }
    }
  }

  // --- Blockchain State ---
  async get_current_height(): Promise<number> {
    try {
      return await window.ergo?.get_current_height() ??
        (await fetch(`${explorer_uri}/api/v1/networkState`)).json().then(data => data.height);
    } catch (error) {
      console.error("Failed to get block height:", error);
      throw new Error("Network error");
    }
  }

  async get_balance(id?: string): Promise<Map<string, number>> {
    const balanceMap = new Map<string, number>();
    const addr = await window.ergo?.get_change_address();
    if (!addr) throw new Error("Wallet not connected");

    try {
      const response = await fetch(`${explorer_uri}/api/v1/addresses/${addr}/balance/confirmed`);
      const data = await response.json();

      balanceMap.set("ERG", data.nanoErgs);
      balance.set(data.nanoErgs);

      data.tokens?.forEach((token: { tokenId: string; amount: number }) => {
        balanceMap.set(token.tokenId, token.amount);
      });

      return balanceMap;
    } catch (error) {
      console.error("Balance fetch failed:", error);
      throw new Error("Failed to load balance");
    }
  }

  // --- Bounty Functions ---
  async create_bounty(
  title: string,
  description: string,
  rewardNanoErg: number,
  deadlineBlock: number,
  minSubmissions: number,
  creatorAddress: string,
  metadata: string
): Promise<string | null> {
  const devFeePercentage = 1; // 1% 
const devFeeNanoErg = Math.floor(rewardNanoErg * (devFeePercentage / 100));
const minerFee = 1000000; // 0.001 ERG
const totalRequired = rewardNanoErg + devFeeNanoErg + minerFee + 1000000; // + buffer
  try {
    if (!window.ergo) throw new Error("Wallet not connected");

    // Step 1: Get current height for validation
    const currentHeight = await this.get_current_height();
    if (deadlineBlock <= currentHeight) {
      throw new Error("Deadline must be in the future");
    }

    // Step 2: Get creator's public key
    const creatorPubKey = await this.getPublicKey(creatorAddress);
    
    // Step 3: Get sufficient UTXOs
    const totalRequired = rewardNanoErg + 2000000; // reward + fees + box creation
    const selectedUtxos = await this.getUtxosForAmount(totalRequired);
    
    // Step 4: Create bounty token (using first input's ID + index 0)
    const bountyTokenId = selectedUtxos[0].boxId;
    
    // Step 5: Prepare bounty data (submissions root + judgments root + metadata root)
    const bountyData = this.createBountyData(metadata);
    
    // Step 6: Build the unsigned transaction
    const unsignedTx = {
      inputs: selectedUtxos.map(utxo => ({
        boxId: utxo.boxId,
        spendingProof: {
          proofBytes: "",
          extension: {}
        }
      })),
      outputs: [
        // Main bounty box (unchanged)
  {
    value: rewardNanoErg,
    ergoTree: this.getBountyContractErgoTree(),
    assets: [/* ... */],
    registers: { /* ... */ }
  },
  
  // Dev fee box (NEW)
  {
    value: devFeeNanoErg,
    ergoTree: dev_fee_contract_address, // From envs.ts
    assets: [],
    creationHeight: currentHeight
  },
  
  // Miner fee box
  {
    value: minerFee,
    ergoTree: "0008cd03...", // Standard miner fee script
    assets: []
  }
      ],
      fee: 1000000, // 0.001 ERG
      changeAddress: creatorAddress
    };

    console.log("Built unsigned transaction:", JSON.stringify(unsignedTx, null, 2));

    // Step 7: Sign the transaction
    const signedTx = await window.ergo.sign_tx(unsignedTx);
    
    if (!signedTx || !signedTx.id) {
      throw new Error("Failed to sign transaction or missing transaction ID");
    }

    console.log("Transaction signed successfully:", signedTx.id);

    // Step 8: Submit transaction to blockchain
    const txId = await window.ergo.submit_tx(signedTx);
    
    return txId;
  } catch (error) {
    console.error("Bounty creation failed:", error);
    throw error;
  }
}

// Helper method to get creator's public key from address
private async getPublicKey(address: string): Promise<string> {
  try {
    // This is a simplified approach - you may need to adjust based on your wallet integration
    const addressBytes = this.decodeAddress(address);
    return addressBytes; // Return the public key bytes
  } catch (error) {
    throw new Error("Failed to extract public key from address");
  }
}

// Helper method to decode Ergo address
private decodeAddress(address: string): string {
  // Implement proper address decoding here
  // This is a placeholder - use proper Ergo address decoding library
  return address; // Simplified for now
}

// Helper method to get the bounty contract ErgoTree
private getBountyContractErgoTree(): string {
  // This should be your compiled contract's ErgoTree
  // You need to compile your ErgoScript contract to get the actual ErgoTree
  return "YOUR_COMPILED_CONTRACT_ERGOTREE_HERE";
}

// Helper method to create bounty data structure
private createBountyData(metadata: string): Uint8Array {
  // Create 96 bytes: submissions root (32) + judgments root (32) + metadata root (32)
  const data = new Uint8Array(96);
  
  // Initialize with empty roots (all zeros)
  data.fill(0, 0, 64); // submissions and judgments roots start empty
  
  // Set metadata root (hash of metadata)
  const metadataBytes = new TextEncoder().encode(metadata);
  const metadataHash = this.simpleHash(metadataBytes);
  data.set(metadataHash.slice(0, 32), 64);
  
  return data;
}

// Simple hash function (replace with proper blake2b256 if available)
private simpleHash(data: Uint8Array): Uint8Array {
  // This is a placeholder - use proper blake2b256 hashing
  const hash = new Uint8Array(32);
  for (let i = 0; i < Math.min(data.length, 32); i++) {
    hash[i] = data[i];
  }
  return hash;
}

// Helper method to get sufficient UTXOs
private async getUtxosForAmount(requiredAmount: number): Promise<any[]> {
  const utxos = await window.ergo?.get_utxos();
  if (!utxos || utxos.length === 0) {
    throw new Error("No UTXOs available");
  }

  let totalValue = 0;
  const selectedUtxos = [];
  
  for (const utxo of utxos) {
    selectedUtxos.push(utxo);
    totalValue += parseInt(utxo.value);
    
    if (totalValue >= requiredAmount) {
      break;
    }
  }
  
  if (totalValue < requiredAmount) {
    throw new Error(`Insufficient balance. Required: ${requiredAmount}, Available: ${totalValue}`);
  }
  
  return selectedUtxos;
}

// Serialization helpers for Ergo registers
private serializeInt(value: number): string {
  // Convert to hex string for Ergo register
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setInt32(0, value, false);
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

private serializeLong(value: number): string {
  // Convert to hex string for Ergo register
  const buffer = new ArrayBuffer(8);
  new DataView(buffer).setBigInt64(0, BigInt(value), false);
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

private serializeLongArray(values: number[]): string {
  // Serialize array of longs
  let result = '';
  result += this.serializeInt(values.length); // Array length
  for (const value of values) {
    result += this.serializeLong(value);
  }
  return result;
}

private serializeGroupElement(pubKey: string): string {
  // Convert public key to group element format
  // This needs proper implementation based on your public key format
  return pubKey;
}

private serializeByteArray(data: Uint8Array): string {
  // Convert byte array to hex string
  return Array.from(data)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

  async fetch_bounties(offset: number = 0): Promise<Map<string, Bounty>> {
    try {
      const response = await fetch(`${explorer_uri}/api/v1/bounties?offset=${offset}`);
      const data = await response.json();
      return new Map(data.map((b: any) => [b.id, this._transformBounty(b)]));
    } catch (error) {
      console.error("Failed to fetch bounties:", error);
      return new Map();
    }
  }

  async getBountyById(id: string): Promise<Bounty> {
    try {
      const response = await fetch(`${explorer_uri}/api/v1/bounties/${id}`);
      return this._transformBounty(await response.json());
    } catch (error) {
      console.error(`Failed to fetch bounty ${id}:`, error);
      throw new Error("Bounty not found");
    }
  }

  private _transformBounty(apiData: any): Bounty {
    return {
      id: apiData.id,
      bounty_id: apiData.bounty_id,
      title: apiData.title,
      description: apiData.description,
      reward: apiData.reward,
      status: apiData.status,
      deadline: apiData.deadline,
      creator: apiData.creator,
      reward_amount: apiData.reward_amount,
      min_submissions: apiData.min_submissions || 1,
      total_submissions: apiData.total_submissions || 0,
      accepted_submissions: apiData.accepted_submissions || 0,
      rejected_submissions: apiData.rejected_submissions || 0,
      content: apiData.content || '',
      creator_pub_key: apiData.creator_pub_key || '',
      current_height: apiData.current_height || 0,
      token_details: apiData.token_details || {},
      value: apiData.value || 0,
      constants: apiData.constants || {},
      version: apiData.version || 'v1',
      metadata_root: apiData.metadata_root || '',
      submissions_root: apiData.submissions_root || '',
      platform: this,
      box: {
        boxId: apiData.boxId,
        value: apiData.value,
        ergoTree: apiData.ergoTree,
        assets: apiData.assets || [],
        creationHeight: apiData.creationHeight,
        transactionId: apiData.transactionId || '',
        index: apiData.index || 0,
        additionalRegisters: apiData.additionalRegisters || {}
      }
    };
  }

  async submit_solution(
    bounty: Bounty,
    solutionData: string,
    submissionMetadata?: Record<string, unknown>
  ): Promise<string | null> {
    try {
      if (!window.ergo) throw new Error("Wallet not connected");
      // Implementation for submitting solution
      const tx = await window.ergo.submit_tx({
        /* transaction details */
      });
      return tx;
    } catch (error) {
      console.error("Failed to submit solution:", error);
      return null;
    }
  }

  async judge_submission(
    bounty: Bounty,
    submissionId: number,
    accepted: boolean
  ): Promise<string | null> {
    try {
      if (!window.ergo) throw new Error("Wallet not connected");
      // Implementation for judging submission
      const tx = await window.ergo.submit_tx({
        /* transaction details */
      });
      return tx;
    } catch (error) {
      console.error("Failed to judge submission:", error);
      return null;
    }
  }

  async withdraw_reward(bounty: Bounty): Promise<string | null> {
    try {
      if (!window.ergo) throw new Error("Wallet not connected");
      // Implementation for withdrawing reward
      const tx = await window.ergo.submit_tx({
        /* transaction details */
      });
      return tx;
    } catch (error) {
      console.error("Failed to withdraw reward:", error);
      return null;
    }
  }

  async refund_bounty(bounty: Bounty): Promise<string | null> {
    try {
      if (!window.ergo) throw new Error("Wallet not connected");
      // Implementation for refunding bounty
      const tx = await window.ergo.submit_tx({
        /* transaction details */
      });
      return tx;
    } catch (error) {
      console.error("Failed to refund bounty:", error);
      return null;
    }
  }

  async claimBounty(bounty: Bounty): Promise<string> {
    try {
      if (!window.ergo) throw new Error("Wallet not connected");
      // Implementation for claiming bounty
      const tx = await window.ergo.submit_tx({
        /* transaction details */
      });
      return tx;
    } catch (error) {
      console.error("Failed to claim bounty:", error);
      throw new Error("Failed to claim bounty");
    }
  }

  async cancelBounty(bounty: Bounty): Promise<string> {
    try {
      if (!window.ergo) throw new Error("Wallet not connected");
      // Implementation for canceling bounty
      const tx = await window.ergo.submit_tx({
        /* transaction details */
      });
      return tx;
    } catch (error) {
      console.error("Failed to cancel bounty:", error);
      throw new Error("Failed to cancel bounty");
    }
  }
}

// Singleton instance
export const ergoPlatform = new ErgoPlatform();