import { getEma, getMacd, getMidPrices, getRsi } from "./indicators";
import { BASE_URL } from "./config";

type Resolution = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export interface Candle {
    t: number;  // timestamp (ms)
    o: number;  // open
    h: number;  // high
    l: number;  // low
    c: number;  // close
    v: number;  // volume (base)
    V: number;  // volume (quote)
    i: number;
}

function toFiniteNumber(value: unknown, field: string, candleIndex: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        throw new Error(`Invalid candle field "${field}" at index ${candleIndex}`);
    }
    return parsed;
}

function parseCandle(raw: Record<string, unknown>, index: number): Candle {
    return {
        t: toFiniteNumber(raw.t, "t", index),
        o: toFiniteNumber(raw.o, "o", index),
        h: toFiniteNumber(raw.h, "h", index),
        l: toFiniteNumber(raw.l, "l", index),
        c: toFiniteNumber(raw.c, "c", index),
        v: toFiniteNumber(raw.v, "v", index),
        V: toFiniteNumber(raw.V ?? raw.v, "V", index),
        i: toFiniteNumber(raw.i ?? index, "i", index),
    };
}


export async function getKlines(
    marketId: number ,
    resolution: Resolution,
    countBack: number,
    endTimestamp: number,
    startTimestamp: number,
): Promise<Candle[]> {
    const start = startTimestamp ?? endTimestamp - 86400;
    const url = `${BASE_URL}/api/v1/candles?market_id=${marketId}&resolution=${resolution}&start_timestamp=${start}&end_timestamp=${endTimestamp}&count_back=${countBack}`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Candles request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { c?: unknown };
    if (!Array.isArray(data.c)) {
        throw new Error("Candles response missing array field `c`");
    }

    return data.c.map((raw, index) => {
        if (!raw || typeof raw !== "object") {
            throw new Error(`Invalid candle object at index ${index}`);
        }
        return parseCandle(raw as Record<string, unknown>, index);
    });
}

export async function getIndicators(duration:Resolution, marketId:number):Promise<{midPrices:number[], ema20:number[], macd:number[], rsi:number[]}> {
    const klines = await getKlines(marketId, duration, 100, Date.now(), Date.now() - 1000 * 60 * 60 * 24);
    const midPrices = getMidPrices(klines);
    const ema20 = getEma(midPrices, 20);
    const macd = getMacd(midPrices);
    const rsi = getRsi(midPrices);
    return {
        midPrices: midPrices.slice(-10),
        ema20: ema20.slice(-10),
        macd: macd.slice(-10),
        rsi: rsi.slice(-5),
    }
}
