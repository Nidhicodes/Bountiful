// src/lib/ergo/actions/withdraw_reward.ts
import {
    OutputBuilder,
    RECOMMENDED_MIN_FEE_VALUE,
    TransactionBuilder,
    SAFE_MIN_BOX_VALUE
} from '@fleet-sdk/core';
import { type Bounty } from '$lib/common/bounty';

declare const ergo: any;

/**
 * Withdraw reward for a successful submission
 */
export async function withdraw_reward(
    bounty: Bounty,
    winnerAddress: string,
    submissionId: string
): Promise<string|null> {
    
    // Verify there's an accepted submission
    if (!bounty.accepted_submissions || bounty.accepted_submissions <= 0) {
        alert("No accepted submissions for this bounty");
        return null;
    }
    
    // Verify minimum submissions requirement is met
    if ((bounty.total_submissions ?? 0) < (bounty.min_submissions || 0)) {
        alert("Minimum submission requirement not met");
        return null;
    }
    
    // Get the wallet address (caller address)
    const walletPk = await ergo.get_change_address();
    
    // Get the UTXOs from the current wallet to use as inputs
    const inputs = [bounty.box, ...(await ergo.get_utxos())];

    // Platform fee calculation
    const minerFee = 1100000; // Base miner fee
    const platformFeePercent = bounty.constants.platform_fee_percent || 10; // 1% = 10
    const platformFee = Math.floor(((bounty.reward_amount || 0) * platformFeePercent) / 1000);
    
    // Winner amount calculation
    const winnerAmount = (bounty.reward_amount || 0) - platformFee - minerFee;
    
    // Outputs for the transaction
    let outputs = [
        // Winner output
        new OutputBuilder(
            BigInt(winnerAmount),
            winnerAddress
        ),
        
        // Platform fee output
        new OutputBuilder(
            BigInt(platformFee),
            bounty.constants.dev_addr || ''
        )
    ];

    // Building the unsigned transaction
    const unsignedTransaction = await new TransactionBuilder(await ergo.get_current_height())
        .from(inputs)
        .to(outputs)
        .sendChangeTo(walletPk)
        .payFee(BigInt(minerFee))
        .build()
        .toEIP12Object();

    try {
        // Sign the transaction
        const signedTransaction = await ergo.sign_tx(unsignedTransaction);

        // Send the transaction to the Ergo network
        const transactionId = await ergo.submit_tx(signedTransaction);

        console.log("Transaction id -> ", transactionId);
        return transactionId;
    } catch (e) {
        console.log(e);
        return null;
    }
}