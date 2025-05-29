import { compile } from "@fleet-sdk/compiler";
import { Network } from "@fleet-sdk/core";
import { sha256, hex, blake2b256 } from "@fleet-sdk/crypto";
import { uint8ArrayToHex } from "./utils";
import { network_id } from "./envs";
import { get_dev_contract_hash } from "./dev/dev_contract";

export type contract_version = "v1_0" | "v1_1";

interface BountyAddressContent {
    creator: string;        // Creator's public key
    dev_addr: string;       // Development fee address
    dev_fee: number;       // Development fee percentage (e.g., 10 for 1%)
    dev_hash?: string;      // Optional development contract hash
}

function generate_contract_v1_0(creator_addr: string, dev_fee_contract_bytes_hash: string, dev_fee: number) {
    return `
{
    // ===== Contract Description ===== //
    // Name: Bountiful Bounty Platform Contract
    // Description: Enables bounty creation, submission management, and creator-based reward distribution
    // Version: 1.0.0
    // Author: Bountiful Team

    // ===== Box Contents ===== //
    // Tokens
    // 1. (id, amount)
    //    BBT (Bountiful Bounty Token); Identifies the bounty and holds the allocated reward.
    //    where:
    //       id      The unique bounty identifier
    //       amount  Always 1 for a single bounty.

    // Registers
    // R4: Int                  Block height (deadline) for the bounty
    // R5: Long                 Minimum number of submissions required
    // R6: Coll[Long]           [Total Submissions, Accepted Submissions, Rejected Submissions]
    // R7: Long                 Reward amount in ERG
    // R8: Coll[Byte]           Creator's public key (33 bytes)
    // R9: Coll[Byte]           Encoded JSON containing: bounty metadata, submissions data, judgment data

    // ===== Helper Functions ===== //
    def isSigmaPropEqualToBoxProp(prop: SigmaProp, box: Box): Boolean = {
        val propBytes: Coll[Byte] = prop.propBytes
        val treeBytes: Coll[Byte] = box.propositionBytes

        if (treeBytes(0) == 0) {
            (treeBytes == propBytes)
        } else {
            // offset = 1 + <number of VLQ encoded bytes to store propositionBytes.size>
            val offset = if (treeBytes.size > 127) 3 else 2
            (propBytes.slice(1, propBytes.size) == treeBytes.slice(offset, treeBytes.size))
        }
    }

    // ===== Box Data Extraction ===== //
    val selfId = SELF.tokens(0)._1
    val selfBountyToken = SELF.tokens(0)._2
    val selfValue = SELF.value
    val selfDeadline = SELF.R4[Int].get
    val selfMinSubmissions = SELF.R5[Long].get
    val selfSubmissionStats = SELF.R6[Coll[Long]].get
    val selfTotalSubmissions = selfSubmissionStats(0)
    val selfAcceptedSubmissions = selfSubmissionStats(1)
    val selfRejectedSubmissions = selfSubmissionStats(2)
    val selfRewardAmount = SELF.R7[Long].get
    val creatorPubKey = SELF.R8[Coll[Byte]].get
    val selfBountyData = SELF.R9[Coll[Byte]].get
    val selfScript = SELF.propositionBytes

    // Parse metadata
    val submissionsRoot = selfBountyData.slice(0, 32)
    val judgmentsRoot = selfBountyData.slice(32, 64)
    val metadataRoot = selfBountyData.slice(64, 96)

    // Creator SigmaProp
    val creatorProp = proveDlog(creatorPubKey.toGroupElement)

    // Output box reference for validation
    val outBox = OUTPUTS(0)

    // ===== Box Replication Validation ===== //
    val isBoxReplication = {
        // The bounty token ID must be the same
        val sameId = selfId == outBox.tokens(0)._1 && selfBountyToken == outBox.tokens(0)._2
        
        // Register values must be preserved
        val sameDeadline = selfDeadline == outBox.R4[Int].get
        val sameMinSubmissions = selfMinSubmissions == outBox.R5[Long].get
        val sameCreatorPubKey = creatorPubKey == outBox.R8[Coll[Byte]].get
        
        // Script must be the same
        val sameScript = selfScript == outBox.propositionBytes
        
        // Validate complete box replication
        sameId && sameDeadline && sameMinSubmissions && 
        sameCreatorPubKey && sameScript
    }

    // ===== Actions ===== //

    // Action: Submit a solution
    val isSubmitSolution = {
        // Can only submit before deadline
        val beforeDeadline = HEIGHT <= selfDeadline

        val correctSubmissionIncrement = {
            val newStats = outBox.R6[Coll[Long]].get
            val newTotal = newStats(0)
            val newAccepted = newStats(1)
            val newRejected = newStats(2)
            
            // Total should increase by 1, accepted and rejected remain unchanged
            newTotal == selfTotalSubmissions + 1 && 
            newAccepted == selfAcceptedSubmissions &&
            newRejected == selfRejectedSubmissions
        }

        val updatedBountyData = {
            // Verify submission data has been updated (submissions root changed)
            val newSubmissionsRoot = outBox.R9[Coll[Byte]].get.slice(0, 32)
            submissionsRoot != newSubmissionsRoot &&
            // Ensure other roots remain the same
            outBox.R9[Coll[Byte]].get.slice(32, 64) == judgmentsRoot &&
            outBox.R9[Coll[Byte]].get.slice(64, 96) == metadataRoot
        }
        
        val valueUnchanged = selfValue == outBox.value
        
        // All submission requirements must be met
        beforeDeadline && correctSubmissionIncrement && 
        updatedBountyData && isBoxReplication && valueUnchanged
    }

    // Action: Judge a submission (only creator can judge)
    val isJudgeSubmission = {
        // Creator signature validation
        val creatorSigned = creatorProp
        
        // Get decision from data input
        val decision = CONTEXT.dataInputs(0).R4[Boolean].get
        val submissionId = CONTEXT.dataInputs(0).R5[Int].get
        
        // Submission stats update based on decision
        val correctJudgmentUpdate = {
            val newStats = outBox.R6[Coll[Long]].get
            val newTotal = newStats(0)
            val newAccepted = newStats(1)
            val newRejected = newStats(2)
            
            // Total remains same
            val totalUnchanged = newTotal == selfTotalSubmissions
            
            // Either accepted or rejected increases based on decision
            val statsUpdated = if (decision) {
                newAccepted == selfAcceptedSubmissions + 1 && 
                newRejected == selfRejectedSubmissions
            } else {
                newAccepted == selfAcceptedSubmissions && 
                newRejected == selfRejectedSubmissions + 1
            }
            
            totalUnchanged && statsUpdated
        }
        
        // Verify judgment data has been updated
        val judgmentRecorded = {
            // Judgment root should be updated
            val newJudgmentsRoot = outBox.R9[Coll[Byte]].get.slice(32, 64)
            judgmentsRoot != newJudgmentsRoot &&
            // Ensure other roots remain the same
            outBox.R9[Coll[Byte]].get.slice(0, 32) == submissionsRoot &&
            outBox.R9[Coll[Byte]].get.slice(64, 96) == metadataRoot
        }
        
        val valueUnchanged = selfValue == outBox.value
        
        // All judgment requirements must be met
        creatorSigned && correctJudgmentUpdate && 
        judgmentRecorded && isBoxReplication && valueUnchanged
    }

    // Action: Withdraw reward (for successful submission)
    val isWithdrawReward = {
        // Platform fee calculation
        val minerFee = 1100000L // Base miner fee
        val platformFeePercent = ${dev_fee} // Fee percentage (e.g., 10 for 1%)
        val platformFee = selfRewardAmount * platformFeePercent / 1000
        
        // Development fee - goes to project development
        val devFee = platformFee
        
        // Verify winning submission exists
        val hasAcceptedSubmission = selfAcceptedSubmissions > 0
        
        // Verify minimum submissions met
        val hasMinimumSubmissions = selfTotalSubmissions >= selfMinSubmissions
        
        // Verify reward distribution
        val correctDistribution = {
            // Get winner address from data input
            val winnerAddress = CONTEXT.dataInputs(0).R4[SigmaProp].get
            val winnerBox = OUTPUTS(1)
            
            // Platform fee box
            val devBox = OUTPUTS(2)
            
            // Verify winner receives correct amount
            val winnerAmount = selfRewardAmount - platformFee - minerFee
            val correctWinnerPayment = winnerBox.value == winnerAmount && 
                                    isSigmaPropEqualToBoxProp(winnerAddress, winnerBox)
            
            // Verify fee distribution is correct
            val correctDevFee = devBox.value == devFee &&
                                devBox.propositionBytes == fromBase16("${dev_fee_contract_bytes_hash}").propBytes
            
            correctWinnerPayment && correctDevFee
        }
        
        // Add dispute period check
        val disputePeriodPassed = {
            val disputePeriod = 720  // ~5 days in blocks
            val judgmentHeight = CONTEXT.dataInputs(0).R5[Int].get
            
            // Ensure enough time has passed since judgment for potential concerns
            HEIGHT >= judgmentHeight + disputePeriod
        }
        
        // All withdrawal requirements must be met
        hasAcceptedSubmission && hasMinimumSubmissions &&
        correctDistribution && disputePeriodPassed
    }

    // Action: Refund (for failed bounty)
    val isRefundBounty = {
        // Can only refund after deadline
        val afterDeadline = HEIGHT > selfDeadline
        
        // Conditions for refund: either minimum submissions not met or no accepted solutions
        val canBeRefunded = afterDeadline && 
                            (selfTotalSubmissions < selfMinSubmissions || selfAcceptedSubmissions == 0)
        
        // Verify refund goes to creator
        val correctRefund = {
            val creatorBox = OUTPUTS(1)
            
            isSigmaPropEqualToBoxProp(creatorProp, creatorBox) && 
            creatorBox.value == selfRewardAmount
        }
        
        // All refund requirements must be met
        canBeRefunded && correctRefund
    }

    // Action: Add more funds to bounty
    val isAddMoreFunds = {
        // Verify creator is signing
        val creatorSigned = creatorProp
        
        // Only value should change, everything else remains same
        val onlyValueIncreased = outBox.value > selfValue && 
                                // Reward amount updated
                                outBox.R7[Long].get > selfRewardAmount &&
                                // Increase matches the added funds
                                outBox.R7[Long].get - selfRewardAmount == outBox.value - selfValue
        
        // All add funds requirements must be met
        creatorSigned && onlyValueIncreased && isBoxReplication
    }

    // Action: Extend deadline
    val isExtendDeadline = {
        // Verify creator is signing
        val creatorSigned = creatorProp
        
        // Only deadline should change, everything else remains same
        val onlyDeadlineExtended = outBox.R4[Int].get > selfDeadline &&
                                  // Current height must be before current deadline
                                  HEIGHT <= selfDeadline
        
        // All deadline extension requirements must be met
        creatorSigned && onlyDeadlineExtended && isBoxReplication
    }

    // Action: Update bounty metadata
    val isUpdateMetadata = {
        // Only creator can update metadata
        val creatorSigned = creatorProp
        
        // Only metadata root should change
        val onlyMetadataUpdated = {
            val newMetadataRoot = outBox.R9[Coll[Byte]].get.slice(64, 96)
            
            // Verify metadata root has changed but others remain same
            metadataRoot != newMetadataRoot &&
            outBox.R9[Coll[Byte]].get.slice(0, 32) == submissionsRoot &&
            outBox.R9[Coll[Byte]].get.slice(32, 64) == judgmentsRoot
        }
        
        // Can only update before deadline
        val beforeDeadline = HEIGHT <= selfDeadline
        
        // Add version tracking
        val hasVersionIncrement = {
            val oldVersion = extractJsonField(selfBountyData, "version")
            val newVersion = extractJsonField(outBox.R9[Coll[Byte]].get, "version")
            
            // Convert version strings to numbers and verify increment
            byteArrayToLong(newVersion) > byteArrayToLong(oldVersion)
        }
        
        // All metadata update requirements must be met
        creatorSigned && onlyMetadataUpdated && beforeDeadline && hasVersionIncrement && isBoxReplication
    }

    // Initial contract creation validation
    val correctBuild = {
        // Ensure bounty token is correctly set up
        val hasBountyToken = SELF.tokens.size >= 1 && selfBountyToken == 1
        
        // Initial submission stats counter [0,0,0]
        val initialStats = SELF.R6[Coll[Long]].get == Coll(0L, 0L, 0L)
        
        // Ensure there's enough value for the reward
        val sufficientFunds = SELF.value >= SELF.R7[Long].get
        
        // Validate basic bounty structure
        hasBountyToken && initialStats && sufficientFunds
    }

    // All possible actions for the contract
    val actions = anyOf(Coll(
        isSubmitSolution,
        isJudgeSubmission,
        isWithdrawReward,
        isRefundBounty,
        isAddMoreFunds,
        isExtendDeadline,
        isUpdateMetadata
    ))

    // Final contract condition
    sigmaProp(correctBuild || actions)
}
`;
}

