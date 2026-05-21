import { API_KEY_INDEX, BASE_URL } from "./config";
import { NonceManagerType } from "./lighter-sdk-ts/nonce_manager";
import { SignerClient } from "./lighter-sdk-ts/signer";
import type { Account } from "./accounts";
import { MARKETS } from "./markets";
import { getOpenOrders } from "./getPositions";
import { CandlestickApi, IsomorphicFetchHttpLibrary, ServerConfiguration } from "./lighter-sdk-ts/generated";
import { throttledOrder } from "./orderThrottle";

export class NoOpenPositionError extends Error {
    constructor(symbol: string) {
        super(`No open position for ${symbol}`);
        this.name = "NoOpenPositionError";
    }
}

async function getLatestPrice(candleStickApi: CandlestickApi, marketId: number): Promise<number> {
    const data = await candleStickApi.candlesticks(marketId, '1m', Date.now() - 1000 * 60 * 5, Date.now(), 1, false);
    const price = data.candlesticks[data.candlesticks.length - 1]?.close;
    if (!price) throw new Error(`No latest price for market ${marketId}`);
    return price;
}

export async function closePosition(account: Account, symbol: string): Promise<string> {
    const market = MARKETS[symbol as keyof typeof MARKETS];
    if (!market) throw new Error(`Unknown market: ${symbol}`);

    const client = await SignerClient.create({
        url: BASE_URL,
        privateKey: account.exchangeApiKey,
        apiKeyIndex: API_KEY_INDEX,
        accountIndex: Number(account.accountIndex),
        nonceManagementType: NonceManagerType.API
    });

    const candleStickApi = new CandlestickApi({
        baseServer: new ServerConfiguration<{}>(BASE_URL, {}),
        httpApi: new IsomorphicFetchHttpLibrary(),
        middleware: [],
        authMethods: {}
    });

    const openPositions = await getOpenOrders(account);
    const pos = openPositions?.find(p => p.symbol === symbol);
    if (!pos || Number(pos.position) === 0) {
        throw new NoOpenPositionError(symbol);
    }

    const latestPrice = await getLatestPrice(candleStickApi, market.marketId);
    const isLong = pos.sign === 1;
    const isAsk = isLong;
    const worstPrice = (isLong ? latestPrice * 0.99 : latestPrice * 1.01) * market.priceDecimals;
    const clientOrderIndex = Math.floor((market.clientOrderIndex + 1) * 1_000_000_000 + (Date.now() % 1_000_000_000));

    const tx = await throttledOrder(`close ${symbol}`, () =>
        client.createOrder({
            marketIndex: market.marketId,
            clientOrderIndex,
            baseAmount: Math.round(Math.abs(Number(pos.position)) * market.qtyDecimals),
            price: Math.round(worstPrice),
            isAsk,
            orderType: SignerClient.ORDER_TYPE_MARKET,
            timeInForce: SignerClient.ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,
            reduceOnly: 1,
            triggerPrice: SignerClient.NIL_TRIGGER_PRICE,
            orderExpiry: SignerClient.DEFAULT_IOC_EXPIRY,
        })
    );

    if (tx.apiResponse.code !== 0) {
        throw new Error(`Close rejected for ${symbol} (code ${tx.apiResponse.code}): ${tx.apiResponse.message ?? 'unknown'}`);
    }

    console.log(`[closePosition] ${symbol} closed, txHash: ${tx.apiResponse.txHash}`);
    return tx.apiResponse.txHash;
}

export async function closeAllPosition(account: Account) {
    const openPositions = await getOpenOrders(account);
    for (const { position, symbol } of openPositions ?? []) {
        if (Number(position) === 0) continue;
        await closePosition(account, symbol);
    }
}
