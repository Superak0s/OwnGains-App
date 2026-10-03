import type { Product, Purchase } from "expo-iap";
import { sortTips, tipsToConsume } from "../tipJar";

const product = (id: string, price: number | null): Product =>
  ({ id, price, displayPrice: `${price}`, platform: "android" }) as Product;

const purchase = (productId: string, purchaseState: Purchase["purchaseState"]): Purchase =>
  ({ productId, purchaseState, platform: "android" }) as unknown as Purchase;

describe("sortTips", () => {
  it("orders tips cheapest first and drops unknown products", () => {
    const sorted = sortTips([
      product("tip_large", 10),
      product("premium", 1),
      product("tip_small", 2),
      product("tip_medium", 5),
    ]);
    expect(sorted.map((p) => p.id)).toEqual(["tip_small", "tip_medium", "tip_large"]);
  });

  it("treats a missing price as zero", () => {
    expect(sortTips([product("tip_medium", 5), product("tip_small", null)]).map((p) => p.id)).toEqual([
      "tip_small",
      "tip_medium",
    ]);
  });
});

describe("tipsToConsume", () => {
  it("keeps only completed tip purchases", () => {
    const result = tipsToConsume([
      purchase("tip_small", "purchased"),
      purchase("tip_medium", "pending"),
      purchase("premium", "purchased"),
      purchase("tip_large", "unknown"),
    ]);
    expect(result.map((p) => p.productId)).toEqual(["tip_small"]);
  });
});
