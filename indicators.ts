import type { Candlestick } from "./lighter-sdk-ts/generated";

export function getEma(prices:number[], period:number){
    const mult = 2 / (period + 1)

    const sma_number = prices.length - period;

    if (sma_number<1){
        throw new Error ("Not Enough Prices Provided");
    }
    let sma = 0;
    for( let i=0; i< sma_number; i++){
        sma += prices[i] ?? 0;
    }
    sma = sma / sma_number;

    let emas = [sma]
    for( let i=0; i<period; i++){
        let ema = (emas[emas.length-1]??0) + mult * ((prices[prices.length -period + i]??0) - (emas[emas.length-1]??0))
        emas.push(ema)
    }
    return emas

}

export function getMidPrices(klines:Candlestick[]){
    const midPrices = klines.candlesticks.map((candlestick)=>{ return Number(((candlestick.open+candlestick.close)/2).toFixed(2))});
    return midPrices; 
}
// get back to this
//macd =  ema26 - ema14
export function getMacd(prices: number[]){

   const ema26 = getEma(prices,26);
   const ema12 = getEma(prices,12);
   
}
