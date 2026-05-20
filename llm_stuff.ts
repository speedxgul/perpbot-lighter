import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
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
import { applyStopLoss } from './stopLoss';
import { STOP_LOSS_PCT } from './config';

(globalThis as any).AI_SDK_LOG_WARNINGS = false;

async function snapshotState(account: Account): Promise<string> {
    const [positions, portfolio] = await Promise.all([
        getOpenOrders(account),
        getPortfolio(account),
    ]);
    const compact = positions?.map(p => `${p.symbol}: ${p.position} (PnL ${p.unrealizedPnl})`).join("; ") ?? "none";
    return `\n[State] Available: $${portfolio.available}, Collateral: $${portfolio.collateral}, Positions: ${compact}`;
}

const openai = createOpenAI({ apiKey: process.env['OPENAI_API_KEY'] ?? '' });

function getModel(account: Account) {
    return openai(account.modelName);
}

export const invokeAgent = async (account: Account, invocationCount = 0) => {

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

    `;
        }));
    const ALL_INDICATOR_DATA = arrayOfIndicatorsData.join("\n");

    const openPositions = await getOpenOrders(account);
    console.log(openPositions);
    const portfolio = await getPortfolio(account);

    const invocationId = logInvocation({
        accountName: account.Name,
        invocationCount,
        collateral: portfolio.collateral,
        available: portfolio.available,
        openPositions: openPositions ?? [],
    });

    // Code-level stop-loss: force-close any position past the drawdown threshold
    // BEFORE the model is invoked. The model then sees the post-stop-loss state.
    const stopLossEvents = await applyStopLoss(account, invocationId);
    if (stopLossEvents.length > 0) {
        console.log(`[stop-loss] triggered:`, stopLossEvents);
    }

    // Re-fetch positions if stop-loss closed anything, so the prompt reflects reality
    const currentPositions = stopLossEvents.some(e => e.closed)
        ? (await getOpenOrders(account)) ?? []
        : openPositions ?? [];
    const currentPortfolio = stopLossEvents.some(e => e.closed)
        ? await getPortfolio(account)
        : portfolio;

    const stopLossSummary = stopLossEvents.length > 0
        ? `\nStop-loss triggered this cycle: ${stopLossEvents.map(e => `${e.symbol} (${(e.drawdown * 100).toFixed(2)}%)`).join(", ")}`
        : "";

    const enrichedPrompt = PROMPT.replace("{{INVOKATION_TIMES}}", String(invocationCount))
        .replace("{{OPEN_POSITIONS}}", currentPositions.map(p => `${p.symbol} ${p.position} ${p.sign}`).join(", "))
        .replace("{{ALL_INDICATOR_DATA}}", ALL_INDICATOR_DATA ?? "")
        .replace("{{AVAILABLE_CASH}}", `$${currentPortfolio.available}`)
        .replace("{{CURRENT_ACCOUNT_VALUE}}", `$${currentPortfolio.collateral}`)
        .replace("{{CURRENT_ACCOUNT_POSITIONS}}", JSON.stringify(currentPositions))
        .replace("{{STOP_LOSS_PCT}}", `${(STOP_LOSS_PCT * 100).toFixed(1)}%`)
        .replace("{{STOP_LOSS_EVENTS}}", stopLossSummary);

    const marketSymbols = Object.keys(MARKETS) as [string, ...string[]];

    const decisionSchema = z.discriminatedUnion('action', [
        z.object({ symbol: z.enum(marketSymbols), action: z.literal('hold'), reason: z.string().describe('Include price vs EMA20, MACD direction on both timeframes, unrealized PnL') }),
        z.object({ symbol: z.enum(marketSymbols), action: z.literal('openLong'), quantity: z.number(), reason: z.string() }),
        z.object({ symbol: z.enum(marketSymbols), action: z.literal('openShort'), quantity: z.number(), reason: z.string() }),
        z.object({ symbol: z.enum(marketSymbols), action: z.literal('close'), reason: z.string() }),
        z.object({ symbol: z.enum(marketSymbols), action: z.literal('closeAndOpenLong'), quantity: z.number(), reason: z.string() }),
        z.object({ symbol: z.enum(marketSymbols), action: z.literal('closeAndOpenShort'), quantity: z.number(), reason: z.string() }),
    ]);

    const response = streamText({
        model: getModel(account),
        prompt: enrichedPrompt,
        toolChoice: 'required',
        maxSteps: 1,
        tools: {
            evaluateAllMarkets: {
                description: 'Submit one decision per market (SOL, ZEC, HYPE) in a single call',
                inputSchema: z.object({
                    decisions: z.array(decisionSchema).length(3).describe('Exactly 3 decisions — one per market: SOL, ZEC, HYPE'),
                }),
                execute: async ({ decisions }) => {
                    const results: string[] = [];
                    for (const d of decisions) {
                        try {
                            if (d.action === 'hold') {
                                console.log(`[hold] ${d.symbol}: ${d.reason}`);
                                logToolCall({ invocationId, tool: 'holdPosition', args: d, result: d.reason });
                                results.push(`${d.symbol}: hold`);
                            } else if (d.action === 'openLong' || d.action === 'openShort') {
                                const side = d.action === 'openLong' ? 'LONG' : 'SHORT';
                                console.log(`[open] ${side} ${d.quantity} ${d.symbol}`);
                                const txHash = await CreatePosition(account, d.symbol, side, d.quantity);
                                logToolCall({ invocationId, tool: 'createPosition', args: d, result: txHash });
                                results.push(`${d.symbol}: opened ${side} ${d.quantity}, tx ${txHash}`);
                            } else if (d.action === 'close') {
                                console.log(`[close] ${d.symbol}`);
                                const txHash = await closePosition(account, d.symbol);
                                logToolCall({ invocationId, tool: 'closePosition', args: d, result: txHash });
                                results.push(`${d.symbol}: closed, tx ${txHash}`);
                            } else if (d.action === 'closeAndOpenLong' || d.action === 'closeAndOpenShort') {
                                const side = d.action === 'closeAndOpenLong' ? 'LONG' : 'SHORT';
                                console.log(`[reverse] ${d.symbol} → ${side}`);
                                const closeTx = await closePosition(account, d.symbol);
                                const openTx = await CreatePosition(account, d.symbol, side, d.quantity);
                                logToolCall({ invocationId, tool: 'reversePosition', args: d, result: `close ${closeTx}, open ${openTx}` });
                                results.push(`${d.symbol}: reversed to ${side} ${d.quantity}`);
                            }
                        } catch (e) {
                            const error = String(e);
                            logToolCall({ invocationId, tool: d.action, args: d, error });
                            console.error(`[error] ${d.symbol} ${d.action}:`, e);
                            results.push(`${d.symbol}: failed — ${error}`);
                        }
                    }
                    return results.join('\n');
                },
            },
        },
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
