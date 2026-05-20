import type { Account } from "./accounts";
import { closePosition } from "./closeAllPosition";
import { getOpenOrders } from "./getPositions";
import { STOP_LOSS_PCT } from "./config";
import { logToolCall } from "./db";

export interface StopLossEvent {
    symbol: string;
    drawdown: number;
    closed: boolean;
    error?: string;
}

export async function applyStopLoss(account: Account, invocationId: number): Promise<StopLossEvent[]> {
    const positions = await getOpenOrders(account);
    const events: StopLossEvent[] = [];

    for (const p of positions ?? []) {
        if (!p.symbol) continue;
        if (Number(p.position) === 0) continue;

        const qty = Math.abs(Number(p.position));
        const entry = Number(p.entryPrice);
        if (entry === 0) continue;

        const notional = qty * entry;
        const drawdown = Number(p.unrealizedPnl) / notional;

        if (drawdown < -STOP_LOSS_PCT) {
            console.log(`[stop-loss] ${p.symbol} drawdown ${(drawdown * 100).toFixed(2)}% < -${(STOP_LOSS_PCT * 100).toFixed(2)}%, closing`);
            try {
                const txHash = await closePosition(account, p.symbol);
                logToolCall({
                    invocationId,
                    tool: 'stopLoss',
                    args: { symbol: p.symbol, drawdown, unrealizedPnl: p.unrealizedPnl, notional },
                    result: `Stop-loss closed ${p.symbol}, txHash: ${txHash}`,
                });
                events.push({ symbol: p.symbol, drawdown, closed: true });
            } catch (e) {
                const error = String(e);
                logToolCall({
                    invocationId,
                    tool: 'stopLoss',
                    args: { symbol: p.symbol, drawdown, unrealizedPnl: p.unrealizedPnl, notional },
                    error,
                });
                console.error(`[stop-loss] failed to close ${p.symbol}:`, e);
                events.push({ symbol: p.symbol, drawdown, closed: false, error });
            }
        }
    }

    return events;
}
