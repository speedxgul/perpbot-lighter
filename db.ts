import { Database } from "bun:sqlite";

const db = new Database("trading.db", { create: true });

db.run(`
  CREATE TABLE IF NOT EXISTS invocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_name TEXT NOT NULL,
    invocation_count INTEGER NOT NULL,
    collateral TEXT,
    available TEXT,
    open_positions TEXT,
    created_at INTEGER DEFAULT (unixepoch())
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS tool_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invocation_id INTEGER REFERENCES invocations(id),
    tool TEXT NOT NULL,
    args TEXT,
    result TEXT,
    error TEXT,
    created_at INTEGER DEFAULT (unixepoch())
  )
`);

const insertInvocation = db.prepare(`
  INSERT INTO invocations (account_name, invocation_count, collateral, available, open_positions)
  VALUES ($account_name, $invocation_count, $collateral, $available, $open_positions)
`);

const insertToolCall = db.prepare(`
  INSERT INTO tool_calls (invocation_id, tool, args, result, error)
  VALUES ($invocation_id, $tool, $args, $result, $error)
`);

export function logInvocation(params: {
    accountName: string;
    invocationCount: number;
    collateral: string;
    available: string;
    openPositions: object;
}): number {
    const result = insertInvocation.run({
        $account_name: params.accountName,
        $invocation_count: params.invocationCount,
        $collateral: params.collateral,
        $available: params.available,
        $open_positions: JSON.stringify(params.openPositions),
    });
    return Number(result.lastInsertRowid);
}

export function logToolCall(params: {
    invocationId: number;
    tool: string;
    args: object;
    result?: string;
    error?: string;
}): void {
    insertToolCall.run({
        $invocation_id: params.invocationId,
        $tool: params.tool,
        $args: JSON.stringify(params.args),
        $result: params.result ?? null,
        $error: params.error ?? null,
    });
}
