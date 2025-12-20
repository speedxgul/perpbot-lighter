import { getEma, getMidPrices } from "./indicators";
import { CandlestickApi, IsomorphicFetchHttpLibrary, ServerConfiguration } from "./lighter-sdk-ts/generated";
const BASE_URL = "https://mainnet.zklighter.elliot.ai"
const SOL_MARKET_ID = 2

async function getKlines(marketId: number) {
    const klinesApi = new CandlestickApi({
        baseServer: new ServerConfiguration<{  }>(BASE_URL, {  }),
        httpApi: new IsomorphicFetchHttpLibrary(),
        middleware: [],
        authMethods: {}
    });

    const klines = await klinesApi.candlesticks(SOL_MARKET_ID, '5m', Date.now() - 1000 * 60 * 60 * 1, Date.now(), 50, false);
    console.log(klines.candlesticks)


}
// [1,2,3,4,5,6,7,8,9,10]
getKlines(SOL_MARKET_ID);