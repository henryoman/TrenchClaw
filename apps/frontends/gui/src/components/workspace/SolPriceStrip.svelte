<script lang="ts">
  import { onMount } from "svelte";
  import RetroButton from "../ui/RetroButton.svelte";

  const SOL_PRICE_URL =
    "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_last_updated_at=true";
  const PRICE_REFRESH_MS = 60_000;
  const priceFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  let priceLabel = $state("Loading...");
  let priceUpdatedAt = $state("");
  let refreshing = $state(false);

  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let activeController: AbortController | null = null;

  const formatUpdatedAt = (unixSeconds: number): string =>
    new Date(unixSeconds * 1_000).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

  const loadPrice = async (): Promise<void> => {
    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    refreshing = true;

    try {
      const response = await fetch(SOL_PRICE_URL, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Price request failed (${response.status})`);
      }

      const payload = (await response.json()) as {
        solana?: {
          usd?: number;
          last_updated_at?: number;
        };
      };
      const usdPrice = payload.solana?.usd;
      if (typeof usdPrice !== "number" || !Number.isFinite(usdPrice)) {
        throw new Error("Missing SOL price");
      }

      priceLabel = priceFormatter.format(usdPrice);
      priceUpdatedAt =
        typeof payload.solana?.last_updated_at === "number"
          ? `Updated ${formatUpdatedAt(payload.solana.last_updated_at)}`
          : "";
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      priceLabel = "Unavailable";
      priceUpdatedAt = "";
    } finally {
      if (activeController === controller) {
        activeController = null;
      }
      refreshing = false;
    }
  };

  onMount(() => {
    void loadPrice();
    refreshTimer = setInterval(() => {
      void loadPrice();
    }, PRICE_REFRESH_MS);

    return () => {
      if (refreshTimer) {
        clearInterval(refreshTimer);
      }
      activeController?.abort();
    };
  });
</script>

<section class="sol-price-strip" aria-label="Solana price">
  <div class="header-row">
    <span class="label">Solana Price</span>
    <RetroButton variant="secondary" disabled={refreshing} on:click={() => void loadPrice()}>
      {refreshing ? "Refreshing" : "Refresh"}
    </RetroButton>
  </div>
  <strong class="price">{priceLabel}</strong>
  {#if priceUpdatedAt}
    <small class="updated-at">{priceUpdatedAt}</small>
  {/if}
</section>

<style>
  .sol-price-strip {
    border: var(--tc-border);
    background: var(--tc-color-black-2);
    min-height: 0;
    display: grid;
    align-content: center;
    gap: 4px;
    padding: var(--tc-space-2) var(--tc-space-3);
    overflow: hidden;
  }

  .header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--tc-space-2);
  }

  .label {
    color: var(--tc-color-turquoise);
    font-size: var(--tc-type-xs);
    text-transform: uppercase;
    letter-spacing: var(--tc-track-wide);
  }

  .price {
    color: var(--tc-color-cream);
    font-size: var(--tc-type-md);
    line-height: 1.2;
  }

  .updated-at {
    color: var(--tc-color-gray-2);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
</style>
