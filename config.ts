export const API_KEY_INDEX = 2;
export const BASE_URL = "https://mainnet.zklighter.elliot.ai";

// Stop-loss: close a position if drawdown exceeds this fraction of notional value.
// 0.02 = 2% of notional ≈ 20% margin loss at 10x leverage.
export const STOP_LOSS_PCT = 0.02;