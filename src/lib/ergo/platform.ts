// src/ergo/platform.ts
import type { Platform } from '../common/platform';
import type { Bounty } from '../common/bounty';
import { fetch_bounties } from './fetch';
import { submit_bounty } from './actions/submit_bounty';
import { withdraw } from './actions/withdraw_reward';
import { refund_bounty } from './actions/refund_bounty';
import { add_funds } from './actions/add_funds';
import { extend_deadline } from './actions/extend_deadline';
import { update_metadata } from './actions/update_metadata';
import { submit_solution } from './actions/submit_solution';
import { judge_submission } from './actions/judge_submission';
import { explorer_uri, network_id } from './envs';
import { address, connected, network, balance } from "../common/store";
import { type contract_version } from './contract';

// Type declarations for Ergo globals - Updated to match types.d.ts
declare global {
  interface Window {
    ergoConnector?: {
      nautilus?: {
        connect(): Promise<boolean>;
        isConnected(): Promise<boolean>;
      };
    };
    ergo?: {
      get_change_address(): Promise<string>;
      get_utxos(): Promise<any[]>;
      get_current_height(): Promise<number>;
      sign_tx(tx: any): Promise<any>;
      submit_tx(tx: any): Promise<string>;
    };
  }
}

export class ErgoPlatform implements Platform {
  id = "ergo";
  main_token = "ERG";
  icon = ""; // Add proper icon
  time_per_block = 2 * 60 * 1000; // 2 minutes per block
  last_version: contract_version = "v1_1";
  private creatorAddress: string = '';

  // --- Wallet Connection ---
  async connect(): Promise<void> {
    if (typeof window !== 'undefined' && window.ergoConnector) {
      const nautilus = window.ergoConnector.nautilus;
      if (nautilus) {
        if (await nautilus.connect()) {
          console.log('Connected!');
          if (window.ergo) {
            const userAddress = await window.ergo.get_change_address();
            address.set(userAddress);
            this.creatorAddress = userAddress;
            network.set((network_id == "mainnet") ? "ergo-mainnet" : "ergo-testnet");
            await this.get_balance();
            connected.set(true);
          } else {
            throw new Error('Ergo API not available');
          }
        } else {
          throw new Error('Failed to connect to wallet');
        }
      } else {
        throw new Error('Nautilus Wallet is not active');
      }
    } else {
      throw new Error('No wallet connector available');
    }
  }

  async disconnect(): Promise<void> {
    connected.set(false);
    address.set('');
    balance.set(0);
    this.creatorAddress = '';
  }

  async get_current_height(): Promise<number> {
    try {
      // If connected to the Ergo wallet, get the current height directly
      if (window.ergo) {
        return await window.ergo.get_current_height();
      }
      throw new Error('Ergo API not available');
    } catch {
      // Fallback to fetching the current height from the Ergo API
      try {
        const response = await fetch(explorer_uri + '/api/v1/networkState');
        if (!response.ok) {
          throw new Error(`API request failed with status: ${response.status}`);
        }

        const data = await response.json();
        return data.height;
      } catch (error) {
        console.error("Failed to fetch network height from API:", error);
        throw new Error("Unable to get current height.");
      }
    }
  }

  async get_balance(id?: string): Promise<Map<string, number>> {
    const balanceMap = new Map<string, number>();
    
    if (!window.ergo) {
      throw new Error('Ergo API not available');
    }
    
    const addr = await window.ergo.get_change_address();

    if (addr) {
      try {
        const response = await fetch(explorer_uri + `/api/v1/addresses/${addr}/balance/confirmed`);
        if (!response.ok) {
          throw new Error(`API request failed with status: ${response.status}`);
        }

        const data = await response.json();

        // Add nanoErgs balance to the map
        balanceMap.set("ERG", data.nanoErgs);
        balance.set(data.nanoErgs);

        // Add tokens balances to the map
        data.tokens.forEach((token: { tokenId: string; amount: number }) => {
          balanceMap.set(token.tokenId, token.amount);
        });
      } catch (error) {
        console.error(`Failed to fetch balance for address ${addr} from API:`, error);
        throw new Error("Unable to fetch balance.");
      }
    } else {
      throw new Error("Address is required to fetch balance.");
    }

    return balanceMap;
  }

