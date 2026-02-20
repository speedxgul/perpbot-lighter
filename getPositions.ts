import { symbolName } from "typescript";
import { AccountApi, ApiKeyAuthentication, IsomorphicFetchHttpLibrary, OrderApi, ServerConfiguration } from "./lighter-sdk-ts/generated";
import { SUPPORTED_ACCOUNTS, type Account } from "./accounts";

const BASE_URL = "https://mainnet.zklighter.elliot.ai"
const API_KEY_PRIVATE_KEY = process.env['API_KEY_WITH_INDEX_3']!
const ACCOUNT_INDEX = 687819



export async function getOpenOrders(account:Account) {
    const accountApi = new AccountApi({
        baseServer: new ServerConfiguration<{  }>(BASE_URL, {  }),
        httpApi: new IsomorphicFetchHttpLibrary(),
        middleware: [],
        authMethods: {
            apiKey: new ApiKeyAuthentication(account.apiKey)
        }
    });
    
    // const Pnl = await accountApi.pnl('index', ACCOUNT_INDEX.toString(),"5m", Math.floor(Date.now()/1000) - 86400, Math.floor(Date.now()/1000), 100);
   const currentOpenOrders = await accountApi.accountWithHttpInfo('index', account.apiKey.toString());
//    console.log(currentOpenOrders.data.accounts[0]?.positions) 
    return currentOpenOrders.data.accounts[0]?.positions?.map((pos)=> {return {
        symbolName: pos.symbol,
        position : pos.position,
        unrealizedPnl: pos.unrealizedPnl,
        realizedPnl: pos.realizedPnl,
        entryPrice: pos.avgEntryPrice,
        liquidationPrice: pos.liquidationPrice
    }});
   // formatting
}
/ w
// export async function getPortfolio(account:Account) {
//     const data = await AccountApi({
//         baseServer: new ServerConfiguration<{  }>(BASE_URL, {  }),
//         httpApi: new IsomorphicFetchHttpLibrary(),
//         middleware: [],
//         authMethods: {
//             apiKey: new ApiKeyAuthentication(account.apiKey)
//         }
//     }).accountWithHttpInfo('index', account.index.toString());
// }
const account =SUPPORTED_ACCOUNTS[0]
if(account){
    getOpenOrders(account).then((res) => {
        console.log(res)}).catch((err) => {
            console.error(err);
        }) 
}
