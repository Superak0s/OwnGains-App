import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "@shared/context/ThemeContext";
import {
  describeLocalOnlyFeatures,
  getLocalOnlyFeatures,
} from "@shared/services/localOnlyFeatures";
import { loadFromStorage, saveToStorage } from "@shared/services/storage";

const STORAGE_KEY = "@local_only_notice_views";
const MAX_VIEWS = 3;
const VISIBLE_MS = 15_000;

type Views = Record<string, number>;

const loadViews = async (): Promise<Views> =>
  (await loadFromStorage<Views>(STORAGE_KEY)) ?? {};

const setViews = async (feature: string, count: number): Promise<void> => {
  const views = await loadViews();
  await saveToStorage(STORAGE_KEY, { ...views, [feature]: count });
};

export default function LocalOnlyNotice({
  feature,
  detail,
  style,
}: {
  readonly feature: string;
  readonly detail: string;
  readonly style?: StyleProp<ViewStyle>;
}): React.JSX.Element | null {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      void (async () => {
        if (!(await getLocalOnlyFeatures()).includes(feature)) return;
        const seen = (await loadViews())[feature] ?? 0;
        if (!active || seen >= MAX_VIEWS) return;
        await setViews(feature, seen + 1);
        setVisible(true);
        timer = setTimeout(() => setVisible(false), VISIBLE_MS);
      })();
      return () => {
        active = false;
        clearTimeout(timer);
        setVisible(false);
      };
    }, [feature]),
  );

  const dismiss = () => {
    setVisible(false);
    void setViews(feature, MAX_VIEWS);
  };

  if (!visible) return null;

  return (
    <View
      style={[styles.banner, { backgroundColor: colors.warningLight }, style]}
    >
      <Text style={[styles.text, { color: colors.textSecondary }]}>
        📵 This server does not store {describeLocalOnlyFeatures([feature])}.{" "}
        {detail}
      </Text>
      <TouchableOpacity
        onPress={dismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss notice"
        hitSlop={8}
      >
        <Text style={[styles.close, { color: colors.textSecondary }]}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  text: { flex: 1, fontSize: 13, lineHeight: 19 },
  close: { fontSize: 16, fontWeight: "700" },
});