  // --- Core Bounty Management ---
  async submit(
    title: string,
    description: string,
    reward: number,
    deadline: number,
    min_submissions: number,
    creator: string,
    metadata: string
  ): Promise<string | null> {
    try {
      const result = await submit_bounty(
        this.last_version,
        title,
        description,
        reward,
        deadline,
        min_submissions,
        creator,
        this._serializeMetadata(metadata)
      );
      return result;
    } catch (error) {
      console.error('Failed to submit bounty:', error);
      return null;
    }
  }

  // Fixed method name to match Platform interface
  async withdraw_reward(bounty: Bounty, winnerAddress: string, submissionId: string): Promise<string | null> {
    try {
      return await withdraw(bounty, winnerAddress, submissionId);
    } catch (error) {
      console.error('Failed to withdraw reward:', error);
      return null;
    }
  }

  // Keep the original method for backward compatibility
  async withdraw(bounty: Bounty, winnerAddress: string, submissionId: string): Promise<string | null> {
    return this.withdraw_reward(bounty, winnerAddress, submissionId);
  }

  async refund_bounty(bounty: Bounty): Promise<string | null> {
    try {
      return await refund_bounty(bounty);
    } catch (error) {
      console.error('Failed to refund bounty:', error);
      return null;
    }
  }

  async fetch_bounties(): Promise<Map<string, Bounty>> {
    try {
      const bounties = await fetch_bounties();
      const bountyMap = new Map<string, Bounty>();
      
      // Convert array to Map using bounty ID as key
      bounties.forEach(bounty => {
        if (bounty.id) {
          bountyMap.set(bounty.id, bounty);
        }
      });
      
      return bountyMap;
    } catch (error) {
      console.error('Failed to fetch bounties:', error);
      return new Map();
    }
  }

  // Added missing method required by Platform interface
  async getBountyById(id: string): Promise<Bounty | null> {
    try {
      const bounties = await this.fetch_bounties();
      return bounties.get(id) || null;
    } catch (error) {
      console.error('Failed to get bounty by ID:', error);
      return null;
    }
  }

  // --- Extended Bounty Management ---
  async addMoreFunds(bounty: Bounty, additionalAmount: number): Promise<string | null> {
    try {
      return await add_funds(bounty, additionalAmount);
    } catch (error) {
      console.error('Failed to add funds:', error);
      return null;
    }
  }

  async extendDeadline(bounty: Bounty, newDeadlineBlock: number): Promise<string | null> {
    try {
      return await extend_deadline(bounty, newDeadlineBlock);
    } catch (error) {
      console.error('Failed to extend deadline:', error);
      return null;
    }
  }

  async updateMetadata(bounty: Bounty, newMetadata: string): Promise<string | null> {
    try {
      return await update_metadata(bounty, this._serializeMetadata(newMetadata));
    } catch (error) {
      console.error('Failed to update metadata:', error);
      return null;
    }
  }

  // --- Submission Management ---
  async submit_solution(bounty: Bounty, solution: string): Promise<string | null> {
    try {
      return await submit_solution(bounty, solution);
    } catch (error) {
      console.error('Failed to submit solution:', error);
      return null;
    }
  }

  // Keep the original method for backward compatibility
  async submitSolution(bounty: Bounty, solution: string): Promise<string | null> {
    return this.submit_solution(bounty, solution);
  }

  async judge_submission(bounty: Bounty, submissionId: string, accepted: boolean): Promise<string | null> {
    try {
      // Create default judgment data if needed
      const judgmentData = JSON.stringify({
        submissionId,
        accepted,
        timestamp: Date.now(),
        judgedBy: this.creatorAddress
      });
      
      return await judge_submission(bounty, submissionId, accepted, judgmentData);
    } catch (error) {
      console.error('Failed to judge submission:', error);
      return null;
    }
  }

