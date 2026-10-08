import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { finishTransaction, getAvailablePurchases } from "expo-iap";
import { showToast } from "@shared/components/toast";
import { captureException } from "@shared/services/crashReporting";
import TipJarSheet from "../TipJarSheet";

type Callbacks = {
  onPurchaseSuccess: (p: Record<string, unknown>) => void;
  onPurchaseError: (e: { code: string }) => void;
};

const mockIap = {
  connected: true,
  products: [] as Record<string, unknown>[],
  fetchProducts: jest.fn(async () => {}),
  requestPurchase: jest.fn(async () => {}),
  callbacks: null as Callbacks | null,
};

jest.mock("expo-iap", () => ({
  ErrorCode: { UserCancelled: "user-cancelled" },
  finishTransaction: jest.fn(async () => {}),
  getAvailablePurchases: jest.fn(async () => []),
  useIAP: (callbacks: Callbacks) => {
    mockIap.callbacks = callbacks;
    return mockIap;
  },
}));
jest.mock("@shared/components/toast", () => ({ showToast: jest.fn() }));
jest.mock("@shared/services/crashReporting", () => ({
  captureException: jest.fn(),
  metric: { count: jest.fn() },
}));
jest.mock("@shared/context/ThemeContext", () => ({ useTheme: () => ({ colors: {} }) }));
jest.mock("@shared/components/ModalSheet", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));

const small = { id: "tip_small", title: "Small tip (OwnGains)", displayPrice: "€1.99", price: 1.99 };
const large = { id: "tip_large", displayName: "Big tip", title: "x", displayPrice: "€9.99", price: 9.99 };

beforeEach(() => {
  jest.clearAllMocks();
  mockIap.connected = true;
  mockIap.products = [];
});

afterEach(() => jest.useRealTimers());

describe("TipJarSheet", () => {
  it("lists only tip products, cheapest first, without the store's app-name suffix", async () => {
    mockIap.products = [large, { id: "other", title: "Other", displayPrice: "€0.10", price: 0.1 }, small];
    await render(<TipJarSheet visible onClose={jest.fn()} />);

    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.props.accessibilityLabel)).toEqual(["Tip €1.99", "Tip €9.99"]);
    expect(screen.getByText("Small tip")).toBeTruthy();
    expect(screen.getByText("Big tip")).toBeTruthy();
  });

  it("consumes tips left unfinished by an earlier session, but not pending ones", async () => {
    const paid = { productId: "tip_small", purchaseState: "purchased" };
    (getAvailablePurchases as jest.Mock).mockResolvedValueOnce([
      paid,
      { productId: "tip_small", purchaseState: "pending" },
    ]);
    await render(<TipJarSheet visible onClose={jest.fn()} />);
    await act(async () => {});

    expect(mockIap.fetchProducts).toHaveBeenCalledWith({ skus: ["tip_small", "tip_medium", "tip_large"], type: "in-app" });
    expect(finishTransaction).toHaveBeenCalledTimes(1);
    expect(finishTransaction).toHaveBeenCalledWith({ purchase: paid, isConsumable: true });
  });

  it("explains tips are unavailable when Play never answers, instead of spinning forever", async () => {
    jest.useFakeTimers();
    mockIap.connected = false;
    await render(<TipJarSheet visible onClose={jest.fn()} />);
    expect(screen.queryByText(/Tips aren't available/)).toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(8000);
    });

    expect(screen.getByText(/Tips aren't available/)).toBeTruthy();
  });

  it("buys the tapped tip and blocks a second purchase until it finishes", async () => {
    mockIap.products = [small, large];
    await render(<TipJarSheet visible onClose={jest.fn()} />);

    await fireEvent.press(screen.getByRole("button", { name: "Tip €1.99" }));

    expect(mockIap.requestPurchase).toHaveBeenCalledWith({
      request: { google: { skus: ["tip_small"] }, apple: { sku: "tip_small" } },
      type: "in-app",
    });
    expect(screen.getByRole("button", { name: "Tip €9.99" })).toBeDisabled();
  });

  it("consumes a completed tip so it can be bought again, and thanks the user", async () => {
    await render(<TipJarSheet visible onClose={jest.fn()} />);
    const purchase = { productId: "tip_small", purchaseState: "purchased" };

    await act(async () => mockIap.callbacks!.onPurchaseSuccess(purchase));

    expect(finishTransaction).toHaveBeenCalledWith({ purchase, isConsumable: true });
    expect(showToast).toHaveBeenCalledWith("Thank you for supporting OwnGains!");
  });

  it("does not consume a pending tip, since Play refuses until it is paid", async () => {
    await render(<TipJarSheet visible onClose={jest.fn()} />);

    await act(async () => mockIap.callbacks!.onPurchaseSuccess({ productId: "tip_small", purchaseState: "pending" }));

    expect(finishTransaction).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining("once the payment clears"));
  });

  it("stays quiet when the user cancels, and reports any other purchase failure", async () => {
    await render(<TipJarSheet visible onClose={jest.fn()} />);

    await act(async () => mockIap.callbacks!.onPurchaseError({ code: "user-cancelled" }));
    expect(showToast).not.toHaveBeenCalled();

    await act(async () => mockIap.callbacks!.onPurchaseError({ code: "network-error" }));
    expect(showToast).toHaveBeenCalledWith("The tip didn't go through. You haven't been charged.");
    expect(captureException).toHaveBeenCalled();
  });

  it("does not connect to Play while the sheet is closed", async () => {
    await render(<TipJarSheet visible={false} onClose={jest.fn()} />);
    expect(mockIap.fetchProducts).not.toHaveBeenCalled();
  });
});
