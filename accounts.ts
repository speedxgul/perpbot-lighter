export interface Account {
    apiKey: string,
    accountIndex: Number,
    Name: string,
    modelName: string
}

export const SUPPORTED_ACCOUNTS: Account[] = [{
    apiKey: process.env['API_KEY_QWEN_SUBACC__WITH_INDEX_2'] ?? '',
    accountIndex: 281474976626206,
    Name: "Qwen",
    modelName: "anthropic/claude-opus-4-5",
}, {
    apiKey: process.env['API_KEY_MAIN_ACC'] ?? '',
    accountIndex: 687819,
    Name: "DeepSeek",
    modelName: "deepseek/deepseek-chat-v3.1",
}, {
    apiKey: process.env['API_KEY_XIAOMI'] ?? '',
    accountIndex: 687819,
    Name: "Xiaomi",
    modelName: "xiaomi/mimo-v2-flash",
}]