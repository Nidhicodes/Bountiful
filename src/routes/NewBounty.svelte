<script lang="ts">
  import { dev_fee_contract_address } from "$lib/ergo/envs";
  import type { Platform, BountyMetadata } from "$lib/common/platform";
  import type { Bounty } from "$lib/common/bounty";
  import { ErgoPlatform } from "$lib/ergo/platform";
  import { address } from "$lib/common/store";
  import { web_explorer_uri_tx } from "$lib/ergo/envs";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { goto } from "$app/navigation";
  import { invalidate } from "$app/navigation";

  const platform: Platform = new ErgoPlatform();

  let bountyTitle: string = "";
  let bountyDescription: string = "";
  let bountyCategory: string = "General";
  let bountyTags: string = "";
  let rewardAmount: number = 0.001;
  let deadlineDays: number = 30;
  let minSubmissions: number = 1;

  let transactionId: string | null = null;
  let errorMessage: string | null = null;
  let successMessage: string | null = null;
  let isSubmitting: boolean = false;

  // Calculate estimated block height (assuming ~2 minutes per block)
  $: estimatedDeadlineHeight =
    Math.floor(Date.now() / 1000 / 120) + deadlineDays * 24 * 30;

  async function handleSubmit() {
    if (!$address) {
      errorMessage = "Please connect your wallet first";
      return;
    }

    if (
      !bountyTitle.trim() ||
      !bountyDescription.trim() ||
      rewardAmount <= 0 ||
      minSubmissions < 1
    ) {
      errorMessage = "Please fill in all required fields";
      return;
    }

    isSubmitting = true;
    errorMessage = null;
    successMessage = null;
    transactionId = null;

    const rewardNanoErg = Math.floor(rewardAmount * 1_000_000_000);
    const deadlineBlock =
      Math.floor(Date.now() / 1000 / 120) + deadlineDays * 24 * 30;

    try {
      const rewardNanoErg = Math.floor(rewardAmount * 1_000_000_000);
      const deadlineBlock =
        Math.floor(Date.now() / 1000 / 120) + deadlineDays * 24 * 30;
      const txId = await platform.submit(
        bountyTitle.trim(),
        bountyDescription.trim(),
        rewardNanoErg,
        deadlineBlock,
        minSubmissions,
        $address,
        JSON.stringify({
          category: bountyCategory,
          tags: bountyTags
            .split(",")
            .map((t) => t.trim())
            .filter((t) => t),
          status: "open",
          // Add dev fee metadata
          devFee: {
            address: dev_fee_contract_address,
            percentage: 1, // 1% fee (adjust as needed)
            amount: (rewardAmount * 0.01).toFixed(4) + " ERG"
          },
        })
      );

      if (!txId) {
        throw new Error("Transaction failed - no transaction ID returned");
      }

      transactionId = txId;
      successMessage = `Bounty created successfully! Transaction ID: ${txId}`;

      await invalidate("bounties");

      // Reset form
      bountyTitle = "";
      bountyDescription = "";
      bountyCategory = "General";
      bountyTags = "";
      rewardAmount = 0.001;
      deadlineDays = 30;
      minSubmissions = 1;

      // Redirect after delay
      if (transactionId) {
        // Redirect to the newly created bounty page
        setTimeout(() => {
          goto(`/bounty/${transactionId}`); // Using TX ID as temporary identifier
        }, 3000);
      }
    } catch (error) {
      console.error("Error creating bounty:", error);
    
    // Type-safe error handling
    if (error instanceof Error) {
      errorMessage = error.message;
      // Add specific handling for insufficient funds
      if ('message' in error && typeof error.message === 'string' && 
          error.message.includes("Insufficient balance")) {
        errorMessage = error.message;
      }
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else {
      errorMessage = "Failed to create bounty (unknown error)";
    }
  } finally {
    isSubmitting = false;
  }
}

  function clearMessages() {
    errorMessage = null;
    successMessage = null;
  }
</script>

<div class="container">
  <h1 class="project-title">Create New Bounty</h1>

  <div class="form-container">
    <form on:submit|preventDefault={handleSubmit}>
      <!-- Bounty Title -->
      <div class="form-group">
        <label for="bountyTitle">Bounty Title *</label>
        <input
          type="text"
          id="bountyTitle"
          bind:value={bountyTitle}
          placeholder="Enter a clear, descriptive title for your bounty"
          required
          on:input={clearMessages}
        />
      </div>

      <!-- Add this near other form elements -->
      <div class="form-group">
        <Label class="text-sm text-muted-foreground">
          Platform fee: 1% (Paid to contract: {dev_fee_contract_address.slice(
            0,
            6
          )}...{dev_fee_contract_address.slice(-4)})
        </Label>
      </div>

      <!-- Reward Amount, Deadline, and Min Submissions -->
      <div class="form-row">
        <div class="form-group">
          <label for="rewardAmount">Reward Amount (ERG) *</label>
          <input
            type="number"
            id="rewardAmount"
            bind:value={rewardAmount}
            min="0.001"
            step="0.001"
            placeholder="0.001"
            required
            on:input={clearMessages}
          />
          <div class="help-text">Minimum: 0.001 ERG</div>
        </div>

        <div class="form-group">
          <label for="deadlineDays">Deadline (Days) *</label>
          <input
            type="number"
            id="deadlineDays"
            bind:value={deadlineDays}
            min="1"
            max="365"
            placeholder="30"
            required
            on:input={clearMessages}
          />
          <div class="help-text">
            Estimated block: ~{estimatedDeadlineHeight.toLocaleString()}
          </div>
        </div>
      </div>

      <!-- Category, Tags, and Min Submissions -->
      <div class="form-row">
        <div class="form-group">
          <label for="bountyCategory">Category</label>
          <input
            type="text"
            id="bountyCategory"
            bind:value={bountyCategory}
            placeholder="Development, Design, Research, etc."
            on:input={clearMessages}
          />
          <div class="help-text">Help others find your bounty</div>
        </div>

        <div class="form-group">
          <label for="minSubmissions">Minimum Submissions *</label>
          <input
            type="number"
            id="minSubmissions"
            bind:value={minSubmissions}
            min="1"
            max="100"
            placeholder="1"
            required
            on:input={clearMessages}
          />
          <div class="help-text">Required submissions before judging</div>
        </div>
      </div>

      <!-- Tags -->
      <div class="form-group">
        <label for="bountyTags">Tags (comma separated)</label>
        <input
          type="text"
          id="bountyTags"
          bind:value={bountyTags}
          placeholder="JavaScript, React, API, Smart Contract, etc."
          on:input={clearMessages}
        />
        <div class="help-text">Separate multiple tags with commas</div>
      </div>

      <!-- Bounty Description -->
      <div class="form-group">
        <label for="bountyDescription">Bounty Description *</label>
        <textarea
          id="bountyDescription"
          bind:value={bountyDescription}
          placeholder="Provide detailed requirements, acceptance criteria, and any specific instructions for completing this bounty..."
          required
          on:input={clearMessages}
        ></textarea>
        <div class="help-text">
          Be as specific as possible to attract quality submissions
        </div>
      </div>

      <!-- Error/Success Messages -->
      {#if errorMessage}
        <div class="error-message">
          {errorMessage}
        </div>
      {/if}

      {#if successMessage}
        <div class="success-message">
          {successMessage}
          {#if transactionId}
            <a
              href={web_explorer_uri_tx + transactionId}
              target="_blank"
              rel="noopener noreferrer"
              class="explorer-link"
            >
              View on explorer
            </a>
          {/if}
        </div>
      {/if}

      <!-- Submit Button -->
      <div class="form-actions">
        <button
          type="submit"
          class="submit-button"
          disabled={isSubmitting ||
            !bountyTitle.trim() ||
            !bountyDescription.trim() ||
            rewardAmount <= 0 ||
            minSubmissions < 1 ||
            !$address}
        >
          {isSubmitting ? "Creating Bounty..." : "Create Bounty"}
        </button>
      </div>

      {#if !$address}
        <div
          class="help-text"
          style="text-align: center; margin-top: 10px; color: #ff4d4d;"
        >
          Please connect your wallet to create a bounty
        </div>
      {/if}
    </form>
  </div>
</div>

<style>
  :global(body) {
    background-color: #000000;
    color: #ffffff;
    font-family: Arial, sans-serif;
    margin: 0;
    padding: 0;
    min-height: 100vh;
  }

  .container {
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
    min-height: 100vh;
  }

  .project-title {
    text-align: center;
    font-size: 2.2rem;
    margin: 20px 0 30px;
    color: orange;
    font-weight: bold;
    letter-spacing: 0.02em;
  }

  .form-container {
    background: #111111;
    border: 1px solid #444444;
    border-radius: 8px;
    padding: 30px;
    margin-bottom: 20px;
  }

  .form-group {
    margin-bottom: 20px;
  }

  .form-group label {
    display: block;
    margin-bottom: 8px;
    color: #ffffff;
    font-weight: 500;
  }

  .form-group input,
  .form-group textarea {
    width: 100%;
    background: #222222;
    border: 1px solid #444444;
    border-radius: 4px;
    padding: 12px;
    color: #ffffff;
    font-size: 14px;
  }

  .form-group input:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: orange;
    box-shadow: 0 0 0 2px rgba(255, 165, 0, 0.2);
  }

  .form-group textarea {
    min-height: 120px;
    resize: vertical;
  }

  .form-actions {
    text-align: center;
    margin-top: 30px;
  }

  .submit-button {
    background: orange;
    color: #000000;
    border: none;
    padding: 12px 30px;
    font-size: 16px;
    font-weight: bold;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .submit-button:hover:not(:disabled) {
    background: #ff8800;
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(255, 165, 0, 0.3);
  }

  .submit-button:disabled {
    background: #666666;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  .error-message {
    color: #ff4d4d;
    text-align: center;
    padding: 15px;
    background: rgba(255, 77, 77, 0.1);
    border: 1px solid rgba(255, 77, 77, 0.3);
    border-radius: 4px;
    margin: 15px 0;
  }

  .success-message {
    color: #4caf50;
    text-align: center;
    padding: 15px;
    background: rgba(76, 175, 80, 0.1);
    border: 1px solid rgba(76, 175, 80, 0.3);
    border-radius: 4px;
    margin: 15px 0;
  }

  .explorer-link {
    color: #4fc3f7;
    text-decoration: none;
    margin-left: 5px;
  }

  .explorer-link:hover {
    text-decoration: underline;
  }

  .help-text {
    font-size: 12px;
    color: #bbbbbb;
    margin-top: 5px;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }

  .form-row-triple {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 15px;
  }

  @media (max-width: 768px) {
    .container {
      padding: 15px;
    }

    .project-title {
      font-size: 1.8rem;
      margin: 15px 0 25px;
    }

    .form-container {
      padding: 20px;
    }

    .form-row {
      grid-template-columns: 1fr;
      gap: 15px;
    }

    .form-row-triple {
      grid-template-columns: 1fr;
      gap: 15px;
    }
  }
</style>
