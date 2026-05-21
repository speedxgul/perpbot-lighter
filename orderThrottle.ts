const SEND_TX_INTERVAL_MS = 15_500;
const MAX_RETRIES = 2;

let lastSendTxAt = 0;

function isRateLimitError(message: string | undefined): boolean {
    if (!message) return false;
    return message.includes("volume quota") || message.includes("ratelimit");
}

async function waitForFreeSlot(): Promise<void> {
    const elapsed = Date.now() - lastSendTxAt;
    if (elapsed < SEND_TX_INTERVAL_MS) {
        const waitMs = SEND_TX_INTERVAL_MS - elapsed;
        console.log(`[throttle] waiting ${(waitMs / 1000).toFixed(1)}s for next free SendTx slot`);
        await Bun.sleep(waitMs);
    }
}

export async function throttledOrder<T extends { apiResponse: { code: number; message?: string; txHash: string } }>(
    label: string,
    orderFn: () => Promise<T>,
): Promise<T> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        await waitForFreeSlot();
        lastSendTxAt = Date.now();

        const tx = await orderFn();

        if (tx.apiResponse.code === 0) {
            return tx;
        }

        if (isRateLimitError(tx.apiResponse.message) && attempt < MAX_RETRIES) {
            console.warn(`[throttle] ${label}: rate-limited (attempt ${attempt + 1}/${MAX_RETRIES + 1}), will retry after cooldown`);
            lastSendTxAt = Date.now();
            continue;
        }

        return tx;
    }

    throw new Error(`[throttle] ${label}: exhausted retries`);
}
