export interface Account {
    exchangeApiKey: string; // Lighter DEX private key for signing orders
    accountIndex: number;
    name: string;
    modelName: string; // OpenAI model name
}

export const SUPPORTED_ACCOUNTS: Account[] = [{
    exchangeApiKey: process.env['API_KEY_QWEN_SUBACC__WITH_INDEX_2'] ?? '',
    accountIndex: 281474976626206,
    name: "Qwen",
    modelName: "gpt-5.5",
}, {
    exchangeApiKey: process.env['API_KEY_MAIN_ACC'] ?? '',
    accountIndex: 687819,
    name: "DeepSeek",
    modelName: "gpt-5.5",
}, {
    exchangeApiKey: process.env['API_KEY_XIAOMI'] ?? '',
    accountIndex: 687819,
    name: "Xiaomi",
    modelName: "gpt-5.5",
}];

export function assertAccountConfigured(account: Account): void {
    if (!account.exchangeApiKey.trim()) {
        throw new Error(`Missing exchangeApiKey for account "${account.name}"`);
    }
    if (!Number.isFinite(account.accountIndex)) {
        throw new Error(`Invalid accountIndex for account "${account.name}"`);
    }
}

export function warnIfDuplicateAccountIndexes(accounts: Account[]): void {
    const seen = new Set<number>();
    const duplicates = new Set<number>();
    for (const account of accounts) {
        if (seen.has(account.accountIndex)) {
            duplicates.add(account.accountIndex);
        }
        seen.add(account.accountIndex);
    }
    if (duplicates.size > 0) {
        console.warn(
            `[config] Duplicate accountIndex configured: ${Array.from(duplicates).join(", ")}`
        );
    }
}
