<script lang="ts">
  import { block_to_date, time_to_block } from "$lib/common/countdown";
  import { explorer_uri, web_explorer_uri_tx } from "$lib/ergo/envs";
  import { ErgoPlatform } from "$lib/ergo/platform";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { onMount } from "svelte";

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
  let debugLog: string[] = [];

  // Blockchain data
  let currentHeight: number | null = null;
  let deadlineBlock: number = 0;
  let deadlineText: string = "";
  let ergBalance: number = 0;

  // Debug logging function
  function addDebugLog(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    debugLog = [...debugLog, `[${timestamp}] ${message}`];
    console.log(`[Bounty Debug] ${message}`);
  }

  $: if (deadlineDays > 0 && currentHeight !== null && platform) {
    calculateDeadline(deadlineDays);
  }

  async function initializePlatform(): Promise<void> {
    try {
      addDebugLog("Initializing ErgoPlatform...");
      platform = new ErgoPlatform();
      
      // Test platform connection
      if (typeof platform.get_current_height === 'function') {
        addDebugLog("Platform methods available");
        platformInitialized = true;
        initializationError = null;
      } else {
        throw new Error("Platform methods not available");
      }
    } catch (error) {
      addDebugLog(`Platform initialization failed: ${error}`);
      initializationError = error instanceof Error ? error.message : "Unknown initialization error";
      platformInitialized = false;
    }
  }

  async function calculateDeadline(days: number): Promise<void> {
    if (!platform) {
      addDebugLog("Cannot calculate deadline - platform not initialized");
      return;
    }

    try {
      addDebugLog(`Calculating deadline for ${days} days...`);
      const targetDate = new Date();
      targetDate.setTime(targetDate.getTime() + days * 24 * 60 * 60 * 1000);
      deadlineBlock = await time_to_block(targetDate.getTime(), platform);
      deadlineText = await block_to_date(deadlineBlock, platform);
      addDebugLog(`Deadline calculated: Block ${deadlineBlock}, Date: ${deadlineText}`);
    } catch (error) {
      addDebugLog(`Error calculating deadline: ${error}`);
      deadlineText = "Error calculating deadline";
    }
  }

  async function getCurrentHeight(): Promise<void> {
    if (!platform) {
      addDebugLog("Cannot get current height - platform not initialized");
      return;
    }

    try {
      addDebugLog("Fetching current blockchain height...");
      currentHeight = await platform.get_current_height();
      addDebugLog(`Current height: ${currentHeight}`);
    } catch (error) {
      addDebugLog(`Error fetching current height: ${error}`);
      errorMessage = "Failed to connect to blockchain";
    }
  }

  async function getErgBalance(): Promise<void> {
    if (!platform) {
      addDebugLog("Cannot get ERG balance - platform not initialized");
      return;
    }

    try {
      addDebugLog("Fetching ERG balance...");
      const tokens = await platform.get_balance();
      ergBalance = tokens.get("ERG") || 0;
      const ergBalanceDecimal = ergBalance / Math.pow(10, ERG_DECIMALS);
      addDebugLog(`ERG balance: ${ergBalanceDecimal} ERG (${ergBalance} raw)`);
    } catch (error) {
      addDebugLog(`Error fetching ERG balance: ${error}`);
      errorMessage = "Failed to load ERG balance. Please ensure your wallet is connected.";
    }
  }

  function calculateRewardAmountRaw(): number {
    return Math.floor(rewardAmount * Math.pow(10, ERG_DECIMALS));
  }

  function resetForm(): void {
    bountyTitle = "";
    bountyDescription = "";
    bountyCategory = "General";
    bountyTags = "";
    rewardAmount = MIN_ERG_AMOUNT;
    deadlineDays = 30;
    minSubmissions = 1;
    addDebugLog("Form reset");
  }

  function clearMessages(): void {
    errorMessage = null;
    successMessage = null;
  }

  function parseTags(tagsString: string): string[] {
    return tagsString
      .split(",")
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);
  }

  function validateForm(): boolean {
    addDebugLog("Starting form validation...");
    clearMessages();
    
    if (!bountyTitle.trim()) {
      errorMessage = "Title is required";
      addDebugLog("Validation failed: Title is required");
      return false;
    }
    
    if (!bountyDescription.trim()) {
      errorMessage = "Description is required";
      addDebugLog("Validation failed: Description is required");
      return false;
    }
    
    if (rewardAmount <= 0) {
      errorMessage = "Reward amount must be greater than 0";
      addDebugLog("Validation failed: Reward amount must be greater than 0");
      return false;
    }
    
    if (rewardAmount < MIN_ERG_AMOUNT) {
      errorMessage = `Minimum ERG reward is ${MIN_ERG_AMOUNT}`;
      addDebugLog(`Validation failed: Minimum ERG reward is ${MIN_ERG_AMOUNT}`);
      return false;
    }
    
    const ergBalanceDecimal = ergBalance / Math.pow(10, ERG_DECIMALS);
    if (rewardAmount > ergBalanceDecimal) {
      errorMessage = `Insufficient ERG balance. Available: ${ergBalanceDecimal.toFixed(ERG_DECIMALS)} ERG`;
      addDebugLog(`Validation failed: Insufficient balance. Required: ${rewardAmount}, Available: ${ergBalanceDecimal}`);
      return false;
    }
    
    if (minSubmissions < 1 || minSubmissions > MAX_MIN_SUBMISSIONS) {
      errorMessage = `Minimum submissions must be between 1 and ${MAX_MIN_SUBMISSIONS}`;
      addDebugLog(`Validation failed: Invalid minimum submissions: ${minSubmissions}`);
      return false;
    }
    
    if (deadlineDays < 1 || deadlineDays > MAX_DEADLINE_DAYS) {
      errorMessage = `Deadline must be between 1 and ${MAX_DEADLINE_DAYS} days`;
      addDebugLog(`Validation failed: Invalid deadline days: ${deadlineDays}`);
      return false;
    }

    const rawAmount = calculateRewardAmountRaw();
    if (rawAmount === 0) {
      errorMessage = "Reward amount too small";
      addDebugLog("Validation failed: Reward amount too small");
      return false;
    }

    addDebugLog("Form validation passed");
    return true;
  }

  async function handleSubmit(): Promise<void> {
    addDebugLog("=== SUBMIT BUTTON CLICKED ===");
    
    // Check if platform is initialized
    if (!platformInitialized || !platform) {
      errorMessage = "Platform not initialized. Please refresh the page and ensure your wallet is connected.";
      addDebugLog("Submit failed: Platform not initialized");
      return;
    }

    // Validate form
    if (!validateForm()) {
      addDebugLog("Submit failed: Form validation failed");
      return;
    }

    isSubmitting = true;
    errorMessage = null;
    transactionId = null;
    addDebugLog("Starting bounty submission...");

    try {
      const rewardAmountRaw = calculateRewardAmountRaw();
      addDebugLog(`Reward amount raw: ${rewardAmountRaw}`);

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

      addDebugLog(`Bounty content: ${JSON.stringify(bountyContent, null, 2)}`);
      addDebugLog(`Submitting to platform with deadline block: ${deadlineBlock}, min submissions: ${minSubmissions}`);

      const txId = await platform.submit(
        bountyTitle.trim(),
        JSON.stringify(bountyContent),
        "", // Empty string for ERG
        rewardAmountRaw,
        deadlineBlock,
        minSubmissions
      );

      addDebugLog(`Platform.submit returned: ${txId}`);

      if (!txId) {
        throw new Error("Transaction failed - no transaction ID returned");
      }

      transactionId = txId;
      successMessage = `Bounty created successfully!`;
      addDebugLog(`Bounty created successfully with txId: ${txId}`);
      resetForm();
      await getErgBalance(); // Refresh balance after successful submission

    } catch (error) {
      addDebugLog(`Error creating bounty: ${error}`);
      console.error("Error creating bounty:", error);
      
      if (error instanceof Error) {
        errorMessage = `Failed to create bounty: ${error.message}`;
      } else {
        errorMessage = "Failed to create bounty. Please try again.";
      }
    } finally {
      isSubmitting = false;
      addDebugLog("Submit process completed");
    }
  }

  // Test button functionality
  function testButton(): void {
    addDebugLog("Test button clicked - button is working!");
    alert("Button click is working! Check console for debug logs.");
  }

  onMount(async () => {
    addDebugLog("Component mounted");
    
    await initializePlatform();
    
    if (platformInitialized && platform) {
      await getCurrentHeight();
      await getErgBalance();
    }
    
    addDebugLog("Component initialization completed");
  });
