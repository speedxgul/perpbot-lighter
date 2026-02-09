import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText } from 'ai';
import { z } from 'zod';
import { PROMPT } from './prompt';
import { getOpenOrders } from './getPositions';
import type { Account } from './accounts';





export const invokeAgent = async (account:Account) => {
    const openrouter = createOpenRouter({
        apiKey: process.env['OPEN_ROUTER_API_KEY'] ?? '',
    });
    const intradayIndicators = await getIndicators("5m",0)
    const longTermIndicators = await getIndicators()
    // const longTermIndicators = await smth
    const OpenOrders = await getOpenOrders(account.apiKey)
//create 2 tools, createPositions and closeAllPosition
    const response = streamText({
        model: openrouter(account.modelName),
        prompt: PROMPT.replace('{{OPEN_POSITIONS}}', JSON.stringify(OpenOrders))
        .replace('{{INVOCATION_TIMES}}',"0")
        .replace('{{PORTFOLIO_VALUE}}', "$100")
        .replace('{{INTRADAY_POSNS}}',)
            createPosition: {
                description: "Open a position in the given market",
                parameters: z.object({

            
        },
    });

    await response.consumeStream();
    return response.text;
};
