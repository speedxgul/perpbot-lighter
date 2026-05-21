import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { z } from 'zod';
import { PROMPT } from './prompt';
import { getOpenOrders } from './getPositions';
import { SUPPORTED_ACCOUNTS, assertAccountConfigured, type Account, warnIfDuplicateAccountIndexes } from './accounts';
import { getPortfolio } from './getPortfolio';
import { getIndicators } from './stockPrices';
import { MARKETS } from './markets';
import { createPosition } from './createPosition';
import { NoOpenPositionError, closePosition } from './closeAllPosition';
import { logInvocation, logToolCall } from './db';
import { applyStopLoss } from './stopLoss';
import { STOP_LOSS_PCT } from './config';

(globalThis as any).AI_SDK_LOG_WARNINGS = false;

const openai = createOpenAI({ apiKey: process.env['OPENAI_API_KEY'] ?? '' });

function getModel(account: Account) {
    if (!process.env['OPENAI_API_KEY']?.trim()) {
        throw new Error('Missing OPENAI_API_KEY');
    }
    return openai(account.modelName);
}

function hasOpenPosition(positionBySymbol: Map<string, number>, symbol: string): boolean {
    const qty = positionBySymbol.get(symbol);
    return Number.isFinite(qty) && (qty ?? 0) !== 0;
}

function positionSide(positionBySymbol: Map<string, number>, symbol: string): "LONG" | "SHORT" | "FLAT" {
    const qty = positionBySymbol.get(symbol) ?? 0;
    if (!Number.isFinite(qty) || qty === 0) return "FLAT";
    return qty > 0 ? "LONG" : "SHORT";
}

