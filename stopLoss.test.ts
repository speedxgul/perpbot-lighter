import { describe, expect, test } from "bun:test";
import { STOP_LOSS_PCT } from "./config";
import { computeDrawdown } from "./stopLoss";

describe("computeDrawdown", () => {
    test("returns drawdown as unrealized pnl divided by notional", () => {
        const drawdown = computeDrawdown(2, 100, -10);
        expect(drawdown).toBeCloseTo(-0.05, 6);
    });

    test("returns null for invalid numeric input", () => {
        expect(computeDrawdown(0, 100, -10)).toBeNull();
        expect(computeDrawdown(2, 0, -10)).toBeNull();
        expect(computeDrawdown(2, 100, Number.NaN)).toBeNull();
    });

    test("crosses configured threshold when drawdown is deep enough", () => {
        const drawdown = computeDrawdown(1, 100, -3);
        if (drawdown === null) {
            throw new Error("drawdown should be computed for valid inputs");
        }
        expect(drawdown < -STOP_LOSS_PCT).toBe(true);
    });
});
