import type { ErgoPlatform } from "$lib/ergo/platform";
import { type Bounty } from "../common/bounty";
import { type contract_version } from "../ergo/contract";

export interface Platform {
    id: string;  // ergo, ethereum ...
    main_token: string; // ERG, ETH ...
    icon: string;  // Icon path or url.
    time_per_block: number; // milliseconds
    last_version: contract_version;
    
    // Common methods
    connect(): Promise<void>;
    get_current_height(): Promise<number>;
    get_balance(id?: string): Promise<Map<string, number>>;
    
    // Bounty-specific methods
    create_bounty(
        title: string, 
        description: string, 
        reward: number,
        deadline: number, 
        min_submissions: number, 
        creator: string, 
        metadata: string,
    ): Promise<string | null>;
    
    submit_solution(
        bounty: Bounty,
        solutionData: string,
        submissionMetadata?: Record<string, unknown>
    ): Promise<string | null>;
    
    judge_submission(
        bounty: Bounty,
        submissionId: number,
        accepted: boolean
    ): Promise<string | null>;
    
    withdraw_reward(bounty: Bounty): Promise<string | null>;
    refund_bounty(bounty: Bounty): Promise<string | null>;
    fetch_bounties(): Promise<Map<string, Bounty>>;
    getBountyById(id: string): Promise<Bounty>;
    claimBounty(bounty: Bounty): Promise<string>;
    cancelBounty(bounty: Bounty): Promise<string>;
}

export interface BountyMetadata {
    title: string;
    description: string;
    category: string;
    tags: string[];
    status: string;
    image?: string;
    attachments?: string[];
}