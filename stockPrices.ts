const BASE_URL = "https://mainnet.zklighter.elliot.ai";
const SOL_MARKET_ID = 2;

type Resolution = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

interface Candle {
    t: number;  // timestamp (ms)
    o: number;  // open
    h: number;  // high
    l: number;  // low
    c: number;  // close
    v: number;  // volume (base)
    V: number;  // volume (quote)
    i: number;
}

// interface CandlesResponse {
//     code: number;
//     r: string;
//     c: Candle[];
// }

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

const candles = await getKlines(SOL_MARKET_ID, "1m", 100, Date.now(), Date.now() - 1000 * 60 * 60 * 24);
console.log(`Got ${candles.length} candles`);
console.log(candles.slice(0, 3));