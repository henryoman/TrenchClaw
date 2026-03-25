<script lang="ts">
  import { onMount } from "svelte";
  import { runtimeApi } from "../../runtimeApi";
  import RetroButton from "../ui/RetroButton.svelte";

  const PRICE_REFRESH_MS = 60_000;
  const PRICE_RETRY_MS = 5_000;
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
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let activeRequestId = 0;

  const formatUpdatedAt = (unixMs: number): string =>
    new Date(unixMs).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

  const clearRetryTimer = (): void => {
    if (!retryTimer) {
      return;
    }
    clearTimeout(retryTimer);
    retryTimer = null;
  };

  const scheduleRetry = (): void => {
    if (retryTimer) {
      return;
    }
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void loadPrice();
    }, PRICE_RETRY_MS);
  };

  const loadPrice = async (): Promise<void> => {
    const requestId = ++activeRequestId;
    refreshing = true;
    clearRetryTimer();

    try {
      const payload = await runtimeApi.solPrice();
      if (requestId !== activeRequestId) {
        return;
      }

      if (typeof payload.priceUsd === "number" && Number.isFinite(payload.priceUsd)) {
        priceLabel = priceFormatter.format(payload.priceUsd);
        priceUpdatedAt =
          typeof payload.updatedAt === "number"
            ? `Updated ${formatUpdatedAt(payload.updatedAt)}`
            : "";
        return;
      }

      if (priceLabel === "Loading...") {
        priceUpdatedAt = "";
        scheduleRetry();
      }
    } catch {
      if (requestId !== activeRequestId) {
        return;
      }
      if (priceLabel === "Loading...") {
        priceUpdatedAt = "";
        scheduleRetry();
      }
    } finally {
      if (requestId === activeRequestId) {
        refreshing = false;
      }
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
      clearRetryTimer();
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
