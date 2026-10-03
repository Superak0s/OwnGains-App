import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  ErrorCode,
  finishTransaction,
  getAvailablePurchases,
  useIAP,
  type Purchase,
} from "expo-iap";
import ModalSheet from "@shared/components/ModalSheet";
import { showToast } from "@shared/components/toast";
import { captureException } from "@shared/services/crashReporting";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";
import { TIP_PRODUCT_IDS, sortTips, tipsToConsume } from "../utils/tipJar";

const CONNECT_TIMEOUT_MS = 8000;

interface Props {
  readonly visible: boolean;
  readonly onClose: () => void;
}

const consume = async (purchase: Purchase): Promise<void> => {
  try {
    await finishTransaction({ purchase, isConsumable: true });
  } catch (error) {
    captureException(error, { area: "tip_jar_consume" });
  }
};

function TipOptions({ styles }: { readonly styles: Styles }) {
  const [buying, setBuying] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  const { connected, products, fetchProducts, requestPurchase } = useIAP({
    onPurchaseSuccess: (purchase) => {
      setBuying(null);
      if (purchase.purchaseState === "pending") {
        showToast("Thanks! Your tip will go through once the payment clears.");
        return;
      }
      void consume(purchase);
      showToast("Thank you for supporting OwnGains!");
    },
    onPurchaseError: (error) => {
      setBuying(null);
      if (error.code === ErrorCode.UserCancelled) return;
      showToast("The tip didn't go through. You haven't been charged.");
    },
  });

  useEffect(() => {
    if (!connected) return;
    void fetchProducts({ skus: [...TIP_PRODUCT_IDS], type: "in-app" });
    getAvailablePurchases()
      .then((purchases) => Promise.all(tipsToConsume(purchases).map(consume)))
      .catch((error: unknown) =>
        captureException(error, { area: "tip_jar_restore" }),
      );
  }, [connected, fetchProducts]);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), CONNECT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  const tips = sortTips(products);

  if (tips.length === 0) {
    return timedOut ? (
      <Text style={styles.note}>
        Tips aren't available right now. They need the Google Play version of
        OwnGains and a connection to Google Play.
      </Text>
    ) : (
      <ActivityIndicator style={styles.loading} />
    );
  }

  return (
    <View style={styles.options}>
      {tips.map((tip) => (
        <TouchableOpacity
          key={tip.id}
          style={[styles.option, buying !== null && styles.optionDisabled]}
          disabled={buying !== null}
          onPress={() => {
            setBuying(tip.id);
            requestPurchase({
              request: { google: { skus: [tip.id] }, apple: { sku: tip.id } },
              type: "in-app",
            }).catch(() => setBuying(null));
          }}
          accessibilityRole="button"
          accessibilityLabel={`Tip ${tip.displayPrice}`}
          accessibilityState={{ disabled: buying !== null, busy: buying === tip.id }}
        >
          <Text style={styles.optionTitle}>
            {tip.displayName ?? tip.title.replace(/\s*\(.*\)$/, "")}
          </Text>
          {buying === tip.id ? (
            <ActivityIndicator />
          ) : (
            <Text style={styles.optionPrice}>{tip.displayPrice}</Text>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function TipJarSheet({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Support Development"
      showCancelButton={false}
      confirmText="Done"
      onConfirm={onClose}
    >
      <Text style={styles.intro}>
        OwnGains is free and has no ads or paywalls. If it helps your
        training, a one-time tip helps keep it and its official server running.
      </Text>
      {visible && <TipOptions styles={styles} />}
      <Text style={styles.note}>
        Tips are voluntary and unlock nothing. They aren't a charitable
        donation and aren't tax-deductible.
      </Text>
    </ModalSheet>
  );
}

type Styles = ReturnType<typeof makeStyles>;

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    intro: { fontSize: 15, lineHeight: 21, color: colors.textPrimary, marginBottom: 16 },
    loading: { marginVertical: 24 },
    options: { gap: 10, marginBottom: 16 },
    option: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      backgroundColor: colors.surfaceElevated,
    },
    optionDisabled: { opacity: 0.6 },
    optionTitle: { fontSize: 16, fontWeight: "600", color: colors.textPrimary },
    optionPrice: { fontSize: 16, fontWeight: "700", color: colors.accent },
    note: { fontSize: 13, lineHeight: 18, color: colors.textSecondary, marginVertical: 8 },
  });
