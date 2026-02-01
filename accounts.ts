export interface Account {
    apiKey: string,
    Name: string,
    modelName: string
}

export const SUPPORTED_ACCOUNTS: Account[] = [{
    apiKey: process.env['API_KEY_QWEN'] ?? '',
    Name: "Qwen",
    modelName: "qwen/qwen3-coder",
}, {
    apiKey: process.env['API_KEY_DEEPSEEK'] ?? '',
    Name: "DeepSeek",
    modelName: "deepseek/deepseek-chat-v3.1",
}, {
    apiKey: process.env['API_KEY_XIAOMI'] ?? '',
    Name: "Xiaomi",
    modelName: "xiaomi/mimo-v2-flash",
}]