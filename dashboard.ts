import { Database } from "bun:sqlite";

const db = new Database("trading.db", { readonly: true });

interface InvocationRow {
    id: number;
    account_name: string;
    invocation_count: number;
    collateral: string | null;
    available: string | null;
    open_positions: string | null;
    created_at: number;
}

interface ToolCallRow {
    id: number;
    invocation_id: number;
    tool: string;
    args: string | null;
    result: string | null;
    error: string | null;
    created_at: number;
    invocation_count: number;
}

interface PositionSnapshot {
    symbol: string;
    position: string;
    unrealizedPnl: string;
    realizedPnl: string;
    entryPrice: string;
    liquidationPrice: string;
    sign: number;
}

interface Trade {
    symbol: string;
    side: "LONG" | "SHORT";
    qty: number;
    entryPrice: number;
    exitPrice: number | null;
    entryTime: number;
    exitTime: number | null;
    realizedPnl: number;
    holdSeconds: number | null;
    open: boolean;
}

function parsePositions(raw: string | null): PositionSnapshot[] {
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
}

// Reconstruct trades by walking position snapshots per symbol.
// Open: position transitions from 0 → non-zero. Close: non-zero → 0
// (or sign flip = close + reopen). PnL of a closed trade = cumulative
// realizedPnl at close - cumulative realizedPnl at open (per symbol).
function computeTrades(invocations: InvocationRow[]): Trade[] {
    const trades: Trade[] = [];
    const open: Record<string, { trade: Trade; realizedAtOpen: number } | undefined> = {};
    const lastRealizedBySymbol: Record<string, number> = {};

    for (const inv of invocations) {
        const positions = parsePositions(inv.open_positions);
        const seen = new Set<string>();

        for (const p of positions) {
            seen.add(p.symbol);
            const qty = Math.abs(Number(p.position));
            const realized = Number(p.realizedPnl) || 0;
            const entryPrice = Number(p.entryPrice) || 0;
            const cur = open[p.symbol];
            lastRealizedBySymbol[p.symbol] = realized;

            if (qty > 0) {
                if (!cur) {
                    open[p.symbol] = {
                        trade: {
                            symbol: p.symbol,
                            side: p.sign === 1 ? "LONG" : "SHORT",
                            qty,
                            entryPrice,
                            exitPrice: null,
                            entryTime: inv.created_at,
                            exitTime: null,
                            realizedPnl: 0,
                            holdSeconds: null,
                            open: true,
                        },
                        realizedAtOpen: realized,
                    };
                } else if (entryPrice && Math.abs(entryPrice - cur.trade.entryPrice) / cur.trade.entryPrice > 0.001) {
                    cur.trade.exitTime = inv.created_at;
                    cur.trade.realizedPnl = realized - cur.realizedAtOpen;
                    cur.trade.holdSeconds = inv.created_at - cur.trade.entryTime;
                    cur.trade.open = false;
                    trades.push(cur.trade);
                    open[p.symbol] = {
                        trade: {
                            symbol: p.symbol,
                            side: p.sign === 1 ? "LONG" : "SHORT",
                            qty,
                            entryPrice,
                            exitPrice: null,
                            entryTime: inv.created_at,
                            exitTime: null,
                            realizedPnl: 0,
                            holdSeconds: null,
                            open: true,
                        },
                        realizedAtOpen: realized,
                    };
                }
            } else if (cur) {
                cur.trade.exitTime = inv.created_at;
                cur.trade.realizedPnl = realized - cur.realizedAtOpen;
                cur.trade.holdSeconds = inv.created_at - cur.trade.entryTime;
                cur.trade.open = false;
                trades.push(cur.trade);
                open[p.symbol] = undefined;
            }
        }

        // Symbols that disappeared from open_positions count as closed too.
        for (const sym of Object.keys(open)) {
            const cur = open[sym];
            if (cur && !seen.has(sym)) {
                cur.trade.exitTime = inv.created_at;
                const latestRealized = lastRealizedBySymbol[sym] ?? cur.realizedAtOpen;
                cur.trade.realizedPnl = latestRealized - cur.realizedAtOpen;
                cur.trade.holdSeconds = inv.created_at - cur.trade.entryTime;
                cur.trade.open = false;
                trades.push(cur.trade);
                open[sym] = undefined;
            }
        }
    }

    for (const sym of Object.keys(open)) {
        const cur = open[sym];
        if (cur) trades.push(cur.trade);
    }

    return trades.sort((a, b) => (a.entryTime - b.entryTime));
}