</script>

<div class="container mx-auto py-4">
  <h2 class="bounty-title">Create New Bounty</h2>

  <!-- Debug Panel (remove in production) -->
  <div class="debug-panel bg-gray-900/80 backdrop-blur-lg rounded-xl p-4 mb-6 max-h-40 overflow-y-auto">
    <h3 class="text-sm font-bold text-orange-400 mb-2">Debug Log:</h3>
    <div class="text-xs text-gray-300 space-y-1">
      {#each debugLog.slice(-10) as log}
        <div>{log}</div>
      {/each}
    </div>
    <button 
      on:click={testButton}
      class="mt-2 px-3 py-1 bg-blue-500 text-white text-xs rounded"
    >
      Test Button
    </button>
  </div>

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
          on:input={clearMessages}
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
          on:input={clearMessages}
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
          on:input={clearMessages}
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
          on:input={clearMessages}
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
          on:input={clearMessages}
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
          on:input={clearMessages}
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
          on:input={clearMessages}
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

        <Button 
          on:click={handleSubmit}

          class="bg-orange-500 hover:bg-orange-600 text-black border-none py-2 px-6 text-lg font-semibold rounded-lg transition-all duration-200 hover:scale-[1.02] hover:shadow-lg disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-none"
        >
          {#if !platformInitialized}
            Platform Not Ready
          {:else if isSubmitting}
            Creating Bounty...
          {:else}
            Create Bounty
          {/if}
        </Button>
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

    .debug-panel {
        font-family: 'Courier New', monospace;
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