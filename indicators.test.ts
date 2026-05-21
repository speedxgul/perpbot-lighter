import { describe, expect, test } from "bun:test";
import { getEma, getMacd, getRsi } from "./indicators";

describe("getEma", () => {
    test("throws when there are not enough points", () => {
        expect(() => getEma([1, 2, 3], 5)).toThrow("Not enough prices provided");
    });

    test("uses the first period SMA as the initial value", () => {
        const prices = [10, 20, 30, 40];
        const ema = getEma(prices, 3);
        expect(ema[0]).toBeCloseTo((10 + 20 + 30) / 3, 6);
        expect(ema.length).toBe(2);
    });
});

describe("getMacd", () => {
    test("returns one MACD point per EMA26 point", () => {
        const prices = Array.from({ length: 40 }, (_, i) => 100 + i);
        const macd = getMacd(prices);
        expect(macd.length).toBe(15);
        expect(macd.every((value) => Number.isFinite(value))).toBe(true);
    });
});

describe("getRsi", () => {
    test("returns empty when not enough values", () => {
        expect(getRsi([1, 2, 3, 4], 14)).toEqual([]);
    });

    test("keeps RSI in [0, 100]", () => {
        const prices = [100, 101, 99, 102, 103, 101, 104, 106, 105, 107, 108, 107, 109, 110, 111, 110, 112];
        const rsis = getRsi(prices, 14);
        expect(rsis.length).toBeGreaterThan(0);
        for (const value of rsis) {
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(100);
        }
    });
});