function computeMetrics(invocations: InvocationRow[], toolCalls: ToolCallRow[], trades: Trade[]) {
    if (invocations.length === 0) {
        return {
            startEquity: 0, currentEquity: 0, peakEquity: 0,
            totalReturn: 0, totalReturnPct: 0,
            maxDrawdown: 0, maxDrawdownPct: 0,
            unrealizedPnl: 0, realizedPnl: 0,
            totalTrades: 0, openTrades: 0, closedTrades: 0,
            wins: 0, losses: 0, winRatePct: 0,
            avgWin: 0, avgLoss: 0,
            bestTrade: null as Trade | null, worstTrade: null as Trade | null,
            perSymbol: {} as Record<string, { trades: number; realizedPnl: number; winRate: number }>,
            actionCounts: {} as Record<string, number>,
        };
    }

    const equityFromInv = (inv: InvocationRow) => {
        const pos = parsePositions(inv.open_positions);
        const unrealized = pos.reduce((s, p) => s + (Number(p.unrealizedPnl) || 0), 0);
        return (Number(inv.collateral) || 0) + unrealized;
    };

    const equitySeries = invocations.map(equityFromInv);
    const startEquity = equitySeries[0]!;
    const currentEquity = equitySeries[equitySeries.length - 1]!;
    let peakEquity = startEquity;
    let maxDrawdown = 0;
    for (const e of equitySeries) {
        if (e > peakEquity) peakEquity = e;
        const dd = peakEquity - e;
        if (dd > maxDrawdown) maxDrawdown = dd;
    }

    const latestPos = parsePositions(invocations[invocations.length - 1]!.open_positions);
    const unrealizedPnl = latestPos.reduce((s, p) => s + (Number(p.unrealizedPnl) || 0), 0);

    const closed = trades.filter(t => !t.open);
    const realizedPnl = closed.reduce((s, t) => s + t.realizedPnl, 0);
    const wins = closed.filter(t => t.realizedPnl > 0);
    const losses = closed.filter(t => t.realizedPnl < 0);
    const avgWin = wins.length ? wins.reduce((s, t) => s + t.realizedPnl, 0) / wins.length : 0;
    const avgLoss = losses.length ? losses.reduce((s, t) => s + t.realizedPnl, 0) / losses.length : 0;
    const bestTrade = closed.reduce<Trade | null>((b, t) => (!b || t.realizedPnl > b.realizedPnl ? t : b), null);
    const worstTrade = closed.reduce<Trade | null>((w, t) => (!w || t.realizedPnl < w.realizedPnl ? t : w), null);

    const perSymbol: Record<string, { trades: number; realizedPnl: number; winRate: number }> = {};
    for (const t of closed) {
        const s = perSymbol[t.symbol] ?? { trades: 0, realizedPnl: 0, winRate: 0 };
        s.trades += 1;
        s.realizedPnl += t.realizedPnl;
        perSymbol[t.symbol] = s;
    }
    for (const sym of Object.keys(perSymbol)) {
        const w = closed.filter(t => t.symbol === sym && t.realizedPnl > 0).length;
        perSymbol[sym]!.winRate = perSymbol[sym]!.trades ? (w / perSymbol[sym]!.trades) * 100 : 0;
    }

    const actionCounts: Record<string, number> = {};
    for (const tc of toolCalls) actionCounts[tc.tool] = (actionCounts[tc.tool] ?? 0) + 1;

    return {
        startEquity,
        currentEquity,
        peakEquity,
        totalReturn: currentEquity - startEquity,
        totalReturnPct: startEquity ? ((currentEquity - startEquity) / startEquity) * 100 : 0,
        maxDrawdown,
        maxDrawdownPct: peakEquity ? (maxDrawdown / peakEquity) * 100 : 0,
        unrealizedPnl,
        realizedPnl,
        totalTrades: trades.length,
        openTrades: trades.filter(t => t.open).length,
        closedTrades: closed.length,
        wins: wins.length,
        losses: losses.length,
        winRatePct: closed.length ? (wins.length / closed.length) * 100 : 0,
        avgWin,
        avgLoss,
        bestTrade,
        worstTrade,
        perSymbol,
        actionCounts,
    };
}

function getData() {
    const invocations = db.query(`
        SELECT id, account_name, invocation_count, collateral, available, open_positions, created_at
        FROM invocations ORDER BY created_at ASC
    `).all() as InvocationRow[];

    const toolCalls = db.query(`
        SELECT tc.id, tc.invocation_id, tc.tool, tc.args, tc.result, tc.error, tc.created_at,
               i.invocation_count
        FROM tool_calls tc
        JOIN invocations i ON tc.invocation_id = i.id
        ORDER BY tc.created_at DESC LIMIT 200
    `).all() as ToolCallRow[];

    const trades = computeTrades(invocations);
    const metrics = computeMetrics(invocations, toolCalls, trades);

    return { invocations, toolCalls, trades, metrics };
}

const html = await Bun.file("dashboard.html").text();

Bun.serve({
    port: 3001,
    routes: {
        "/": () => new Response(html, { headers: { "Content-Type": "text/html" } }),

        "/api/data": {
            GET: () => Response.json(getData()),
        },

        "/api/stream": {
            GET: (req) => {
                const encoder = new TextEncoder();
                const stream = new ReadableStream({
                    start(controller) {
                        const send = () => {
                            try {
                                const payload = JSON.stringify(getData());
                                controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
                            } catch (error) {
                                console.error("[dashboard] stream update failed:", error);
                            }
                        };

                        send();
                        const interval = setInterval(send, 5000);

                        req.signal.addEventListener("abort", () => {
                            clearInterval(interval);
                            try { controller.close(); } catch { }
                        });
                    },
                });

                return new Response(stream, {
                    headers: {
                        "Content-Type": "text/event-stream",
                        "Cache-Control": "no-cache",
                        "Connection": "keep-alive",
                    },
                });
            },
        },
    },
});

console.log("Dashboard → http://localhost:3001");
