import type { Product, Purchase } from "expo-iap";

export const TIP_PRODUCT_IDS = ["tip_small", "tip_medium", "tip_large"] as const;

const isTipProduct = (id: string): boolean =>
  (TIP_PRODUCT_IDS as readonly string[]).includes(id);

export const sortTips = (products: readonly Product[]): Product[] =>
  products
    .filter((p) => isTipProduct(p.id))
    .sort((a, b) => (a.price ?? 0) - (b.price ?? 0));

// Play refuses to consume a pending purchase (e.g. cash at a store) until it is
// paid, so those are left for a later session to pick up.
export const tipsToConsume = (purchases: readonly Purchase[]): Purchase[] =>
  purchases.filter(
    (p) => isTipProduct(p.productId) && p.purchaseState === "purchased",
  );
