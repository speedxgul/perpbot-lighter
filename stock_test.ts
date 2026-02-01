import { CandlestickApi, IsomorphicFetchHttpLibrary, ServerConfiguration } from "./lighter-sdk-ts/generated";

const BASE_URL = "https://mainnet.zklighter.elliot.ai"
const SOL_MARKET_ID = 2

async function getKlines() {
    const klinesApi = new CandlestickApi({
        baseServer: new ServerConfiguration<{  }>(BASE_URL, {  }),
        httpApi: new IsomorphicFetchHttpLibrary(),
        middleware: [],
        authMethods: {}
    });

    // Using milliseconds as Date.now() returns ms
    const now = Date.now();
    const oneDayAgo = now - 1000 * 60 * 60 * 24;
    
    const klines = await klinesApi.candlesticks(
        SOL_MARKET_ID, 
        '1m', 
        oneDayAgo, 
        now, 
        100, 
        false
    );
    console.log(klines);
}

getKlines();