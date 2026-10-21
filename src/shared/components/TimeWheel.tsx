import React, { useEffect, useMemo, useRef } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";

const ITEM = 40;
const VISIBLE = 5;
const MINUTE_STEP = 5;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => i * MINUTE_STEP);

type Props = {
  readonly value: Date;
  readonly onChange: (next: Date) => void;
  readonly disabled?: boolean;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Index of the row a column settled on, clamped to the column's rows. */
export const settledIndex = (offsetY: number, count: number): number =>
  Math.max(0, Math.min(count - 1, Math.round(offsetY / ITEM)));

/** 24-hour time picker made of two snapping scroll columns, minutes in 5-minute steps. */
export default function TimeWheel({
  value,
  onChange,
  disabled = false,
}: Props): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const h = value.getHours();
  const m = value.getMinutes();
  const minuteIndex = Math.min(MINUTES.length - 1, Math.round(m / MINUTE_STEP));

  const set = (hours: number, minutes: number) => {
    if (hours === h && minutes === m) return;
    const next = new Date(value);
    next.setHours(hours, minutes, 0, 0);
    onChange(next);
  };

  return (
    <View style={styles.wheel}>
      <View style={styles.band} pointerEvents='none' />
      <WheelColumn
        label='hours'
        items={HOURS}
        selected={h}
        pick={(hour) => set(hour, m)}
        disabled={disabled}
        styles={styles}
      />
      <Text style={styles.colon}>:</Text>
      <WheelColumn
        label='minutes'
        items={MINUTES}
        selected={minuteIndex}
        pick={(minute) => set(h, minute)}
        disabled={disabled}
        styles={styles}
      />
    </View>
  );
}

function WheelColumn({
  label,
  items,
  selected,
  pick,
  disabled,
  styles,
}: {
  readonly label: string;
  readonly items: number[];
  readonly selected: number;
  readonly pick: (item: number) => void;
  readonly disabled: boolean;
  readonly styles: ReturnType<typeof makeStyles>;
}): React.JSX.Element {
  const ref = useRef<ScrollView>(null);
  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    pick(items[settledIndex(e.nativeEvent.contentOffset.y, items.length)]);
  const step = (delta: number) =>
    pick(items[settledIndex((selected + delta) * ITEM, items.length)]);

  useEffect(() => {
    ref.current?.scrollTo({ y: selected * ITEM, animated: true });
  }, [selected]);

  return (
    <View
      accessible
      accessibilityRole='adjustable'
      accessibilityLabel={label}
      accessibilityValue={{ text: pad(items[selected]) }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => step(e.nativeEvent.actionName === "increment" ? 1 : -1)}
    >
      <ScrollView
        ref={ref}
        testID={`time-wheel-${label}`}
        style={styles.column}
        contentContainerStyle={styles.columnContent}
        contentOffset={{ x: 0, y: selected * ITEM }}
        snapToInterval={ITEM}
        decelerationRate='fast'
        nestedScrollEnabled
        scrollEnabled={!disabled}
        showsVerticalScrollIndicator={false}
        onMomentumScrollEnd={settle}
        onScrollEndDrag={(e) => {
          if (e.nativeEvent.velocity?.y === 0) settle(e);
        }}
      >
        {items.map((item, i) => (
          <TouchableOpacity
            key={item}
            style={styles.item}
            disabled={disabled}
            onPress={() => step(i - selected)}
            importantForAccessibility='no'
          >
            <Text style={[styles.itemText, i === selected && styles.itemTextSelected]}>
              {pad(item)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    wheel: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      height: ITEM * VISIBLE,
    },
    band: {
      position: "absolute",
      left: 0,
      right: 0,
      top: ITEM * Math.floor(VISIBLE / 2),
      height: ITEM,
      borderRadius: 12,
      backgroundColor: colors.accentLight,
    },
    column: { width: 84, height: ITEM * VISIBLE },
    columnContent: { paddingVertical: ITEM * Math.floor(VISIBLE / 2) },
    item: { height: ITEM, alignItems: "center", justifyContent: "center" },
    itemText: {
      fontSize: 26,
      fontWeight: "600",
      color: colors.textMuted,
      fontVariant: ["tabular-nums"],
    },
    itemTextSelected: { color: colors.accent, fontWeight: "700" },
    colon: { fontSize: 26, fontWeight: "700", color: colors.accent },
  });
