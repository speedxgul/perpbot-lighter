import { getEma, getMacd, getMidPrices } from "./indicators";

const BASE_URL = "https://mainnet.zklighter.elliot.ai";
const SOL_MARKET_ID = 2;

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

    const data:any = await response.json();
    return data.c;
}

// const candles = await getKlines(SOL_MARKET_ID, "1m", 100, Date.now(), Date.now() - 1000 * 60 * 60 * 24);
// console.log(`Got ${candles.length} `);
// console.log(candles.slice(-3));

export async function getIndicators(duration:Resolution, marketId:number):Promise<{midPrices:number[], ema20:number[], macd:number[]}> {
    const klines = await getKlines(marketId, duration, 100, Date.now(), Date.now() - 1000 * 60 * 60 * 24);
    const midPrices = await getMidPrices(klines);
    // console.log("midPrices", midPrices.slice(-3));
    const ema20 = await getEma(midPrices, 20);
    const macd = await getMacd(midPrices);
    return {
        midPrices:midPrices.slice(-5),
        ema20:ema20.slice(-5),
        macd:macd.slice(-5),
    }
}
const indicators = await getIndicators("5m", SOL_MARKET_ID)
console.log(indicators)