// src/lib/ergo/actions/submit_bounty.ts
import {
    OutputBuilder,
    SAFE_MIN_BOX_VALUE,
    RECOMMENDED_MIN_FEE_VALUE,
    TransactionBuilder,
    SLong,
    type Box
} from '@fleet-sdk/core';
import { SColl, SInt } from '@fleet-sdk/serializer';
import { SString } from '../utils';
import { type contract_version, get_address, mint_contract_address } from '../contract';
import { type ConstantContent } from '$lib/common/bounty';
import { get_dev_contract_address, get_dev_contract_hash, get_dev_fee } from '../dev/dev_contract';
import { fetch_token_details, wait_until_confirmation } from '../fetch';

declare const ergo: any;

async function get_token_data(token_id: string): Promise<{amount: number, decimals: number}> {
    let token_fetch = await fetch_token_details(token_id);
    let id_token_amount = token_fetch['emissionAmount'] ?? 0;
    if (id_token_amount === 0) { alert(token_id+" token emission amount is 0."); throw new Error(token_id+" token emission amount is 0.") }
    id_token_amount += 1;
    return {"amount": id_token_amount, "decimals": token_fetch['decimals']}
}

async function mint_tx(title: string, constants: ConstantContent, version: contract_version, amount: number, decimals: number): Promise<Box> {
    // Get the wallet address
    const walletPk = await ergo.get_change_address();

    // Get the UTXOs from the current wallet to use as inputs
    const inputs = await ergo.get_utxos();

    // Create the mint output
    let outputs = [
        new OutputBuilder(
            SAFE_MIN_BOX_VALUE, // Minimum value in ERG that a box can have
            mint_contract_address(constants, version)
        )
        .mintToken({ 
            amount: BigInt(amount),
            name: title+" Bounty Token",
            decimals: decimals, 
            description: "Bounty token for the " + title + " bounty."
        }) 
    ]

    // Building the unsigned transaction
    const unsignedTransaction = await new TransactionBuilder(await ergo.get_current_height())
        .from(inputs)
        .to(outputs)
        .sendChangeTo(walletPk)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build()
        .toEIP12Object();

    // Sign the transaction
    const signedTransaction = await ergo.sign_tx(unsignedTransaction);

    // Send the transaction to the Ergo network
    const transactionId = await ergo.submit_tx(signedTransaction);

    console.log("Mint tx id: "+transactionId);

    let box = await wait_until_confirmation(transactionId);
    if (box == null) {
        alert("Mint tx failed.")
        throw new Error("Mint tx failed.")
    }

    console.log("Token created "+ (await fetch_token_details(inputs[0].boxId)).name)
    console.log("Token minted id: "+inputs[0].boxId)
    return box
}

/**
 * Create a new bounty on the blockchain
 */
export async function submit_bounty(
    version: contract_version,
    token_id: string,
    reward_amount: number,
    deadline: number,        // Block height until which submissions are accepted
    min_submissions: number, // Minimum submissions required
    bountyContent: string,   // Bounty content (metadata, description, etc.)
    title: string
): Promise<string|null> {
    
    // Get the wallet address (will be the bounty creator address)
    const walletPk = await ergo.get_change_address();

    // Define constants structure with owner and dev addresses
    let constantContent: ConstantContent = {
        "creator": walletPk,
        "owner": walletPk,
        "dev_addr": get_dev_contract_address(),
        "dev_hash": get_dev_contract_hash(),
        "dev_fee": get_dev_fee(),
        "token_id": token_id
    };

    // Get token emission amount for the minted bounty token
    const token_data = await get_token_data(token_id);
    const bounty_token_amount = 1; // We only need 1 bounty token per bounty

    // Build the mint tx to create the bounty token
    let mint_box = await mint_tx(title, constantContent, version, token_data["amount"], token_data["decimals"]);
    let bounty_id = mint_box.assets[0].tokenId;

    if (bounty_id === null) { alert("Token minting failed!"); return null; }

    // Get the UTXOs from the current wallet to use as inputs
    const inputs = [mint_box, ...await ergo.get_utxos()];

    // Generate empty submission and judgment roots (can be any 32-byte hash)
    const submissionsRoot = '0000000000000000000000000000000000000000000000000000000000000000';
    const judgmentsRoot = '0000000000000000000000000000000000000000000000000000000000000000';
    
    // Generate metadata root from the bounty content
    // In a real implementation, this would hash the metadata portion
    const metadataRoot = '0000000000000000000000000000000000000000000000000000000000000000';
    
    // Combine the roots and content for R9
    const fullBountyData = submissionsRoot + judgmentsRoot + metadataRoot + bountyContent;

    // Building the bounty output
    let outputs = [
        new OutputBuilder(
            BigInt(reward_amount) + SAFE_MIN_BOX_VALUE, // Box value = reward amount + min box value
            get_address(constantContent, version)       // Address of the bounty contract
        )
        .addTokens({
            tokenId: bounty_id,
            amount: BigInt(bounty_token_amount)         // Always 1 bounty token
        })
        .setAdditionalRegisters({
           R4: SInt(deadline).toHex(),                                 // Deadline block height
           R5: SLong(BigInt(min_submissions)).toHex(),                 // Minimum submissions required
           R6: SColl(SLong, [BigInt(0), BigInt(0), BigInt(0)]).toHex(), // Stats: [total, accepted, rejected]
           R7: SLong(BigInt(reward_amount)).toHex(),                   // Reward amount in nanoERG
           R8: SString(JSON.stringify(constantContent)),               // Creator address, dev address, etc.
           R9: SString(fullBountyData)                                 // Bounty data with roots and content
        })
    ];

    // Building the unsigned transaction
    const unsignedTransaction = await new TransactionBuilder(await ergo.get_current_height())
        .from(inputs)
        .to(outputs)
        .sendChangeTo(walletPk)
        .payFee(RECOMMENDED_MIN_FEE_VALUE)
        .build()
        .toEIP12Object();

    // Sign the transaction
    const signedTransaction = await ergo.sign_tx(unsignedTransaction);

    // Send the transaction to the Ergo network
    const transactionId = await ergo.submit_tx(signedTransaction);

    console.log("Transaction id -> ", transactionId);
    return transactionId;
}