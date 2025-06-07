<script lang="ts">
  import { block_to_date, time_to_block } from "$lib/common/countdown";
  import { explorer_uri, web_explorer_uri_tx } from "$lib/ergo/envs";
  import { ErgoPlatform } from "$lib/ergo/platform";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { onMount } from "svelte";

  console.log("🔄 NewBounty.svelte: Script started loading");

  // Types
  interface BountyContent {
    title: string;
    description: string;
    category: string;
    tags: string[];
    status: string;
    createdAt: string;
    reward: {
      amount: number;
      token: string;
      decimals: number;
    };
  }

  // Constants
  const MIN_ERG_AMOUNT = 0.001;
  const ERG_DECIMALS = 9;
  const MAX_DEADLINE_DAYS = 365;
  const MAX_MIN_SUBMISSIONS = 100;

  console.log("📋 Constants defined:", { MIN_ERG_AMOUNT, ERG_DECIMALS, MAX_DEADLINE_DAYS, MAX_MIN_SUBMISSIONS });

  let platform: ErgoPlatform | null = null;
  let platformInitialized = false;
  let initializationError: string | null = null;

  // Form fields
  let bountyTitle: string = "";
  let bountyDescription: string = "";
  let bountyCategory: string = "General";
  let bountyTags: string = "";
  let rewardAmount: number = MIN_ERG_AMOUNT;
  let deadlineDays: number = 30;
  let minSubmissions: number = 1;

  // Transaction state
  let transactionId: string | null = null;
  let errorMessage: string | null = null;
  let successMessage: string | null = null;
  let isSubmitting: boolean = false;

  // Blockchain data
  let currentHeight: number | null = null;
  let deadlineBlock: number = 0;
  let deadlineText: string = "";
  let ergBalance: number = 0;

  console.log("🔢 Initial state set:", {
    platform,
    platformInitialized,
    isSubmitting,
    currentHeight,
    ergBalance
  });

  $: if (deadlineDays > 0 && currentHeight !== null && platform) {
    console.log("⏰ Reactive statement triggered for deadline calculation");
    calculateDeadline(deadlineDays);
  }

  async function initializePlatform(): Promise<void> {
    console.log("🚀 initializePlatform: START");
    
    try {
      console.log("📦 initializePlatform: Creating new ErgoPlatform instance...");
      platform = new ErgoPlatform();
      console.log("✅ initializePlatform: ErgoPlatform instance created:", platform);
      
      // Test platform connection
      console.log("🔍 initializePlatform: Testing platform methods...");
      console.log("🔍 initializePlatform: get_current_height method exists:", typeof platform.get_current_height === 'function');
      
      if (typeof platform.get_current_height === 'function') {
        platformInitialized = true;
        initializationError = null;
        console.log("🎉 initializePlatform: Platform initialized successfully!");
      } else {
        console.log("❌ initializePlatform: Platform methods not available");
        throw new Error("Platform methods not available");
      }
    } catch (error) {
      console.error("❌ initializePlatform: ERROR:", error);
      initializationError = error instanceof Error ? error.message : "Unknown initialization error";
      platformInitialized = false;
      console.log("❌ initializePlatform: Set platformInitialized to false");
    }
    
    console.log("🏁 initializePlatform: END - platformInitialized:", platformInitialized);
  }

  async function calculateDeadline(days: number): Promise<void> {
    console.log("📅 calculateDeadline: START with days:", days);
    
    if (!platform) {
      console.log("❌ calculateDeadline: No platform available");
      return;
    }

    try {
      console.log("📅 calculateDeadline: Calculating target date...");
      const targetDate = new Date();
      targetDate.setTime(targetDate.getTime() + days * 24 * 60 * 60 * 1000);
      console.log("📅 calculateDeadline: Target date:", targetDate);
      
      console.log("📅 calculateDeadline: Converting to block...");
      deadlineBlock = await time_to_block(targetDate.getTime(), platform);
      console.log("📅 calculateDeadline: Deadline block:", deadlineBlock);
      
      console.log("📅 calculateDeadline: Converting block to date text...");
      deadlineText = await block_to_date(deadlineBlock, platform);
      console.log("📅 calculateDeadline: Deadline text:", deadlineText);
    } catch (error) {
      console.error("❌ calculateDeadline: ERROR:", error);
      deadlineText = "Error calculating deadline";
    }
    
    console.log("🏁 calculateDeadline: END");
  }

  async function getCurrentHeight(): Promise<void> {
    console.log("📏 getCurrentHeight: START");
    
    if (!platform) {
      console.log("❌ getCurrentHeight: No platform available");
      return;
    }

    try {
      console.log("📏 getCurrentHeight: Calling platform.get_current_height()...");
      currentHeight = await platform.get_current_height();
      console.log("✅ getCurrentHeight: Current height:", currentHeight);
    } catch (error) {
      console.error("❌ getCurrentHeight: ERROR:", error);
      errorMessage = "Failed to connect to blockchain";
    }
    
    console.log("🏁 getCurrentHeight: END");
  }

  async function getErgBalance(): Promise<void> {
    console.log("💰 getErgBalance: START");
    
    if (!platform) {
      console.log("❌ getErgBalance: No platform available");
      return;
    }

    try {
      console.log("💰 getErgBalance: Calling platform.get_balance()...");
      const tokens = await platform.get_balance();
      console.log("💰 getErgBalance: Tokens received:", tokens);
      
      ergBalance = tokens.get("ERG") || 0;
      const ergBalanceDecimal = ergBalance / Math.pow(10, ERG_DECIMALS);
      console.log("💰 getErgBalance: ERG balance raw:", ergBalance);
      console.log("💰 getErgBalance: ERG balance decimal:", ergBalanceDecimal);
    } catch (error) {
      console.error("❌ getErgBalance: ERROR:", error);
      errorMessage = "Failed to load ERG balance. Please ensure your wallet is connected.";
    }
    
    console.log("🏁 getErgBalance: END");
  }

  function calculateRewardAmountRaw(): number {
    console.log("🧮 calculateRewardAmountRaw: START");
    const rawAmount = Math.floor(rewardAmount * Math.pow(10, ERG_DECIMALS));
    console.log("🧮 calculateRewardAmountRaw: Input amount:", rewardAmount);
    console.log("🧮 calculateRewardAmountRaw: Raw amount:", rawAmount);
    console.log("🏁 calculateRewardAmountRaw: END");
    return rawAmount;
  }

  function resetForm(): void {
    console.log("🔄 resetForm: START");
    bountyTitle = "";
    bountyDescription = "";
    bountyCategory = "General";
    bountyTags = "";
    rewardAmount = MIN_ERG_AMOUNT;
    deadlineDays = 30;
    minSubmissions = 1;
    console.log("✅ resetForm: Form reset complete");
    console.log("🏁 resetForm: END");
  }

  function clearMessages(): void {
    console.log("🧹 clearMessages: START");
    errorMessage = null;
    successMessage = null;
    console.log("✅ clearMessages: Messages cleared");
    console.log("🏁 clearMessages: END");
  }

  function parseTags(tagsString: string): string[] {
    console.log("🏷️ parseTags: START with input:", tagsString);
    const tags = tagsString
      .split(",")
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);
    console.log("🏷️ parseTags: Parsed tags:", tags);
    console.log("🏁 parseTags: END");
    return tags;
  }

  function validateForm(): boolean {
    console.log("✅ validateForm: START");
    console.log("✅ validateForm: Current form values:", {
      bountyTitle: bountyTitle,
      bountyDescription: bountyDescription,
      rewardAmount: rewardAmount,
      minSubmissions: minSubmissions,
      deadlineDays: deadlineDays,
      ergBalance: ergBalance
    });
    
    clearMessages();
    
    console.log("✅ validateForm: Checking title...");
    if (!bountyTitle.trim()) {
      console.log("❌ validateForm: Title validation failed");
      errorMessage = "Title is required";
      return false;
    }
    console.log("✅ validateForm: Title OK");
    
    console.log("✅ validateForm: Checking description...");
    if (!bountyDescription.trim()) {
      console.log("❌ validateForm: Description validation failed");
      errorMessage = "Description is required";
      return false;
    }
    console.log("✅ validateForm: Description OK");
    
    console.log("✅ validateForm: Checking reward amount > 0...");
    if (rewardAmount <= 0) {
      console.log("❌ validateForm: Reward amount <= 0");
      errorMessage = "Reward amount must be greater than 0";
      return false;
    }
    console.log("✅ validateForm: Reward amount > 0 OK");
    
    console.log("✅ validateForm: Checking minimum ERG amount...");
    if (rewardAmount < MIN_ERG_AMOUNT) {
      console.log("❌ validateForm: Reward amount below minimum");
      errorMessage = `Minimum ERG reward is ${MIN_ERG_AMOUNT}`;
      return false;
    }
    console.log("✅ validateForm: Minimum ERG amount OK");
    
    console.log("✅ validateForm: Checking ERG balance...");
    const ergBalanceDecimal = ergBalance / Math.pow(10, ERG_DECIMALS);
    console.log("✅ validateForm: ERG balance decimal:", ergBalanceDecimal);
    if (rewardAmount > ergBalanceDecimal) {
      console.log("❌ validateForm: Insufficient ERG balance");
      errorMessage = `Insufficient ERG balance. Available: ${ergBalanceDecimal.toFixed(ERG_DECIMALS)} ERG`;
      return false;
    }
    console.log("✅ validateForm: ERG balance OK");
    
    console.log("✅ validateForm: Checking min submissions...");
    if (minSubmissions < 1 || minSubmissions > MAX_MIN_SUBMISSIONS) {
      console.log("❌ validateForm: Min submissions out of range");
      errorMessage = `Minimum submissions must be between 1 and ${MAX_MIN_SUBMISSIONS}`;
      return false;
    }
    console.log("✅ validateForm: Min submissions OK");
    
    console.log("✅ validateForm: Checking deadline days...");
    if (deadlineDays < 1 || deadlineDays > MAX_DEADLINE_DAYS) {
      console.log("❌ validateForm: Deadline days out of range");
      errorMessage = `Deadline must be between 1 and ${MAX_DEADLINE_DAYS} days`;
      return false;
    }
    console.log("✅ validateForm: Deadline days OK");

    console.log("✅ validateForm: Checking raw amount...");
    const rawAmount = calculateRewardAmountRaw();
    if (rawAmount === 0) {
      console.log("❌ validateForm: Raw amount is 0");
      errorMessage = "Reward amount too small";
      return false;
    }
    console.log("✅ validateForm: Raw amount OK");

    console.log("🎉 validateForm: ALL VALIDATIONS PASSED!");
    console.log("🏁 validateForm: END - returning true");
    return true;
  }

  async function handleSubmit(): Promise<void> {
    console.log("🚀🚀🚀 handleSubmit: BUTTON CLICKED - START 🚀🚀🚀");
    console.log("🚀 handleSubmit: Current timestamp:", new Date().toISOString());
    
    // Check if platform is initialized
    console.log("🔍 handleSubmit: Checking platform initialization...");
    console.log("🔍 handleSubmit: platformInitialized:", platformInitialized);
    console.log("🔍 handleSubmit: platform object:", platform);
    
    if (!platformInitialized || !platform) {
      console.log("❌ handleSubmit: Platform not initialized - EARLY RETURN");
      errorMessage = "Platform not initialized. Please refresh the page and ensure your wallet is connected.";
      return;
    }
    console.log("✅ handleSubmit: Platform check passed");

    console.log("🔍 handleSubmit: Before validateForm() call");
    // Validate form
    const isValid = validateForm();
    console.log("🔍 handleSubmit: validateForm() returned:", isValid);
    
    if (!isValid) {
      console.log("❌ handleSubmit: Form validation failed - EARLY RETURN");
      return;
    }
    console.log("✅ handleSubmit: Form validation passed");

    console.log("🔄 handleSubmit: Setting isSubmitting to true");
    isSubmitting = true;
    errorMessage = null;
    transactionId = null;

    try {
      console.log("🔥 handleSubmit: TRY BLOCK STARTED");
      
      console.log("🧮 handleSubmit: Calculating reward amount...");
      const rewardAmountRaw = calculateRewardAmountRaw();
      console.log("💰 handleSubmit: Reward amount raw:", rewardAmountRaw);

      console.log("📝 handleSubmit: Creating bounty content object...");
      const bountyContent: BountyContent = {
        title: bountyTitle.trim(),
        description: bountyDescription.trim(),
        category: bountyCategory,
        tags: parseTags(bountyTags),
        status: "open",
        createdAt: new Date().toISOString(),
        reward: {
          amount: rewardAmount,
          token: "ERG",
          decimals: ERG_DECIMALS,
        },
      };
      console.log("📝 handleSubmit: Bounty content:", bountyContent);

      console.log("🚀 handleSubmit: CALLING platform.submit() with parameters:");
      console.log("   - title:", bountyTitle.trim());
      console.log("   - content:", JSON.stringify(bountyContent));
      console.log("   - token: ''");
      console.log("   - amount:", rewardAmountRaw);
      console.log("   - deadline:", deadlineBlock);
      console.log("   - minSubmissions:", minSubmissions);
      
      const txId = await platform.submit(
        bountyTitle.trim(),
        JSON.stringify(bountyContent),
        "", // Empty string for ERG
        rewardAmountRaw,
        deadlineBlock,
        minSubmissions
      );
      
      console.log("✅ handleSubmit: platform.submit() completed with txId:", txId);

      if (!txId) {
        console.log("❌ handleSubmit: No transaction ID returned - throwing error");
        throw new Error("Transaction failed - no transaction ID returned");
      }

      console.log("🎉 handleSubmit: Transaction successful!");
      transactionId = txId;
      successMessage = `Bounty created successfully!`;
      
      console.log("🔄 handleSubmit: Resetting form...");
      resetForm();
      
      console.log("💰 handleSubmit: Refreshing ERG balance...");
      await getErgBalance(); // Refresh balance after successful submission
      
      console.log("🎊 handleSubmit: SUCCESS FLOW COMPLETED");

    } catch (error) {
      console.log("💥💥💥 handleSubmit: CATCH BLOCK - ERROR OCCURRED 💥💥💥");
      console.error("💥 handleSubmit: Error details:", error);
      console.error("💥 handleSubmit: Error type:", typeof error);
      console.error("💥 handleSubmit: Error constructor:", error?.constructor?.name);
      
      if (error instanceof Error) {
        console.log("💥 handleSubmit: Error message:", error.message);
        console.log("💥 handleSubmit: Error stack:", error.stack);
        errorMessage = `Failed to create bounty: ${error.message}`;
      } else {
        console.log("💥 handleSubmit: Unknown error type");
        errorMessage = "Failed to create bounty. Please try again.";
      }
      
      console.log("💥 handleSubmit: Error message set to:", errorMessage);
    } finally {
      console.log("🏁 handleSubmit: FINALLY BLOCK");
      console.log("🏁 handleSubmit: Setting isSubmitting to false");
      isSubmitting = false;
      console.log("🏁 handleSubmit: isSubmitting now:", isSubmitting);
    }
    
    console.log("🏁🏁🏁 handleSubmit: COMPLETE END 🏁🏁🏁");
  }

  // Button click handler with logging
  function onButtonClick() {
    console.log("🔘🔘🔘 BUTTON CLICK EVENT FIRED 🔘🔘🔘");
    console.log("🔘 Button state check:");
    console.log("   - isSubmitting:", isSubmitting);
    console.log("   - platformInitialized:", platformInitialized);
    console.log("   - button should be disabled:", isSubmitting || !platformInitialized);
    
    if (isSubmitting || !platformInitialized) {
      console.log("⚠️ Button is disabled, but click event still fired!");
      return;
    }
    
    console.log("✅ Button click proceeding to handleSubmit...");
    handleSubmit();
  }

  onMount(async () => {
    console.log("🎬 onMount: START");
    
    console.log("🔧 onMount: Calling initializePlatform...");
    await initializePlatform();
    console.log("🔧 onMount: initializePlatform completed");
    
    if (platformInitialized && platform) {
      console.log("✅ onMount: Platform ready, getting blockchain data...");
      
      console.log("📏 onMount: Getting current height...");
      await getCurrentHeight();
      
      console.log("💰 onMount: Getting ERG balance...");
      await getErgBalance();
      
      console.log("✅ onMount: Blockchain data retrieval completed");
    } else {
      console.log("❌ onMount: Platform not ready, skipping blockchain data retrieval");
    }
    
    console.log("🏁 onMount: END");
  });

  console.log("✅ NewBounty.svelte: Script loading completed");
