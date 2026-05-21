import { BASE_URL } from "./config";
import { SUPPORTED_ACCOUNTS, type Account } from "./accounts";


function parseNumericString(value: unknown, field: string): string {
    if (value === null || value === undefined) {
        throw new Error(`Portfolio response missing "${field}"`);
    }
    const asNumber = Number(value);
    if (!Number.isFinite(asNumber)) {
        throw new Error(`Portfolio response field "${field}" is not numeric`);
    }
    return String(value);
}

export async function getPortfolio(account: Account): Promise<{ collateral: string; available: string }> {
    const response = await fetch(`${BASE_URL}/api/v1/account?by=index&value=${account.accountIndex}`);
    if (!response.ok) {
        throw new Error(`Portfolio request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { accounts?: Array<{ collateral?: unknown; available_balance?: unknown }> };
    const firstAccount = data.accounts?.[0];
    if (!firstAccount) {
        throw new Error(`No account data returned for index ${account.accountIndex}`);
    }

    return {
        collateral: parseNumericString(firstAccount.collateral, "collateral"),
        available: parseNumericString(firstAccount.available_balance, "available_balance"),
    };
}


if(import.meta.main){
    if(SUPPORTED_ACCOUNTS[0]){
        getPortfolio(SUPPORTED_ACCOUNTS[0]).then((res) => {
            console.log(res)}).catch((err) => {
                console.error(err);
            }) ;
    }
}
