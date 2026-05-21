import { NonceManagerType } from "./lighter-sdk-ts/nonce_manager";
import { SignerClient } from "./lighter-sdk-ts/signer";
import type { Account } from "./accounts";
import { API_KEY_INDEX, BASE_URL } from "./config";
import { MARKETS } from "./markets";
import { getKlines } from "./stockPrices";
import { throttledOrder } from "./orderThrottle";



export async function createPosition(account: Account, symbol: string, side: "LONG" | "SHORT", quantity: number) {
    if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error(`Invalid quantity for ${symbol}: ${quantity}`);
    }

    const market = MARKETS[symbol as keyof typeof MARKETS];
    if (!market) {
        throw new Error(`Unknown market: ${symbol}`);
    }

    const client = await SignerClient.create({
        url: BASE_URL,
        privateKey: account.exchangeApiKey,
        apiKeyIndex: API_KEY_INDEX,
        accountIndex: Number(account.accountIndex),
        nonceManagementType: NonceManagerType.API
    });

    const candleStickData = await getKlines(market.marketId, '1m', 1, Date.now(), Date.now() - 1000 * 60);
    const latestPriceRaw = candleStickData[candleStickData.length - 1]?.c;
    if (typeof latestPriceRaw !== "number" || !Number.isFinite(latestPriceRaw) || latestPriceRaw <= 0) {
        throw new Error("No latest price found");
    }
    const latestPrice = latestPriceRaw;

    const baseAmount = Math.round(quantity * market.qtyDecimals);
    if (baseAmount <= 0) {
        throw new Error(`Quantity too small for ${symbol}: ${quantity}`);
    }

    const clientOrderIndex = Math.floor(market.clientOrderIndex * 1_000_000_000 + (Date.now() % 1_000_000_000));
    const rawPrice = (side === "LONG" ? latestPrice * 1.01 : latestPrice * 0.99) * market.priceDecimals;

    const tx = await throttledOrder(`open ${side} ${symbol}`, () =>
        client.createOrder({
            marketIndex: market.marketId,
            clientOrderIndex,
            baseAmount,
            price: Math.round(rawPrice),
            isAsk: side !== "LONG",
            orderType: SignerClient.ORDER_TYPE_MARKET,
            timeInForce: SignerClient.ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,
            reduceOnly: 0,
            triggerPrice: SignerClient.NIL_TRIGGER_PRICE,
            orderExpiry: SignerClient.DEFAULT_IOC_EXPIRY,
        })
    );

    if (tx.apiResponse.code !== 0) {
        throw new Error(`Order rejected (code ${tx.apiResponse.code}): ${tx.apiResponse.message ?? 'unknown'}`);
    }

    return tx.apiResponse.txHash;
}

export const CreatePosition = createPosition;

