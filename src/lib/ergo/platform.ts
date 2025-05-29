// src/ergo/platform.ts
import type { Platform } from '../common/platform';
import type { Bounty } from '../common/bounty';
import { explorer_uri, network_id } from './envs';
import { address, connected, network, balance } from "../common/store";
import type { contract_version } from './contract';
import type { Box, Amount } from '@fleet-sdk/core';

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
    minSubmissions: number = 1
  ): Promise<string | null> {
    try {
      if (!window.ergo) throw new Error("Wallet not connected");

      const tx = await window.ergo.submit_tx({
        outputs: [{
          value: rewardNanoErg.toString(),
          ergoTree: "YOUR_BOUNTY_CONTRACT_ERGOTREE_HERE",
          assets: [],
          registers: {
            R4: title,
            R5: description,
            R6: deadlineBlock.toString(),
            R7: minSubmissions.toString()
          }
        }],
        inputs: [],
        fee: 1_000_000 // 0.001 ERG
      });

      return tx;
    } catch (error) {
      console.error("Bounty creation failed:", error);
      return null;
    }
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