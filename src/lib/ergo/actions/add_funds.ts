// src/lib/ergo/actions/add_funds.ts
import {
    OutputBuilder,
    RECOMMENDED_MIN_FEE_VALUE,
    TransactionBuilder,
    SLong,
    SInt,
    SAFE_MIN_BOX_VALUE
} from '@fleet-sdk/core';
import { SString } from '../utils';
import { type Bounty } from '$lib/common/bounty';
import { get_address } from '../contract';
import { SColl } from '@fleet-sdk/serializer';

/**
 * Add more funds to an existing bounty
 */
export async function add_funds(
    bounty: Bounty,
    additionalAmount: number
): Promise<string|null> {
    
    // Only the creator can add funds
    // Ensure 'ergo' is globally available or imported
    const walletPk = await (window as any).ergo?.get_change_address();
    
    // Verify the caller is the bounty creator
    if (walletPk !== bounty.creator) {
        alert("Only the bounty creator can add more funds");
        return null;
    }
    
    // Get the UTXOs from the current wallet to use as inputs
    const ergo = (window as any).ergo;
    if (!ergo) {
        throw new Error("Ergo wallet is not available");
    }
    const inputs = [bounty.box, ...(await ergo.get_utxos())];

    // Calculate the new box value and reward amount
    const newBoxValue = (bounty.value || 0) + additionalAmount;
    const newRewardAmount = (bounty.reward_amount || 0) + additionalAmount;

    // Create the BountyAddressContent object with the required creator property
    const addressContent = {
        ...bounty.constants,
        creator: bounty.creator || bounty.constants.owner // Use bounty.creator or fall back to owner
    };

    // Building the updated bounty output
    let contractOutput = new OutputBuilder(
        BigInt(newBoxValue),
        get_address(addressContent, (bounty.version as contract_version) || 'v1') // Replace 'v1' with an appropriate default contract_version
    )
    .addTokens({
        tokenId: bounty.token_details.token_id || '',
        amount: BigInt(1) // Always 1 bounty token
    });

    contractOutput.setAdditionalRegisters({
        R4: SInt(bounty.deadline || 0).toHex(),
        R5: SLong(BigInt(bounty.min_submissions || 0)).toHex(),
        R6: SColl(SLong, [
            BigInt(bounty.total_submissions || 0),
            BigInt(bounty.accepted_submissions || 0),
            BigInt(bounty.rejected_submissions || 0)
        ]).toHex(),
        R7: SLong(BigInt(newRewardAmount)).toHex(), // Updated reward amount
        R8: SString(bounty.constants.raw || ''),
        R9: SString(bounty.content.raw || '')
    });

    // Building the unsigned transaction
    const unsignedTransaction = await new TransactionBuilder(await ergo.get_current_height())
        .from(inputs)
        .to([contractOutput])
        .sendChangeTo(walletPk)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
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