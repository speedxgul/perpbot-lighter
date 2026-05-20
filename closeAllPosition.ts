import { API_KEY_INDEX, BASE_URL } from "./config";
import { NonceManagerType } from "./lighter-sdk-ts/nonce_manager";
import { SignerClient } from "./lighter-sdk-ts/signer";
import type { Account } from "./accounts";
import { MARKETS } from "./markets";
import { getOpenOrders } from "./getPositions";
import { CandlestickApi, IsomorphicFetchHttpLibrary, ServerConfiguration } from "./lighter-sdk-ts/generated";

export async function closeAllPosition(account: Account) {
    const client = await SignerClient.create({
        url: BASE_URL,
        privateKey: account.apiKey,
        apiKeyIndex: API_KEY_INDEX,
        accountIndex: Number(account.accountIndex),
        nonceManagementType: NonceManagerType.API
    });

    const candleStickApi = new CandlestickApi({
        baseServer: new ServerConfiguration<{  }>(BASE_URL, {  }),
        httpApi: new IsomorphicFetchHttpLibrary(),
        middleware: [],
        authMethods: {}
    });
    const openPositions = await getOpenOrders(account);

    for (const { position, sign, symbol } of openPositions ?? []) {
        if (Number(position) === 0) continue;

        const market = MARKETS[symbol as keyof typeof MARKETS];
        if (!market) continue;

        const candleStickData = await candleStickApi.candlesticks(market.marketId, '1m', Date.now() - 1000 * 60 * 5, Date.now(), 1, false);
        const latestPrice = candleStickData.candlesticks[candleStickData.candlesticks.length - 1]?.close;
        if (!latestPrice) {
            throw new Error("No latest price found");
        }

        // sign === 1 means LONG position → close with SELL (isAsk=true)
        // sign === -1 means SHORT position → close with BUY (isAsk=false)
        const isLong = sign === 1;
        const isAsk = isLong;
        const worstPrice = (isLong ? latestPrice * 0.99 : latestPrice * 1.01) * market.priceDecimals;
        const clientOrderIndex = Math.floor((market.clientOrderIndex + 1) * 1_000_000_000 + (Date.now() % 1_000_000_000));

        await client.createOrder({
            marketIndex: market.marketId,
            clientOrderIndex,
            baseAmount: Math.round(Math.abs(Number(position)) * market.qtyDecimals),
            price: Math.round(worstPrice),
            isAsk,
            orderType: SignerClient.ORDER_TYPE_MARKET,
            timeInForce: SignerClient.ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,
            reduceOnly: 1,
            triggerPrice: SignerClient.NIL_TRIGGER_PRICE,
            orderExpiry: SignerClient.DEFAULT_IOC_EXPIRY,
        });
    }
}
