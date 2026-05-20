import { BASE_URL } from "./config";
import { SUPPORTED_ACCOUNTS, type Account } from "./accounts";


export async function getPortfolio(account: Account): Promise<{collateral: string, available: string}> {
    const response = await fetch(`${BASE_URL}/api/v1/account?by=index&value=${account.accountIndex}`);
    if (!response.ok) {
        throw new Error(`Portfolio request failed: ${response.status} ${response.statusText}`);
    }
    const data: any = await response.json();
    return {collateral: data.accounts[0]?.collateral, available: data.accounts[0]?.available_balance};
}


if(import.meta.main){
    if(SUPPORTED_ACCOUNTS[0]){
        getPortfolio(SUPPORTED_ACCOUNTS[0]).then((res) => {
            console.log(res)}).catch((err) => {
                console.error(err);
            }) ;
    }
}
