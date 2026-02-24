import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { PROMPT } from './prompt';
import { getOpenOrders } from './getPositions';
import type { Account } from './accounts';
import { getPortfolio } from './getPortfolio';
import { getIndicators } from './stockPrices';
import { MARKETS } from './markets';
import { CreatePosition } from './createPosition';



export const invokeAgent = async (account:Account) => {
    const openrouter = createOpenRouter({
        apiKey: process.env['OPEN_ROUTER_API_KEY'] ?? '',
    });
     
    let ALL_INDICATOR_DATA = "";
    const indicators = await Promise.all(
        (Object.keys(MARKETS) as (keyof typeof MARKETS)[]).map(async (marketSlug) => {
            console.log(marketSlug)
            const intradayIndicators = await getIndicators("5m", MARKETS[marketSlug].marketId);
            const longTermIndicators = await getIndicators("4h", MARKETS[marketSlug].marketId); 
    
    ALL_INDICATOR_DATA = ALL_INDICATOR_DATA + `
    MARKET - ${marketSlug}
    Intraday (5m candles) (oldest → latest):
    Mid prices - [${intradayIndicators.midPrices.join(",")}]
    EMA20 - [${intradayIndicators.ema20.join(",")}]
    MACD - [${intradayIndicators.macd.join(",")}]

    Long Term (4h candles) (oldest → latest):
    Mid prices - [${longTermIndicators.midPrices.join(",")}]
    EMA20 - [${longTermIndicators.ema20.join(",")}]
    MACD - [${longTermIndicators.macd.join(",")}]

    `
  }))
//   console.log(indicators)


    const openPositions = await getOpenOrders(account)
    const portfolio = await getPortfolio(account)
    //prisma model invocation
    const enrichedPrompt = PROMPT.replace("{{INVOKATION_TIMES}}", "0")// what is invocation count, fix this
    .replace("{{OPEN_POSITIONS}}", openPositions?.map((position) => `${position.symbolName} ${position.position} ${position.sign}`).join(", ") ?? "")
    .replace("{{PORTFOLIO_VALUE}}", `$${portfolio.available}`)
    .replace("{{ALL_INDICATOR_DATA}}", ALL_INDICATOR_DATA)
    .replace("{{AVAILABLE_CASH}}", `$${portfolio.available}`)
    .replace("{{CURRENT_ACCOUNT_VALUE}}", `$${portfolio.available}`)
    .replace("{{CURRENT_ACCOUNT_POSITIONS}}", JSON.stringify(openPositions))
  
    console.log(enrichedPrompt)
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
            createPosition: {
                description: 'Open a position in the given market',
                inputSchema: z.object({
                  symbol: z.enum(Object.keys(MARKETS)).describe('The symbol to open the position at'),
                  side: z.enum(["LONG", "SHORT"]),
                  quantity: z.number().describe('The quantity of the position to open.'),
                }),
                execute: async ({ symbol, side, quantity }) => {
                  // Do the opposite of what the AI infers
                  side = side === "LONG" ? "SHORT" : "LONG";
                  await CreatePosition(account, symbol, side, quantity);
                  await prisma.toolCalls.create({
                    data: {
                      invocationId: modelInvocation.id,
                      toolCallType: ToolCallType.CREATE_POSITION,
                      metadata: JSON.stringify({ symbol, side, quantity }),
                    },
                  });
                  return `Position opened successfully for ${quantity} ${symbol}`;
                },
              },

}
            

        


    });

    await response.consumeStream();
    return response.text;
};
