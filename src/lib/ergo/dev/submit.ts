import {
    OutputBuilder,
    SAFE_MIN_BOX_VALUE,
    RECOMMENDED_MIN_FEE_VALUE,
    TransactionBuilder,
    SLong,
    SColl,
    SInt
} from '@fleet-sdk/core';
import { get_dev_contract_address, get_dev_contract_hash, get_dev_fee } from './dev_contract';
// Define Asset and UTXO types locally as they are not exported from '@fleet-sdk/core'
type Asset = {
    tokenId: string;
    amount: bigint;
};

type UTXO = {
    boxId: string;
    value: bigint;
    assets?: Asset[];
    additionalRegisters?: Record<string, any>;
};
import { ErgoPlatform } from '../platform';
import { wait_until_confirmation } from '..//fetch';

// Declare ergo object for TypeScript
declare const ergo: {
    get_change_address(): Promise<string>;
    get_utxos(): Promise<any[]>;
    get_current_height(): Promise<number>;
    get_public_keys(): Promise<string[]>;
    sign_tx(tx: any): Promise<any>;
    submit_tx(tx: any): Promise<string>;
};

/**
 * Creates a test submission to the dev fee contract
 * Used for testing the fee collection mechanism
 */
export async function submit_test(): Promise<string> {
    try {
        const platform = new ErgoPlatform();
        await platform.connect();
        
        const walletPk = await ergo.get_change_address();
        const inputs = await ergo.get_utxos();
        const devAddress = get_dev_contract_address();
        
        const devOutput = new OutputBuilder(
            BigInt(5) * SAFE_MIN_BOX_VALUE,
            devAddress
        );
        
        const unsignedTransaction = await new TransactionBuilder(await ergo.get_current_height())
            .from(inputs)
            .to([devOutput])
            .sendChangeTo(walletPk)
            .payFee(RECOMMENDED_MIN_FEE_VALUE)
            .build()
            .toEIP12Object();
            
        const signedTransaction = await ergo.sign_tx(unsignedTransaction);
        const transactionId = await ergo.submit_tx(signedTransaction);
        
        await wait_until_confirmation(transactionId);
        return transactionId;
    } catch (error) {
        console.error("Error submitting test transaction:", error);
        throw new Error("Failed to submit test transaction");
    }
}

/**
 * Creates a bounty on the Bountiful platform
 */
export async function create_bounty(
    tokenId: string,
    rewardAmount: bigint,
    deadline: number,
    minSubmissions: number,
    metadata: Record<string, any> = {}
): Promise<string> {
    try {
        const platform = new ErgoPlatform();
        await platform.connect();
        
        const currentHeight = await ergo.get_current_height();
        const actualDeadline = deadline > 0 ? deadline : currentHeight + 1000;
        const creatorAddress = await ergo.get_change_address();
        const creatorPubKey = await ergo.get_public_keys();
        
        if (!creatorPubKey || creatorPubKey.length === 0) {
            throw new Error("Could not get creator public key");
        }
        
        const allUtxos = await ergo.get_utxos();
        const tokenUtxo: UTXO | undefined = allUtxos.find((utxo: UTXO) => 
            utxo.assets?.some((asset: Asset) => asset.tokenId === tokenId)
        );
        
        if (!tokenUtxo) {
            throw new Error(`Token with ID ${tokenId} not found in wallet`);
        }
        
        const bountyContractAddress = get_bounty_contract_address(); // Implement this based on your contract
        
        const bountyOutput = new OutputBuilder(
            rewardAmount + SAFE_MIN_BOX_VALUE,
            bountyContractAddress
        )
        .addTokens([{
            tokenId: tokenId,
            amount: "1"
        }])
        .setAdditionalRegisters({
            R4: SInt(actualDeadline).toHex(),
            R5: SInt(minSubmissions).toHex(),
            R6: SColl(SLong, [0n, 0n, 0n]).toHex(),
            R7: SLong(rewardAmount).toHex(),
            R8: encodeStringToCollHex(creatorPubKey[0]),
            R9: encodeStringToCollHex(JSON.stringify({
                metadata,
                submissions: {},
                judgments: {}
            }))
        });

        // Helper functions
    function encodeStringToCollHex(str: string): string {
        const bytes = new TextEncoder().encode(str);
        const intArray = Array.from(bytes);
        return SColl(SInt, intArray).toHex();
    }
        
        const unsignedTransaction = await new TransactionBuilder(currentHeight)
            .from([tokenUtxo, ...allUtxos.filter(utxo => utxo.boxId !== tokenUtxo.boxId)])
            .to([bountyOutput])
            .sendChangeTo(creatorAddress)
            .payFee(RECOMMENDED_MIN_FEE_VALUE)
            .build()
            .toEIP12Object();
            
        const signedTransaction = await ergo.sign_tx(unsignedTransaction);
        const transactionId = await ergo.submit_tx(signedTransaction);
        
        await wait_until_confirmation(transactionId);
        return transactionId;
    } catch (error) {
        console.error("Error creating bounty:", error);
        throw new Error("Failed to create bounty");
    }
}

// Helper function - implement according to your contract logic
function get_bounty_contract_address(): string {
    // Return your actual bounty contract address
    throw new Error("Implement bounty contract address logic");
}