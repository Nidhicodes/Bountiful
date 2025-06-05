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

declare const ergo: {
    get_change_address(): Promise<string>;
    get_utxos(): Promise<any[]>;
    get_current_height(): Promise<number>;
    sign_tx(tx: any): Promise<any>;
    submit_tx(tx: any): Promise<string>;

};

async function get_token_data(token_id: string): Promise<{amount: number, decimals: number}> {
    let token_fetch = await fetch_token_details(token_id);
    let id_token_amount = token_fetch['emissionAmount'] ?? 0;
    if (id_token_amount === 0) { alert(token_id+" token emission amount is 0."); throw new Error(token_id+" token emission amount is 0.") }
    id_token_amount += 1;
    return {"amount": id_token_amount, "decimals": token_fetch['decimals']}
}

function playBeep(frequency = 1000, duration = 3000) {
    const audioCtx = new window.AudioContext();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    setTimeout(() => {
        oscillator.stop();
    }, duration);
}

async function mint_bounty_tx(title: string, constants: ConstantContent, version: contract_version, amount: number, decimals: number): Promise<Box> {
    // Get the wallet address (will be the bounty address)
    const walletPk = await ergo.get_change_address();

    // Get the UTXOs from the current wallet to use as inputs
    const inputs = await ergo.get_utxos();

    let outputs: OutputBuilder[] = [
        new OutputBuilder(
            SAFE_MIN_BOX_VALUE,
            mint_contract_address(constants, version)
        )
        .mintToken({ 
            amount: BigInt(amount),
            name: title+" ABT",    // ABT = Assignment Bounty Token
            decimals: decimals, 
            description: "Bounty Token for " + title + ". Holders can claim the bounty reward upon successful completion."
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

    console.log("Bounty mint tx id: "+transactionId);

    let box = await wait_until_confirmation(transactionId);
    if (box == null) {
        alert("Bounty mint tx failed.")
        throw new Error("Bounty mint tx failed.")
    }

    console.log("Bounty token created "+ (await fetch_token_details(inputs[0].boxId)).name)
    console.log("Bounty token minted id: "+inputs[0].boxId)
    return box
}

// Function to submit a bounty to the blockchain
export async function submit_bounty(
    version: contract_version,
    token_id: string, 
    token_amount: number,
    blockLimit: number,     // Block height until bounty expires
    rewardAmount: number,   // Reward amount in ERG
    bountyContent: string,  // Bounty description and requirements
    minimumParticipants: number, // Minimum participants required
    title: string
): Promise<string|null> {

    // Get the wallet address (will be the bounty creator address)
    const walletPk = await ergo.get_change_address();

    let addressContent: ConstantContent = {
        "owner": walletPk,
        "dev_addr": get_dev_contract_address(),
        "dev_hash": get_dev_contract_hash(),
        "dev_fee": get_dev_fee(),
        "token_id": token_id
    };

    // Get token emission amount
    let token_data = await get_token_data(token_id);
    let id_token_amount = token_data["amount"];

    // Build the mint tx for the bounty token
    let mint_box = await mint_bounty_tx(title, addressContent, version, id_token_amount, token_data["decimals"]);
    let bounty_id = mint_box.assets[0].tokenId;

    if (bounty_id === null) { alert("Bounty token minting failed!"); return null; }

    // Get the UTXOs from the current wallet to use as inputs
    const inputs = [mint_box, ...await ergo.get_utxos()];

    // Building the bounty output
    let outputs: OutputBuilder[] = [
        new OutputBuilder(
            SAFE_MIN_BOX_VALUE + BigInt(rewardAmount), // Include reward amount in box value
            get_address(addressContent, version)       // Address of the bounty contract
        )
        .addTokens({
            tokenId: bounty_id,
            amount: BigInt(id_token_amount)  // The mint contract forces to spend all the id_token_amount
        })
        .addTokens({
            tokenId: token_id ?? "",
            amount: token_amount.toString()
        })
        .setAdditionalRegisters({
           R4: SInt(blockLimit).toHex(),                              // Block limit for bounty expiration
           R5: SLong(BigInt(minimumParticipants)).toHex(),            // Minimum participants required
           R6: SColl(SLong, [BigInt(0), BigInt(0)]).toHex(),          // Pair [Participants counter, Completed counter]
           R7: SLong(BigInt(rewardAmount)).toHex(),                  // Reward amount in ERG
           R8: SString(JSON.stringify(addressContent)),              // Owner address, dev address and dev fee
           R9: SString(bountyContent)                                // Bounty content and requirements
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

    try {
        playBeep();
    } catch (error) {
        console.error('Error executing play beep:', error);
    }

    // Sign the transaction
    const signedTransaction = await ergo.sign_tx(unsignedTransaction);

    // Send the transaction to the Ergo network
    const transactionId = await ergo.submit_tx(signedTransaction);

    console.log("Bounty transaction id -> ", transactionId);
    return transactionId;
}