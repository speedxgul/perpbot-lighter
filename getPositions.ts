import { AccountApi, ApiKeyAuthentication, IsomorphicFetchHttpLibrary, ServerConfiguration } from "./lighter-sdk-ts/generated";
import { SUPPORTED_ACCOUNTS, type Account } from "./accounts";
import { BASE_URL } from "./config";

export interface OpenPosition {
    symbol: string;
    position: string;
    unrealizedPnl: string;
    realizedPnl: string;
    entryPrice: string;
    liquidationPrice: string;
    sign: number;
}

export async function getOpenOrders(account: Account): Promise<OpenPosition[]> {
    const accountApi = new AccountApi({
        baseServer: new ServerConfiguration<{}>(BASE_URL, {}),
        httpApi: new IsomorphicFetchHttpLibrary(),
        middleware: [],
        authMethods: {
            apiKey: new ApiKeyAuthentication(account.exchangeApiKey),
        },
    });

    const currentOpenOrders = await accountApi.accountWithHttpInfo("index", account.accountIndex.toString());
    const positions = currentOpenOrders.data.accounts[0]?.positions ?? [];

    return positions.map((pos) => ({
        symbol: pos.symbol,
        position: pos.position,
        unrealizedPnl: pos.unrealizedPnl,
        realizedPnl: pos.realizedPnl,
        entryPrice: pos.avgEntryPrice,
        liquidationPrice: pos.liquidationPrice,
        sign: pos.sign,
    }));
}

if (import.meta.main) {
    const account = SUPPORTED_ACCOUNTS[0];
    if (account) {
        getOpenOrders(account)
            .then((res) => {
                console.log(res);
            })
            .catch((err) => {
                console.error(err);
            });
    }
}
