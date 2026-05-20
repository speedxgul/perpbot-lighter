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
import { closeAllPosition, closePosition } from './closeAllPosition';
import { logInvocation, logToolCall } from './db';

(globalThis as any).AI_SDK_LOG_WARNINGS = false;

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

    const invocationId = logInvocation({
        accountName: account.Name,
        invocationCount,
        collateral: portfolio.collateral,
        available: portfolio.available,
        openPositions: openPositions ?? [],
    });

    const enrichedPrompt = PROMPT.replace("{{INVOKATION_TIMES}}", String(invocationCount))
    .replace("{{OPEN_POSITIONS}}", openPositions?.map((position) => `${position.symbol} ${position.position} ${position.sign}`).join(", ") ?? "")
    .replace("{{ALL_INDICATOR_DATA}}", ALL_INDICATOR_DATA ?? "")
    .replace("{{AVAILABLE_CASH}}", `$${portfolio.available}`)
    .replace("{{CURRENT_ACCOUNT_VALUE}}", `$${portfolio.collateral}`)
    .replace("{{CURRENT_ACCOUNT_POSITIONS}}", JSON.stringify(openPositions))
    // console.log(enrichedPrompt)
//create 2 tools, createPositions and closeAllPosition
    const response = streamText({
        model: openrouter(account.modelName),
        prompt: enrichedPrompt,
        toolChoice: 'required',
        maxSteps: 10,
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
                    const txHash = await CreatePosition(account, symbol, side, quantity);
                    const result = `Position opened: ${quantity} ${symbol} ${side}, txHash: ${txHash}`;
                    logToolCall({ invocationId, tool: 'createPosition', args: { symbol, side, quantity }, result });
                    console.log(`[tool] createPosition success, txHash: ${txHash}`);
                    return result;
                  } catch (e) {
                    const error = String(e);
                    logToolCall({ invocationId, tool: 'createPosition', args: { symbol, side, quantity }, error });
                    console.error(`[tool] createPosition error:`, e);
                    return `Order failed: ${error}`;
                  }
                },
              },
            closePosition: {
              description: 'Close the open position for a specific market',
              inputSchema: z.object({
                symbol: z.enum(Object.keys(MARKETS) as [string, ...string[]]).describe('The market to close the position in'),
              }),
              execute: async ({ symbol }) => {
                console.log(`[tool] closePosition: ${symbol}`);
                try {
                  const txHash = await closePosition(account, symbol);
                  const result = `${symbol} position closed, txHash: ${txHash}`;
                  logToolCall({ invocationId, tool: 'closePosition', args: { symbol }, result });
                  return result;
                } catch (e) {
                  const error = String(e);
                  logToolCall({ invocationId, tool: 'closePosition', args: { symbol }, error });
                  console.error(`[tool] closePosition error:`, e);
                  return `Close failed for ${symbol}: ${error}`;
                }
              }
            },
            closeAllPositions: {
              description: 'Close all open positions across all markets',
              inputSchema: z.object({}),
              execute: async () => {
                console.log(`[tool] closeAllPositions`);
                try {
                  await closeAllPosition(account);
                  const result = 'All positions closed successfully';
                  logToolCall({ invocationId, tool: 'closeAllPositions', args: {}, result });
                  return result;
                } catch (e) {
                  const error = String(e);
                  logToolCall({ invocationId, tool: 'closeAllPositions', args: {}, error });
                  console.error(`[tool] closeAllPositions error:`, e);
                  return `Close failed: ${error}`;
                }
              }
            },
            hold: {
              description: 'Do nothing this cycle',
              inputSchema: z.object({ reason: z.string().describe('Brief reason for holding') }),
              execute: async ({ reason }) => {
                console.log(`[tool] hold: ${reason}`);
                logToolCall({ invocationId, tool: 'hold', args: { reason }, result: reason });
                return `Holding: ${reason}`;
              },
            }

}
    });

    await response.consumeStream();
    const text = await response.text;
    console.log('[agent] response:', text);
    return text;
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
        await Bun.sleep(30_000);
    }
}