export const invokeAgent = async (account: Account, invocationCount = 0) => {
    assertAccountConfigured(account);

    const marketKeys = Object.keys(MARKETS) as (keyof typeof MARKETS)[];

    // Fetch all 6 timeframe+market combinations plus portfolio/positions in parallel
    const [allIndicators, openPositions, portfolio] = await Promise.all([
        Promise.all(
            marketKeys.map(marketSlug =>
                Promise.all([
                    getIndicators("5m", MARKETS[marketSlug].marketId),
                    getIndicators("4h", MARKETS[marketSlug].marketId),
                ])
            )
        ),
        getOpenOrders(account),
        getPortfolio(account),
    ]);

    console.log(openPositions);

    const arrayOfIndicatorsData = marketKeys.map((marketSlug, i) => {
        const [intradayIndicators, longTermIndicators] = allIndicators[i]!;
        return `
    MARKET - ${marketSlug}
    Intraday (5m candles) (oldest → latest):
    Mid prices - [${intradayIndicators.midPrices.join(",")}]
    EMA20 - [${intradayIndicators.ema20.join(",")}]
    MACD - [${intradayIndicators.macd.join(",")}]
    RSI(14) - [${intradayIndicators.rsi.join(",")}]

    Long Term (4h candles) (oldest → latest):
    Mid prices - [${longTermIndicators.midPrices.join(",")}]
    EMA20 - [${longTermIndicators.ema20.join(",")}]
    MACD - [${longTermIndicators.macd.join(",")}]
    RSI(14) - [${longTermIndicators.rsi.join(",")}]

    `;
    });
    const ALL_INDICATOR_DATA = arrayOfIndicatorsData.join("\n");

    const invocationId = logInvocation({
        accountName: account.name,
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

    const enrichedPrompt = PROMPT.replace("{{INVOCATION_COUNT}}", String(invocationCount))
        .replace("{{ALL_INDICATOR_DATA}}", ALL_INDICATOR_DATA ?? "")
        .replace("{{AVAILABLE_CASH}}", `$${currentPortfolio.available}`)
        .replace("{{CURRENT_ACCOUNT_VALUE}}", `$${currentPortfolio.collateral}`)
        .replace("{{CURRENT_ACCOUNT_POSITIONS}}", JSON.stringify(currentPositions))
        .replace("{{STOP_LOSS_PCT}}", `${(STOP_LOSS_PCT * 100).toFixed(1)}%`)
        .replace("{{STOP_LOSS_EVENTS}}", stopLossSummary);

    const marketSymbols = Object.keys(MARKETS) as [string, ...string[]];
    const quantitySchema = z.number().finite().positive();

    const decisionSchema = z.discriminatedUnion('action', [
        z.object({ symbol: z.enum(marketSymbols), action: z.literal('hold'), reason: z.string().describe('Include price vs EMA20, MACD direction on both timeframes, unrealized PnL') }),
        z.object({ symbol: z.enum(marketSymbols), action: z.literal('openLong'), quantity: quantitySchema, reason: z.string() }),
        z.object({ symbol: z.enum(marketSymbols), action: z.literal('openShort'), quantity: quantitySchema, reason: z.string() }),
        z.object({ symbol: z.enum(marketSymbols), action: z.literal('close'), reason: z.string() }),
        z.object({ symbol: z.enum(marketSymbols), action: z.literal('closeAndOpenLong'), quantity: quantitySchema, reason: z.string() }),
        z.object({ symbol: z.enum(marketSymbols), action: z.literal('closeAndOpenShort'), quantity: quantitySchema, reason: z.string() }),
    ]);

    const evaluateInputSchema = z.object({
        decisions: z
            .array(decisionSchema)
            .length(marketSymbols.length)
            .describe('Exactly 3 decisions - one per market: SOL, ZEC, HYPE'),
    }).refine(
        ({ decisions }) => new Set(decisions.map(d => d.symbol)).size === marketSymbols.length,
        { message: 'Decisions must include each market exactly once', path: ['decisions'] }
    );

    const response = streamText({
        model: getModel(account),
        prompt: enrichedPrompt,
        toolChoice: 'required',
        tools: {
            evaluateAllMarkets: {
                description: 'Submit one decision per market (SOL, ZEC, HYPE) in a single call',
                inputSchema: evaluateInputSchema,
                execute: async ({ decisions }) => {
                    const results: string[] = [];
                    const positionBySymbol = new Map<string, number>();
                    for (const p of currentPositions) {
                        if (!p.symbol) continue;
                        positionBySymbol.set(p.symbol, Number(p.position));
                    }

                    for (const d of decisions) {
                        try {
                            if (d.action === 'hold') {
                                console.log(`[hold] ${d.symbol}: ${d.reason}`);
                                logToolCall({ invocationId, tool: 'holdPosition', args: d, result: d.reason });
                                results.push(`${d.symbol}: hold`);
                            } else if (d.action === 'openLong' || d.action === 'openShort') {
                                const side = d.action === 'openLong' ? 'LONG' : 'SHORT';
                                const currentSide = positionSide(positionBySymbol, d.symbol);
                                if (currentSide !== "FLAT" && currentSide !== side) {
                                    throw new Error(`Cannot ${d.action} on ${d.symbol}; opposite ${currentSide} position open. Use closeAndOpen${side === "LONG" ? "Long" : "Short"} to reverse.`);
                                }
                                const isScaleIn = currentSide === side;
                                console.log(`[${isScaleIn ? "scale-in" : "open"}] ${side} ${d.quantity} ${d.symbol}`);
                                const txHash = await createPosition(account, d.symbol, side, d.quantity);
                                const prevQty = positionBySymbol.get(d.symbol) ?? 0;
                                const delta = side === 'LONG' ? d.quantity : -d.quantity;
                                positionBySymbol.set(d.symbol, prevQty + delta);
                                logToolCall({
                                    invocationId,
                                    tool: isScaleIn ? 'scaleInPosition' : 'createPosition',
                                    args: d,
                                    result: txHash,
                                });
                                results.push(`${d.symbol}: ${isScaleIn ? "scaled in" : "opened"} ${side} ${d.quantity}, tx ${txHash}`);
                            } else if (d.action === 'close') {
                                if (!hasOpenPosition(positionBySymbol, d.symbol)) {
                                    logToolCall({ invocationId, tool: 'closePosition', args: d, result: `${d.symbol} already flat` });
                                    results.push(`${d.symbol}: already flat`);
                                    continue;
                                }
                                console.log(`[close] ${d.symbol}`);
                                let txHash: string;
                                try {
                                    txHash = await closePosition(account, d.symbol);
                                } catch (e) {
                                    if (e instanceof NoOpenPositionError) {
                                        positionBySymbol.set(d.symbol, 0);
                                        logToolCall({ invocationId, tool: 'closePosition', args: d, result: `${d.symbol} already flat` });
                                        results.push(`${d.symbol}: already flat`);
                                        continue;
                                    }
                                    throw e;
                                }
                                positionBySymbol.set(d.symbol, 0);
                                logToolCall({ invocationId, tool: 'closePosition', args: d, result: txHash });
                                results.push(`${d.symbol}: closed, tx ${txHash}`);
                            } else if (d.action === 'closeAndOpenLong' || d.action === 'closeAndOpenShort') {
                                const side = d.action === 'closeAndOpenLong' ? 'LONG' : 'SHORT';
                                console.log(`[reverse] ${d.symbol} → ${side}`);

                                let closeTx = 'already flat';
                                if (hasOpenPosition(positionBySymbol, d.symbol)) {
                                    try {
                                        closeTx = await closePosition(account, d.symbol);
                                    } catch (e) {
                                        if (!(e instanceof NoOpenPositionError)) {
                                            throw e;
                                        }
                                    }
                                }

                                const openTx = await createPosition(account, d.symbol, side, d.quantity);
                                positionBySymbol.set(d.symbol, side === 'LONG' ? d.quantity : -d.quantity);
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
    warnIfDuplicateAccountIndexes(SUPPORTED_ACCOUNTS);
    const account = SUPPORTED_ACCOUNTS[0];
    if (!account) {
        throw new Error('No accounts configured in SUPPORTED_ACCOUNTS');
    }
    assertAccountConfigured(account);

    let invocationCount = 0;
    while (true) {
        console.log(`\n--- Invocation #${invocationCount} ---`);
        try {
            await invokeAgent(account, invocationCount);
        } catch (e) {
            console.error('Agent error:', e);
        }
        invocationCount++;
        await Bun.sleep(25_000);
    }
}
