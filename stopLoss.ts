import type { Account } from "./accounts";
import { closePosition, NoOpenPositionError } from "./closeAllPosition";
import { getOpenOrders } from "./getPositions";
import { STOP_LOSS_PCT } from "./config";
import { logToolCall } from "./db";

export interface StopLossEvent {
    symbol: string;
    drawdown: number;
    closed: boolean;
    error?: string;
}

export function computeDrawdown(positionQty: number, entryPrice: number, unrealizedPnl: number): number | null {
    if (!Number.isFinite(positionQty) || positionQty <= 0) return null;
    if (!Number.isFinite(entryPrice) || entryPrice <= 0) return null;
    if (!Number.isFinite(unrealizedPnl)) return null;

    const notional = positionQty * entryPrice;
    if (!Number.isFinite(notional) || notional <= 0) return null;

    return unrealizedPnl / notional;
}

export async function applyStopLoss(account: Account, invocationId: number): Promise<StopLossEvent[]> {
    const positions = await getOpenOrders(account);
    const events: StopLossEvent[] = [];

    for (const p of positions ?? []) {
        if (!p.symbol) continue;
        if (Number(p.position) === 0) continue;

        const qty = Math.abs(Number(p.position));
        const entry = Number(p.entryPrice);
        const unrealizedPnl = Number(p.unrealizedPnl);
        const drawdown = computeDrawdown(qty, entry, unrealizedPnl);
        if (drawdown === null) {
            console.warn(`[stop-loss] skipped ${p.symbol} due to invalid numeric fields`);
            continue;
        }

        if (drawdown < -STOP_LOSS_PCT) {
            console.log(`[stop-loss] ${p.symbol} drawdown ${(drawdown * 100).toFixed(2)}% < -${(STOP_LOSS_PCT * 100).toFixed(2)}%, closing`);
            try {
                const txHash = await closePosition(account, p.symbol);
                logToolCall({
                    invocationId,
                    tool: 'stopLoss',
                    args: { symbol: p.symbol, drawdown, unrealizedPnl, entryPrice: entry, qty },
                    result: `Stop-loss closed ${p.symbol}, txHash: ${txHash}`,
                });
                events.push({ symbol: p.symbol, drawdown, closed: true });
            } catch (e) {
                if (e instanceof NoOpenPositionError) {
                    logToolCall({
                        invocationId,
                        tool: 'stopLoss',
                        args: { symbol: p.symbol, drawdown, unrealizedPnl, entryPrice: entry, qty },
                        result: `Stop-loss skipped for ${p.symbol}: already flat`,
                    });
                    events.push({ symbol: p.symbol, drawdown, closed: true });
                    continue;
                }

                const error = String(e);
                logToolCall({
                    invocationId,
                    tool: 'stopLoss',
                    args: { symbol: p.symbol, drawdown, unrealizedPnl, entryPrice: entry, qty },
                    error,
                });
                console.error(`[stop-loss] failed to close ${p.symbol}:`, e);
                events.push({ symbol: p.symbol, drawdown, closed: false, error });
            }
        }
    }

    return events;
}