</script>

<div class="container mx-auto py-4">
  <h2 class="bounty-title">Create New Bounty</h2>

  <!-- Status Panel -->
  <div class="status-panel bg-background/80 backdrop-blur-lg rounded-xl p-4 mb-6">
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-full {platformInitialized ? 'bg-green-500' : 'bg-red-500'}"></div>
        <span>Platform: {platformInitialized ? 'Connected' : 'Disconnected'}</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-full {currentHeight ? 'bg-green-500' : 'bg-red-500'}"></div>
        <span>Blockchain: {currentHeight ? `Height ${currentHeight}` : 'Not Connected'}</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-full {ergBalance > 0 ? 'bg-green-500' : 'bg-red-500'}"></div>
        <span>Wallet: {ergBalance > 0 ? 'Connected' : 'Not Connected'}</span>
      </div>
    </div>
    {#if initializationError}
      <div class="mt-2 text-red-400 text-sm">
        Initialization Error: {initializationError}
      </div>
    {/if}
  </div>

  <div class="form-container bg-background/80 backdrop-blur-lg rounded-xl p-6 mb-6">
    <div class="form-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      <!-- Bounty Title -->
      <div class="form-group lg:col-span-3">
        <Label for="bountyTitle" class="text-sm font-medium mb-2 block">Bounty Title *</Label>
        <Input 
          type="text" 
          id="bountyTitle" 
          bind:value={bountyTitle} 
          placeholder="Enter a clear, descriptive title" 
          required 
          class="w-full border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1" 
          on:input={() => {
            console.log("📝 Title input changed:", bountyTitle);
            clearMessages();
          }}
        />
      </div>

      <!-- Reward Amount (ERG Only) -->
      <div class="form-group">
        <Label for="rewardAmount" class="text-sm font-medium mb-2 block">Reward Amount (ERG) *</Label>
        <Input 
          type="number" 
          id="rewardAmount" 
          bind:value={rewardAmount} 
          min={MIN_ERG_AMOUNT.toString()}
          step="0.00000001"
          placeholder={MIN_ERG_AMOUNT.toString()}
          required
          class="w-full border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1"
          on:input={() => {
            console.log("💰 Reward amount changed:", rewardAmount);
            clearMessages();
          }}
        />
        <p class="text-sm mt-2 text-muted-foreground">
          Available: {(ergBalance / Math.pow(10, ERG_DECIMALS)).toFixed(ERG_DECIMALS)} ERG
          <br>
          Minimum: {MIN_ERG_AMOUNT} ERG
        </p>
      </div>

      <!-- Deadline -->
      <div class="form-group">
        <Label for="deadlineDays" class="text-sm font-medium mb-2 block">Deadline (Days) *</Label>
        <Input
          type="number"
          id="deadlineDays"
          bind:value={deadlineDays}
          min="1"
          max={MAX_DEADLINE_DAYS}
          placeholder="30"
          required
          class="w-full border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1"
          on:input={() => {
            console.log("📅 Deadline days changed:", deadlineDays);
            clearMessages();
          }}
        />
        <p class="text-sm mt-2 text-muted-foreground">
          {#if deadlineText}
            Estimated deadline: {deadlineText}
          {/if}
        </p>
      </div>

      <!-- Min Submissions -->
      <div class="form-group">
        <Label for="minSubmissions" class="text-sm font-medium mb-2 block">Minimum Submissions *</Label>
        <Input
          type="number"
          id="minSubmissions"
          bind:value={minSubmissions}
          min="1"
          max={MAX_MIN_SUBMISSIONS}
          placeholder="1"
          required
          class="w-full border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1"
          on:input={() => {
            console.log("🔢 Min submissions changed:", minSubmissions);
            clearMessages();
          }}
        />
      </div>

      <!-- Category -->
      <div class="form-group">
        <Label for="bountyCategory" class="text-sm font-medium mb-2 block">Category</Label>
        <Input
          type="text"
          id="bountyCategory"
          bind:value={bountyCategory}
          placeholder="Development, Design, Research, etc."
          class="w-full border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1"
          on:input={() => {
            console.log("📂 Category changed:", bountyCategory);
            clearMessages();
          }}
        />
      </div>

      <!-- Tags -->
      <div class="form-group">
        <Label for="bountyTags" class="text-sm font-medium mb-2 block">Tags (comma separated)</Label>
        <Input
          type="text"
          id="bountyTags"
          bind:value={bountyTags}
          placeholder="JavaScript, React, API, Smart Contract, etc."
          class="w-full border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1"
          on:input={() => {
            console.log("🏷️ Tags changed:", bountyTags);
            clearMessages();
          }}
        />
      </div>

      <!-- Bounty Description -->
      <div class="form-group lg:col-span-3">
        <Label for="bountyDescription" class="text-sm font-medium mb-2 block">Bounty Description *</Label>
        <Textarea
          id="bountyDescription"
          bind:value={bountyDescription}
          placeholder="Provide detailed requirements, acceptance criteria, and any specific instructions..."
          required
          class="w-full h-32 border-orange-500/20 focus:border-orange-500/40 focus:ring-orange-500/20 focus:ring-1"
          on:input={() => {
            console.log("📝 Description changed, length:", bountyDescription.length);
            clearMessages();
          }}
        />
      </div>
    </div>

    <!-- Messages and Submit Button -->
    <div class="form-actions mt-6 flex flex-col items-center gap-4">
  {#if transactionId}
    <div class="result bg-background/80 backdrop-blur-lg border border-orange-500/20 rounded-lg p-4 w-full max-w-xl">
      <p class="text-center">
        <strong>Bounty created successfully!</strong>
        <br>
        <a href="{web_explorer_uri_tx + transactionId}" target="_blank" rel="noopener noreferrer" class="text-orange-400 hover:text-orange-300 underline transition-colors">
          View transaction on explorer
        </a>
      </p>
    </div>
  {:else}
    {#if errorMessage}
      <div class="error-message bg-red-500/10 border border-red-500/20 rounded-lg p-4 w-full max-w-xl text-center text-red-500">
        {errorMessage}
      </div>
    {/if}

    <!-- Fixed button with proper event handling -->
    <button
      on:click|preventDefault={onButtonClick}
      disabled={isSubmitting || !platformInitialized}
      class="bg-orange-500 hover:bg-orange-600 text-black border-none py-2 px-6 text-lg font-semibold rounded-lg transition-all duration-200 hover:scale-[1.02] hover:shadow-lg disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-none disabled:cursor-not-allowed"
      type="button"
    >
      {#if !platformInitialized}
        Platform Not Ready
      {:else if isSubmitting}
        Waiting for confirmation of the project creation...
      {:else}
        Create Bounty
      {/if}
    </button>
  {/if}
</div>
  </div>
</div>

<style>
    .container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 10px 15px;
        overflow-y: auto;
        scrollbar-color: rgba(255, 255, 255, 0) rgba(0, 0, 0, 0);
    }

    .bounty-title {
        text-align: center;
        font-size: 2.2rem;
        margin: 20px 0 30px;
        color: orange;
        font-family: 'Russo One', sans-serif;
        letter-spacing: 0.02em;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        position: relative;
    }

    .bounty-title::after {
        content: '';
        position: absolute;
        bottom: -10px;
        left: 50%;
        transform: translateX(-50%);
        width: 100px;
        height: 3px;
        background: linear-gradient(90deg, rgba(255, 165, 0, 0), rgba(255, 165, 0, 1), rgba(255, 165, 0, 0));
    }

    .form-container {
        animation: fadeIn 0.5s ease-in;
    }

    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }

    .form-group {
        margin-bottom: 1.5rem;
    }

    @media (max-width: 768px) {
        .bounty-title {
            font-size: 1.8rem;
            margin: 15px 0 25px;
        }
    }
</style>