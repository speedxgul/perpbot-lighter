export interface Account {
    exchangeApiKey: string,   // Lighter DEX private key for signing orders
    accountIndex: Number,
    Name: string,
    modelName: string,        // OpenAI model name
}

export const SUPPORTED_ACCOUNTS: Account[] = [{
    exchangeApiKey: process.env['API_KEY_QWEN_SUBACC__WITH_INDEX_2'] ?? '',
    accountIndex: 281474976626206,
    Name: "Qwen",
    modelName: "gpt-5.5",
}, {
    exchangeApiKey: process.env['API_KEY_MAIN_ACC'] ?? '',
    accountIndex: 687819,
    Name: "DeepSeek",
    modelName: "gpt-5.5",
}, {
    exchangeApiKey: process.env['API_KEY_XIAOMI'] ?? '',
    accountIndex: 687819,
    Name: "Xiaomi",
    modelName: "gpt-5.5",
}]
