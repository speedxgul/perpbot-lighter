import { NonceManagerType } from "./lighter-sdk-ts/nonce_manager";
import { SignerClient } from "./lighter-sdk-ts/signer";
import { AccountApi, ApiKeyAuthentication, CandlestickApi, IsomorphicFetchHttpLibrary, OrderApi, ServerConfiguration } from "./lighter-sdk-ts/generated";
import type { Account } from "./accounts";
import { API_KEY_INDEX, BASE_URL } from "./config";
import { MARKETS } from "./markets";
import { getKlines } from "./stockPrices";



export async function CreatePosition(account:Account,symbol:string,side:"LONG"|"SHORT", quantity:number) {
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
     const candleStickData = await getKlines(market.marketId, '1m', Date.now() - 1000 * 60 * 5, Date.now(), 1)
     
     const latestPrice = candleStickData[candleStickData.length - 1]?.c;
     if (!latestPrice) {
        throw new Error("No latest price found");
     }
     console.log(latestPrice)
     
    const clientOrderIndex = Math.floor(market.clientOrderIndex * 1_000_000_000 + (Date.now() % 1_000_000_000));

    await client.createOrder({
        marketIndex: market.marketId,
        clientOrderIndex,
        baseAmount: quantity * market.qtyDecimals,
        price: (side == "LONG" ? latestPrice * 1.01 : latestPrice * 0.99) * market.priceDecimals,
        isAsk: side == "LONG" ? false : true,
        orderType: SignerClient.ORDER_TYPE_MARKET,
        timeInForce: SignerClient.ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,
        reduceOnly: 0,
        triggerPrice: SignerClient.NIL_TRIGGER_PRICE,
        orderExpiry: SignerClient.DEFAULT_IOC_EXPIRY,
    });
}

