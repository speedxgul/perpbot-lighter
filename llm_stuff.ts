import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { PROMPT } from './prompt';
import { getOpenOrders } from './getPositions';
import { SUPPORTED_ACCOUNTS, type Account } from './accounts';
import { getPortfolio } from './getPortfolio';
import { getIndicators } from './stockPrices';
import { MARKETS } from './markets';
import { CreatePosition } from './createPosition';
import { closeAllPosition } from './closeAllPosition';

const globalWithAiSdkWarnings = globalThis as typeof globalThis & {
    AI_SDK_LOG_WARNINGS?: boolean;
};

globalWithAiSdkWarnings.AI_SDK_LOG_WARNINGS = false;



export const invokeAgent = async (account:Account, invocationCount = 0) => {
    const openrouter = createOpenRouter({
        apiKey: process.env['OPEN_ROUTER_API_KEY'] ?? '',
    });
     
    
    const arrayOfIndicatorsData = await Promise.all( 
        (Object.keys(MARKETS) as (keyof typeof MARKETS)[]).map(async (marketSlug) => {
          
            const intradayIndicators = await getIndicators("5m", MARKETS[marketSlug].marketId);
            const longTermIndicators = await getIndicators("4h", MARKETS[marketSlug].marketId); 
    
    return `
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
  const ALL_INDICATOR_DATA = arrayOfIndicatorsData.join("\n");
//   console.log(indicators)


    const openPositions = await getOpenOrders(account)
    console.log(openPositions)
    const portfolio = await getPortfolio(account)
    //prisma model invocation
    const enrichedPrompt = PROMPT.replace("{{INVOKATION_TIMES}}", String(invocationCount))
    .replace("{{OPEN_POSITIONS}}", openPositions?.map((position) => `${position.symbol} ${position.position} ${position.sign}`).join(", ") ?? "")
    .replace("{{PORTFOLIO_VALUE}}", `$${portfolio.available}`)
    .replace("{{ALL_INDICATOR_DATA}}", ALL_INDICATOR_DATA ?? "")// if promise rejected then make a condition?
    .replace("{{AVAILABLE_CASH}}", `$${portfolio.available}`)
    .replace("{{CURRENT_ACCOUNT_VALUE}}", `$${portfolio.available}`)
    .replace("{{CURRENT_ACCOUNT_POSITIONS}}", JSON.stringify(openPositions))
    // console.log(enrichedPrompt)
//create 2 tools, createPositions and closeAllPosition
    const response = streamText({
        model: openrouter(account.modelName),
        prompt: enrichedPrompt,
        toolChoice: 'required',
        tools:{
            createPosition: {
                description: 'Open a position in the given market',
                inputSchema: z.object({
                  symbol: z.enum(Object.keys(MARKETS) as [string, ...string[]]).describe('The symbol to open the position at'),
                  side: z.enum(["LONG", "SHORT"]),
                  quantity: z.number().describe('The quantity of the position to open.'),
                }),
                execute: async ({ symbol, side, quantity }) => {
                  console.log(`[tool] createPosition: ${side} ${quantity} ${symbol}`);
                  try {
                    await CreatePosition(account, symbol, side, quantity);
                    console.log(`[tool] createPosition success`);
                    return `Position opened successfully for ${quantity} ${symbol}`;
                  } catch (e) {
                    console.error(`[tool] createPosition error:`, e);
                    throw e;
                  }
                  // await prisma.toolCalls.create({
                  //   data: {
                  //     invocationId: modelInvocation.id,
                  //     toolCallType: ToolCallType.CREATE_POSITION,
                  //     metadata: JSON.stringify({ symbol, side, quantity }),
                  //   },
                  // });
                },
              },
            closeAllPositions: {
              description: 'Close all open positions',
              inputSchema: z.object({}),
              execute: async () => {
                await closeAllPosition(account);
                return 'All positions closed successfully';
              }
            },
            hold: {
              description: 'Do nothing this cycle',
              inputSchema: z.object({ reason: z.string().describe('Brief reason for holding') }),
              execute: async ({ reason }) => `Holding: ${reason}`,
            }

}
    });

    await response.consumeStream();
    return response.text;
};

if (import.meta.main) {
    const account = SUPPORTED_ACCOUNTS[0]!;
    let invocationCount = 0;
    while (true) {
        console.log(`\n--- Invocation #${invocationCount} ---`);
        try {
            await invokeAgent(account, invocationCount);
        } catch (e) {
            console.error('Agent error:', e);
        }
        invocationCount++;
        await Bun.sleep(20_000);
    }
}