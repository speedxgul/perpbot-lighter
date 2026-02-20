import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { PROMPT } from './prompt';
import { getOpenOrders } from './getPositions';
import type { Account } from './accounts';
import { getPortfolio } from './getPortfolio';




export const invokeAgent = async (account:Account) => {
    const openrouter = createOpenRouter({
        apiKey: process.env['OPEN_ROUTER_API_KEY'] ?? '',
    });
    // const intradayIndicators = await getIndicators("5m",0)
    // const longTermIndicators = await getIndicators()
    // const longTermIndicators = await smth
    const OpenOrders = await getOpenOrders(account)
    console.log(OpenOrders)
//create 2 tools, createPositions and closeAllPosition
    const response = streamText({
        model: openrouter(account.modelName),
        prompt: PROMPT.replace('{{OPEN_POSITIONS}}', JSON.stringify(OpenOrders))
        .replace('{{INVOCATION_TIMES}}',"0")// will come from a DB eventually
        .replace('{{PORTFOLIO_VALUE}}', JSON.stringify(getPortfolio(account).then((res) => {
            return res;
        })))
        .replace("{{INTRADAY_POSITIONS}}",intradayIndicators.midPrices.join(","))
        .replace("{{LONG_TERM_POSITIONS}}",longTermIndicators.midPrices.join(","))
        
        tools:{

            openPosition :{
                description:"Open a position in the given market",
                parameters:z.object(
                    
                ),
                execute
                

            
                }}
            

        


    });

    await response.consumeStream();
    return response.text;
};
