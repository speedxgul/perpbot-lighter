import axios from "axios";
import { SUPPORTED_ACCOUNTS, type Account } from "./accounts";


export async function getPortfolio(account: Account): Promise<{collateral: string, available: string}> {
    const response = await axios.get(`https://mainnet.zklighter.elliot.ai/api/v1/account?by=index&value=${account.accountIndex}`)
    return {collateral: response.data.accounts[0]?.collateral, available: response.data.accounts[0]?.available_balance};
}


if(import.meta.main){
    if(SUPPORTED_ACCOUNTS[0]){
        getPortfolio(SUPPORTED_ACCOUNTS[0]).then((res) => {
            console.log(res)}).catch((err) => {
                console.error(err);
            }) ;
    }
}