  // Keep the original method for backward compatibility
  async judgeSubmission(bounty: Bounty, submissionId: string, accepted: boolean): Promise<string | null> {
    return this.judge_submission(bounty, submissionId, accepted);
  }

  // Added missing method required by Platform interface
  async getAllBounties(): Promise<Bounty[]> {
    try {
      const bounties = await fetch_bounties();
      return bounties;
    } catch (error) {
      console.error('Failed to get all bounties:', error);
      return [];
    }
  }

  // Added missing method required by Platform interface
  async getSubmissions(bountyId: string): Promise<any[]> {
    try {
      // This would need to be implemented based on your submission fetching logic
      // For now, returning empty array as placeholder
      console.warn('getSubmissions not yet implemented for Ergo platform');
      return [];
    } catch (error) {
      console.error('Failed to get submissions:', error);
      return [];
    }
  }

  // --- Utility Methods ---
  private _serializeMetadata(metadata: string): string {
    try {
      // Parse the metadata JSON
      const metadataObj = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
      
      // Create the serialized format expected by contract R9 register
      // Format: [submissions_root(32), judgments_root(32), metadata_root(32)]
      const encoder = new TextEncoder();
      const metadataBytes = encoder.encode(JSON.stringify(metadataObj));
      
      // Generate hash for metadata (simplified - you might want a proper merkle root)
      const metadataHash = this._simpleHash(metadataBytes);
      
      // For new bounties, submissions and judgments roots are empty
      const emptyRoot = new Uint8Array(32).fill(0);
      
      // Combine all roots: submissions(32) + judgments(32) + metadata(32)
      const combined = new Uint8Array(96);
      combined.set(emptyRoot, 0);           // submissions root
      combined.set(emptyRoot, 32);          // judgments root  
      combined.set(metadataHash, 64);       // metadata root
      
      // Convert to hex string
      return Array.from(combined)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    } catch (error) {
      console.error('Failed to serialize metadata:', error);
      throw new Error('Invalid metadata format');
    }
  }

  private _simpleHash(data: Uint8Array): Uint8Array {
    // Simple hash function - in production you'd use blake2b256 or similar
    const hash = new Uint8Array(32);
    for (let i = 0; i < data.length; i++) {
      hash[i % 32] ^= data[i];
    }
    return hash;
  }

  // --- Validation Methods ---
  async isValidBounty(bounty: Bounty): Promise<boolean> {
    try {
      const currentHeight = await this.get_current_height();
      const deadline = bounty.deadline ?? 0;
      const reward = bounty.reward ?? 0;
      return deadline > currentHeight && reward > 0;
    } catch {
      return false;
    }
  }

  async canRefund(bounty: Bounty): Promise<boolean> {
    try {
      const currentHeight = await this.get_current_height();
      const deadline = bounty.deadline ?? 0;
      const totalSubmissions = bounty.total_submissions ?? 0;
      const minSubmissions = bounty.min_submissions ?? 0;
      const acceptedSubmissions = bounty.accepted_submissions ?? 0;
      
      return (
        currentHeight > deadline &&
        (totalSubmissions < minSubmissions || acceptedSubmissions === 0)
      );
    } catch {
      return false;
    }
  }

  async canWithdraw(bounty: Bounty): Promise<boolean> {
    try {
      const totalSubmissions = bounty.total_submissions ?? 0;
      const minSubmissions = bounty.min_submissions ?? 0;
      const acceptedSubmissions = bounty.accepted_submissions ?? 0;
      
      return (
        acceptedSubmissions > 0 &&
        totalSubmissions >= minSubmissions
      );
    } catch {
      return false;
    }
  }

  // --- Getters ---
  getCreatorAddress(): string {
    return this.creatorAddress;
  }

  isConnected(): boolean {
    return this.creatorAddress !== '';
  }
}