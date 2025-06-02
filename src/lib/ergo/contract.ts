import { type ConstantContent } from "../../lib/common/bounty";
import { compile } from "@fleet-sdk/compiler";
import { Network } from "@fleet-sdk/core";
import { sha256, hex, blake2b256 } from "@fleet-sdk/crypto";
import { uint8ArrayToHex } from "./utils";
import { network_id } from "./envs";
import { get_dev_contract_hash } from "./dev/dev_contract";

export type contract_version = "v1_0" | "v1_1";

function generate_contract_v1_0(owner_addr: string, dev_fee_contract_bytes_hash: string, dev_fee: number, token_id: string) {
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

// ===== Compile Time Constants ===== //
val dev_wallet_address = "${owner_addr}"

// ===== Helper Functions ===== //
def isSigmaPropEqualToBoxProp(prop: SigmaProp, box: Box): Boolean = {
  val sigmaPropBytes: Coll[Byte] = prop.propBytes
  val boxPropBytes: Coll[Byte] = box.propositionBytes

  if (boxPropBytes(0) == 0x00.toByte) {
    if (sigmaPropBytes.size == 34 && boxPropBytes.size == 34 && sigmaPropBytes(0) == 0xcd.toByte) {
      sigmaPropBytes.slice(1, 34) == boxPropBytes.slice(1, 34)
    } else {
      false
    }
  } else {
    sigmaPropBytes == boxPropBytes
  }
}

def byteArrayToLong(bytes: Coll[Byte]): Long = {
  val len = bytes.size
  if (len == 0) {
    0L
  } else {
    val bytesToProcess = if (len > 8) bytes.slice(0, 8) else bytes
    val numBytes = bytesToProcess.size
    
    def processBytes(index: Int, accumulator: Long): Long = {
      if (index >= numBytes) {
        accumulator
      } else {
        val byteValue = bytesToProcess(index).toLong & 0xFFL
        val shiftAmount = (numBytes - 1 - index) * 8
        processBytes(index + 1, accumulator + (byteValue << shiftAmount))
      }
    }
    
    processBytes(0, 0L)
  }
}

def extractJsonField(json: Coll[Byte], field: String): Coll[Byte] = {
  if (field == "version") {
    if (json.size >= 8) {
      json.slice(0, 8)
    } else {
      Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte)
    }
  } else {
    Coll[Byte]()
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

// Parse metadata - ensure sufficient data length
val submissionsRoot = if (selfBountyData.size >= 32) selfBountyData.slice(0, 32) else Coll[Byte]()
val judgmentsRoot = if (selfBountyData.size >= 64) selfBountyData.slice(32, 64) else Coll[Byte]()
val metadataRoot = if (selfBountyData.size >= 96) selfBountyData.slice(64, 96) else Coll[Byte]()

// Creator SigmaProp
val creatorProp = proveDlog(decodePoint(creatorPubKey))

// Output box reference for validation
val outBox = if (OUTPUTS.size > 0) OUTPUTS(0) else SELF

// ===== Box Replication Validation ===== //
val isBoxReplication = {
  val sameId = if (outBox.tokens.size > 0) {
    selfId == outBox.tokens(0)._1 && selfBountyToken == outBox.tokens(0)._2
  } else false
  
  val sameDeadline = outBox.R4[Int].isDefined && selfDeadline == outBox.R4[Int].get
  val sameMinSubmissions = outBox.R5[Long].isDefined && selfMinSubmissions == outBox.R5[Long].get
  val sameCreatorPubKey = outBox.R8[Coll[Byte]].isDefined && creatorPubKey == outBox.R8[Coll[Byte]].get
  val sameScript = selfScript == outBox.propositionBytes
  
  sameId && sameDeadline && sameMinSubmissions && sameCreatorPubKey && sameScript
}

// ===== Actions ===== //

// Action: Submit a solution
val isSubmitSolution = {
  val beforeDeadline = HEIGHT <= selfDeadline

  val correctSubmissionIncrement = if (outBox.R6[Coll[Long]].isDefined) {
    val newStats = outBox.R6[Coll[Long]].get
    if (newStats.size >= 3) {
      val newTotal = newStats(0)
      val newAccepted = newStats(1)
      val newRejected = newStats(2)
      
      newTotal == selfTotalSubmissions + 1 && 
      newAccepted == selfAcceptedSubmissions &&
      newRejected == selfRejectedSubmissions
    } else false
  } else false

  val updatedBountyData = if (outBox.R9[Coll[Byte]].isDefined) {
    val newBountyData = outBox.R9[Coll[Byte]].get
    if (newBountyData.size >= 96) {
      val newSubmissionsRoot = newBountyData.slice(0, 32)
      submissionsRoot != newSubmissionsRoot &&
      newBountyData.slice(32, 64) == judgmentsRoot &&
      newBountyData.slice(64, 96) == metadataRoot
    } else false
  } else false
  
  val valueUnchanged = selfValue == outBox.value
  
  beforeDeadline && correctSubmissionIncrement && updatedBountyData && isBoxReplication && valueUnchanged
}

// Action: Judge a submission
val isJudgeSubmission = {
  val creatorSigned = creatorProp
  
  val validJudgeDataInputs = CONTEXT.dataInputs.size == 1 &&
                             CONTEXT.dataInputs(0).R4[Boolean].isDefined &&
                             CONTEXT.dataInputs(0).R5[Int].isDefined

  if (validJudgeDataInputs) {
    val decision = CONTEXT.dataInputs(0).R4[Boolean].get
    
    val correctJudgmentUpdate = if (outBox.R6[Coll[Long]].isDefined) {
      val newStats = outBox.R6[Coll[Long]].get
      if (newStats.size >= 3) {
        val newTotal = newStats(0)
        val newAccepted = newStats(1)
        val newRejected = newStats(2)
        
        val totalUnchanged = newTotal == selfTotalSubmissions
        val statsUpdated = if (decision) {
          newAccepted == selfAcceptedSubmissions + 1 && newRejected == selfRejectedSubmissions
        } else {
          newAccepted == selfAcceptedSubmissions && newRejected == selfRejectedSubmissions + 1
        }
        
        totalUnchanged && statsUpdated
      } else false
    } else false
  
    val judgmentRecorded = if (outBox.R9[Coll[Byte]].isDefined) {
      val newBountyData = outBox.R9[Coll[Byte]].get
      if (newBountyData.size >= 96) {
        val newJudgmentsRoot = newBountyData.slice(32, 64)
        judgmentsRoot != newJudgmentsRoot &&
        newBountyData.slice(0, 32) == submissionsRoot &&
        newBountyData.slice(64, 96) == metadataRoot
      } else false
    } else false
  
    val valueUnchanged = selfValue == outBox.value
    
    creatorSigned && correctJudgmentUpdate && judgmentRecorded && isBoxReplication && valueUnchanged
  } else {
    false
  }
}

// Action: Withdraw reward
val isWithdrawReward = {
  val validWithdrawDataInputs = CONTEXT.dataInputs.size == 1 &&
                                CONTEXT.dataInputs(0).R4[SigmaProp].isDefined &&
                                CONTEXT.dataInputs(0).R5[Int].isDefined

  if (validWithdrawDataInputs) {
    val winnerAddress = CONTEXT.dataInputs(0).R4[SigmaProp].get
    val judgmentHeight = CONTEXT.dataInputs(0).R5[Int].get

    val minerFee = 1100000L
    val platformFeePercent = ${dev_fee}L
    val platformFee = selfRewardAmount * platformFeePercent / 100L
    val devFee = platformFee
    
    val hasAcceptedSubmission = selfAcceptedSubmissions > 0L
    val hasMinimumSubmissions = selfTotalSubmissions >= selfMinSubmissions
    
    val correctDistribution = if (OUTPUTS.size >= 3) {
      val winnerBox = OUTPUTS(1)
      val devBox = OUTPUTS(2)
      
      val winnerAmount = selfRewardAmount - platformFee - minerFee
      val correctWinnerPayment = winnerBox.value == winnerAmount && 
                              isSigmaPropEqualToBoxProp(winnerAddress, winnerBox)
      
      val correctDevFee = devBox.value == devFee &&
                          devBox.propositionBytes == fromBase16("${dev_fee_contract_bytes_hash}")
      
      correctWinnerPayment && correctDevFee
    } else false
    
    val disputePeriodPassed = {
      val disputePeriod = 720
      HEIGHT >= judgmentHeight + disputePeriod
    }
    
    hasAcceptedSubmission && hasMinimumSubmissions && correctDistribution && disputePeriodPassed
  } else {
    false
  }
}

// Action: Refund bounty
val isRefundBounty = {
  val afterDeadline = HEIGHT > selfDeadline
  val canBeRefunded = afterDeadline && 
                      (selfTotalSubmissions < selfMinSubmissions || selfAcceptedSubmissions == 0L)
  
  val correctRefund = if (OUTPUTS.size >= 2) {
    val creatorBox = OUTPUTS(1)
    isSigmaPropEqualToBoxProp(creatorProp, creatorBox) && creatorBox.value == selfValue
  } else false
  
  canBeRefunded && correctRefund
}

// Action: Add more funds
val isAddMoreFunds = {
  val creatorSigned = creatorProp
  
  val onlyValueIncreased = outBox.value > selfValue && 
                          outBox.R7[Long].isDefined &&
                          outBox.R7[Long].get > selfRewardAmount &&
                          outBox.R7[Long].get - selfRewardAmount == outBox.value - selfValue
  
  creatorSigned && onlyValueIncreased && isBoxReplication
}

// Action: Extend deadline
val isExtendDeadline = {
  val creatorSigned = creatorProp
  
  val onlyDeadlineExtended = outBox.R4[Int].isDefined &&
                            outBox.R4[Int].get > selfDeadline &&
                            HEIGHT <= selfDeadline
  
  creatorSigned && onlyDeadlineExtended && isBoxReplication
}

// Action: Update metadata
val isUpdateMetadata = {
  val creatorSigned = creatorProp
  
  val onlyMetadataUpdated = if (outBox.R9[Coll[Byte]].isDefined) {
    val newBountyData = outBox.R9[Coll[Byte]].get
    if (newBountyData.size >= 96) {
      val newMetadataRoot = newBountyData.slice(64, 96)
      metadataRoot != newMetadataRoot &&
      newBountyData.slice(0, 32) == submissionsRoot &&
      newBountyData.slice(32, 64) == judgmentsRoot
    } else false
  } else false
  
  val beforeDeadline = HEIGHT <= selfDeadline
  
  val hasVersionIncrement = {
    val oldVersion = extractJsonField(selfBountyData, "version")
    val newVersion = if (outBox.R9[Coll[Byte]].isDefined) {
      extractJsonField(outBox.R9[Coll[Byte]].get, "version")
    } else Coll[Byte]()
    
    byteArrayToLong(newVersion) > byteArrayToLong(oldVersion)
  }
  
  creatorSigned && onlyMetadataUpdated && beforeDeadline && hasVersionIncrement && isBoxReplication
}

// Initial contract creation validation
val correctBuild = {
  val hasBountyToken = SELF.tokens.size >= 1 && selfBountyToken == 1L
  val initialStats = selfSubmissionStats.size >= 3 && 
                     selfTotalSubmissions == 0L && 
                     selfAcceptedSubmissions == 0L && 
                     selfRejectedSubmissions == 0L
  val sufficientFunds = SELF.value >= selfRewardAmount
  
  hasBountyToken && initialStats && sufficientFunds
}

// All possible actions for the contract
val actions = isSubmitSolution || isJudgeSubmission || isWithdrawReward || 
              isRefundBounty || isAddMoreFunds || isExtendDeadline || isUpdateMetadata

// Final contract condition
sigmaProp(correctBuild || actions)
}
`
}

function generate_contract_v1_1(owner_addr: string, dev_fee_contract_bytes_hash: string, dev_fee: number, token_id: string) {
    // Placeholder for v1.1 - implement as needed
    return generate_contract_v1_0(owner_addr, dev_fee_contract_bytes_hash, dev_fee, token_id);
}

function handle_contract_generator(version: contract_version) {
  let f;
  switch (version) {
    case "v1_0":
      f = generate_contract_v1_0;
      break;
    case "v1_1":
      f = generate_contract_v1_1;
      break;
    default:
      throw new Error("Invalid contract version");
  }
  return f
}

export function get_address(constants: ConstantContent, version: contract_version) {
    let contract = handle_contract_generator(version)(constants.owner, constants.dev_hash ?? get_dev_contract_hash(), constants.dev_fee, constants.token_id);
    let ergoTree = compile(contract, {version: 1, network: network_id})

    let network = (network_id == "mainnet") ? Network.Mainnet : Network.Testnet;
    return ergoTree.toAddress(network).toString();
}

export function get_template_hash(version: contract_version): string {
  const random_mainnet_addr = "9f3iPJTiciBYA6DnTeGy98CvrwyEhiP7wNrhDrQ1QeKPRhTmaqQ";
  const random_testnet_addr = "3WzH5yEJongYHmBJnoMs3zeK3t3fouMi3pigKdEURWcD61pU6Eve";
  let random_addr = network_id == "mainnet" ? random_mainnet_addr : random_testnet_addr;
  const random_dev_contract = uint8ArrayToHex(blake2b256("9a3d2f6b"));

  let contract = handle_contract_generator(version)(random_addr, random_dev_contract, 5, "");
  return hex.encode(sha256(compile(contract, {version: 1, network: network_id}).template.toBytes()))
}

function get_contract_hash(constants: ConstantContent, version: contract_version): string {
    return uint8ArrayToHex(
        blake2b256(
            compile(handle_contract_generator(version)(constants.owner, constants.dev_hash ?? get_dev_contract_hash(), constants.dev_fee, constants.token_id), 
              {version: 1, network: network_id}
          ).toBytes()
        )
    );
}

export function mint_contract_address(constants: ConstantContent, version: contract_version) {
  const contract_bytes_hash = get_contract_hash(constants, version);
  let contract = `
{
  val contractBox = OUTPUTS(0)

  val correctSpend = {
      val isIDT = SELF.tokens(0)._1 == contractBox.tokens(0)._1
      val spendAll = SELF.tokens(0)._2 == contractBox.tokens(0)._2

      isIDT && spendAll
  }

  val correctContract = {
      fromBase16("${contract_bytes_hash}") == blake2b256(contractBox.propositionBytes)
  }

  sigmaProp(allOf(Coll(
      correctSpend,
      correctContract
  )))
}
`

  let ergoTree = compile(contract, {version: 1, network: network_id})

  let network = (network_id == "mainnet") ? Network.Mainnet : Network.Testnet;
  return ergoTree.toAddress(network).toString();
}