function handle_contract_generator(version: contract_version) {
    let f;
    switch (version) {
        case "v1_0":
            f = generate_contract_v1_0;
            break;
        default:
            throw new Error("Invalid contract version");
    }
    return f;
}

export function get_address(constants: BountyAddressContent, version: contract_version) {
    let contract = handle_contract_generator(version)(
        constants.creator,
        constants.dev_hash ?? get_dev_contract_hash(),
        constants.dev_fee
    );
    let ergoTree = compile(contract, { version: 1, network: network_id });

    let network = (network_id == "mainnet") ? Network.Mainnet : Network.Testnet;
    return ergoTree.toAddress(network).toString();
}

export function get_template_hash(version: contract_version): string {
    const random_mainnet_addr = "9f3iPJTiciBYA6DnTeGy98CvrwyEhiP7wNrhDrQ1QeKPRhTmaqQ";
    const random_testnet_addr = "3WzH5yEJongYHmBJnoMs3zeK3t3fouMi3pigKdEURWcD61pU6Eve";
    let random_addr = network_id == "mainnet" ? random_mainnet_addr : random_testnet_addr;
    const random_dev_contract = uint8ArrayToHex(blake2b256("9a3d2f6b"));

    let contract = handle_contract_generator(version)(random_addr, random_dev_contract, 5);
    return hex.encode(sha256(compile(contract, { version: 1, network: network_id }).template.toBytes()));
}

function get_contract_hash(constants: BountyAddressContent, version: contract_version): string {
    return uint8ArrayToHex(
        blake2b256(
            compile(
                handle_contract_generator(version)(
                    constants.creator,
                    constants.dev_hash ?? get_dev_contract_hash(),
                    constants.dev_fee
                ),
                { version: 1, network: network_id }
            ).toBytes()
        )
    );
}

export function mint_contract_address(constants: BountyAddressContent, version: contract_version) {
    const contract_bytes_hash = get_contract_hash(constants, version);
    let contract = `
{
    val contractBox = OUTPUTS(0)

    val correctSpend = {
        val isBBT = SELF.tokens(0)._1 == contractBox.tokens(0)._1
        val spendAll = SELF.tokens(0)._2 == contractBox.tokens(0)._2

        isBBT && spendAll
    }

    val correctContract = {
        fromBase16("${contract_bytes_hash}") == blake2b256(contractBox.propositionBytes)
    }

    sigmaProp(allOf(Coll(
        correctSpend,
        correctContract
    )))
}
`;

    let ergoTree = compile(contract, { version: 1, network: network_id });

    let network = (network_id == "mainnet") ? Network.Mainnet : Network.Testnet;
    return ergoTree.toAddress(network).toString();
}