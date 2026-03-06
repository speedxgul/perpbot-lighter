import { NonceManagerType } from "./lighter-sdk-ts/nonce_manager";
import { SignerClient } from "./lighter-sdk-ts/signer";
import { AccountApi, ApiKeyAuthentication, CandlestickApi, IsomorphicFetchHttpLibrary, OrderApi, ServerConfiguration } from "./lighter-sdk-ts/generated";
import type { Account } from "./accounts";
import { API_KEY_INDEX, BASE_URL } from "./config";
import { MARKETS } from "./markets";



export async function CreatePosition(account:Account,symbol:string,side:"LONG"|"`SHORT", quantity:number) {
    const client = await SignerClient.create({
        url: BASE_URL,
        privateKey: account.apiKey,
        apiKeyIndex: API_KEY_INDEX,
        accountIndex: Number(account.accountIndex),
        nonceManagementType: NonceManagerType.API
    });

    const market = MARKETS[symbol as keyof typeof MARKETS];

    const candleStickApi = new CandlestickApi({
        baseServer: new ServerConfiguration<{  }>(BASE_URL, {  }),
        httpApi: new IsomorphicFetchHttpLibrary(),
        middleware: [],
        authMethods: {}
    });
     const candleStickData = await candleStickApi.candlesticks(market.marketId, '1m', Date.now() - 1000 * 60 * 5, Date.now(), 1, false)
     const latestPrice = candleStickData.candlesticks[candleStickData.candlesticks.length - 1]?.close;
     if (!latestPrice) {
        throw new Error("No latest price found");
     }
     console.log(latestPrice)

    await client.createOrder({
        marketIndex: market.marketId,
        clientOrderIndex: market.clientOrderIndex,// need to pass this for model to remember openedPosition Index
        baseAmount: quantity * market.priceDecimals,
        price: (side == "LONG" ? latestPrice * 1.01 : latestPrice * 0.99) * market.priceDecimals,
        isAsk: side == "LONG" ? false : true,
        orderType: SignerClient.ORDER_TYPE_MARKET, // market
        timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
        reduceOnly: 0,
        triggerPrice: SignerClient.NIL_TRIGGER_PRICE,
        orderExpiry: SignerClient.DEFAULT_28_DAY_ORDER_EXPIRY,
    });
}

