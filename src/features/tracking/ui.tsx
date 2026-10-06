import React, { useMemo, useState } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";

export const radius = { sm: 8, md: 10, lg: 14, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

/** Hex alpha suffixes. Theme colors are 6-digit hex, so a tone can be tinted
 *  without adding a light variant for every semantic color. */
const TINT = "1f";
const TINT_STRONG = "33";

const makeUi = (colors: ThemeColors) =>
  StyleSheet.create({
    metric: { gap: 2 },
    metricLabel: { fontSize: 13, fontWeight: "500", color: colors.textSecondary },
    metricRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
    metricValue: {
      fontSize: 34,
      fontWeight: "700",
      letterSpacing: -0.8,
      color: colors.textPrimary,
    },
    metricUnit: { fontSize: 15, fontWeight: "600", color: colors.textMuted },
    metricMeta: { fontSize: 12, color: colors.textMuted },
    metricSide: { flexDirection: "row", alignItems: "center", gap: space.sm },

    delta: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      alignSelf: "flex-start",
      paddingHorizontal: space.sm,
      paddingVertical: 3,
      borderRadius: radius.pill,
      marginTop: 2,
    },
    deltaText: { fontSize: 12, fontWeight: "700" },

    btn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderRadius: radius.md,
      alignSelf: "flex-start",
    },
    btnMd: { minHeight: 44, paddingHorizontal: 18 },
    btnSm: { minHeight: 32, paddingHorizontal: 12 },
    btnFull: { alignSelf: "stretch" },
    btnText: { fontSize: 14, fontWeight: "700" },
    btnTextSm: { fontSize: 13 },
    btnDisabled: { opacity: 0.45 },

    chip: {
      minHeight: 32,
      paddingHorizontal: 14,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.inputBackground,
      borderWidth: 1,
      borderColor: colors.inputBorder,
    },
    chipText: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
    chipSub: { fontSize: 10, fontWeight: "500", marginTop: 1 },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },

    iconBtn: {
      width: 32,
      height: 32,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.background,
    },
    iconBtnGlyph: { fontSize: 14 },

    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.md,
      paddingVertical: 11,
    },
    rowRule: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
    rowDot: { width: 6, height: 6, borderRadius: 3 },
    rowMain: { flex: 1, gap: 1 },
    rowTitle: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
    rowMeta: { fontSize: 12, color: colors.textMuted },
    rowValue: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
    rowSide: { flexDirection: "row", alignItems: "center", gap: space.sm },

    placeholder: { alignItems: "center", gap: space.sm, paddingVertical: space.xl },
    placeholderIcon: { fontSize: 26, opacity: 0.5 },
    placeholderText: {
      fontSize: 13,
      color: colors.textMuted,
      textAlign: "center",
      maxWidth: 260,
    },

    note: { fontSize: 13, color: colors.textMuted, paddingVertical: space.sm },

    sectionLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textSecondary,
      marginBottom: space.sm,
    },

    bar: {
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.separator,
      overflow: "hidden",
    },
    barFill: { height: "100%", borderRadius: 3 },
  });

type Ui = ReturnType<typeof makeUi>;

export function useUi(): { ui: Ui; colors: ThemeColors } {
  const { colors } = useTheme();
  return { ui: useMemo(() => makeUi(colors), [colors]), colors };
}

type ButtonVariant = "primary" | "quiet" | "danger";

interface ButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: ButtonVariant;
  /** Per-tracker color. Defaults to the theme accent. */
  readonly tone?: string;
  readonly size?: "md" | "sm";
  readonly full?: boolean;
  readonly disabled?: boolean;
  readonly accessibilityLabel?: string;
  readonly style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  tone,
  size = "md",
  full,
  disabled,
  accessibilityLabel,
  style,
}: ButtonProps): React.ReactElement {
  const { ui, colors } = useUi();
  const base = tone ?? colors.accent;

  let skin = { backgroundColor: `${base}${TINT}`, color: base };
  if (variant === "primary")
    skin = { backgroundColor: base, color: colors.textOnAccent };
  else if (variant === "danger")
    skin = { backgroundColor: `${colors.error}${TINT}`, color: colors.error };

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={size === "md" ? 2 : 8}
      style={[
        ui.btn,
        size === "md" ? ui.btnMd : ui.btnSm,
        full && ui.btnFull,
        { backgroundColor: skin.backgroundColor },
        disabled && ui.btnDisabled,
        style,
      ]}
    >
      <Text
        style={[ui.btnText, size === "sm" && ui.btnTextSm, { color: skin.color }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

interface IconButtonProps {
  readonly glyph: string;
  readonly label: string;
  readonly onPress: () => void;
  readonly tone?: "neutral" | "danger";
  readonly disabled?: boolean;
}

export function IconButton({
  glyph,
  label,
  onPress,
  tone = "neutral",
  disabled,
}: IconButtonProps): React.ReactElement {
  const { ui, colors } = useUi();
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      onPress={onPress}
      style={[
        ui.iconBtn,
        tone === "danger" && { backgroundColor: `${colors.error}${TINT}` },
        disabled && ui.btnDisabled,
      ]}
    >
      <Text style={ui.iconBtnGlyph}>{glyph}</Text>
    </TouchableOpacity>
  );
}

interface ChipProps {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly tone?: string;
  readonly sub?: string;
  readonly disabled?: boolean;
  readonly onLongPress?: () => void;
}

export function Chip({
  label,
  selected,
  onPress,
  tone,
  sub,
  disabled,
  onLongPress,
}: ChipProps): React.ReactElement {
  const { ui, colors } = useUi();
  const base = tone ?? colors.accent;
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={sub ? `${label}, ${sub}` : label}
      accessibilityState={{ selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      hitSlop={sub ? 2 : 8}
      style={[
        ui.chip,
        sub ? { minHeight: 44, paddingHorizontal: 12 } : null,
        selected && { backgroundColor: base, borderColor: base },
        disabled && ui.btnDisabled,
      ]}
    >
      <Text
        style={[ui.chipText, selected && { color: colors.textOnAccent }]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {sub ? (
        <Text
          style={[
            ui.chipSub,
            { color: selected ? colors.textOnAccent : colors.textMuted },
          ]}
          numberOfLines={1}
        >
          {sub}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

interface MetricProps {
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
  readonly meta?: string;
  readonly tone?: string;
  readonly delta?: { readonly text: string; readonly direction: "up" | "down" | "flat" };
  readonly side?: React.ReactNode;
}

const DELTA_GLYPH = { up: "↗", down: "↘", flat: "→" } as const;

export function Metric({
  label,
  value,
  unit,
  meta,
  tone,
  delta,
  side,
}: MetricProps): React.ReactElement {
  const { ui, colors } = useUi();
  let deltaColor = colors.textMuted;
  if (delta?.direction === "up") deltaColor = colors.error;
  else if (delta?.direction === "down") deltaColor = colors.success;

  return (
    <View style={ui.metric}>
      <View style={ui.metricSide}>
        <Text style={ui.metricLabel}>{label}</Text>
        {side ? <View style={{ marginLeft: "auto" }}>{side}</View> : null}
      </View>
      <View style={ui.metricRow}>
        <Text style={[ui.metricValue, tone ? { color: tone } : null]}>{value}</Text>
        {unit ? <Text style={ui.metricUnit}>{unit}</Text> : null}
      </View>
      {delta ? (
        <View style={[ui.delta, { backgroundColor: `${deltaColor}${TINT}` }]}>
          <Text style={[ui.deltaText, { color: deltaColor }]}>
            {DELTA_GLYPH[delta.direction]} {delta.text}
          </Text>
        </View>
      ) : null}
      {meta ? <Text style={ui.metricMeta}>{meta}</Text> : null}
    </View>
  );
}

interface RowProps {
  readonly title: string;
  readonly meta?: string;
  readonly value?: string;
  readonly dot?: string;
  readonly last?: boolean;
  readonly onPress?: () => void;
  readonly right?: React.ReactNode;
}

export function Row({
  title,
  meta,
  value,
  dot,
  last,
  onPress,
  right,
}: RowProps): React.ReactElement {
  const { ui } = useUi();
  const body = (
    <>
      {dot ? <View style={[ui.rowDot, { backgroundColor: dot }]} /> : null}
      <View style={ui.rowMain}>
        <Text style={ui.rowTitle}>{title}</Text>
        {meta ? <Text style={ui.rowMeta}>{meta}</Text> : null}
      </View>
      <View style={ui.rowSide}>
        {value ? <Text style={ui.rowValue}>{value}</Text> : null}
        {right}
      </View>
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={meta ? `${title}, ${meta}` : title}
        onPress={onPress}
        style={[ui.row, !last && ui.rowRule]}
      >
        {body}
      </TouchableOpacity>
    );
  }
  return <View style={[ui.row, !last && ui.rowRule]}>{body}</View>;
}

interface PlaceholderProps {
  readonly icon?: string;
  readonly text: string;
  readonly action?: {
    readonly label: string;
    readonly onPress: () => void;
    readonly tone?: string;
  };
}

export function Placeholder({ icon, text, action }: PlaceholderProps): React.ReactElement {
  const { ui } = useUi();
  return (
    <View style={ui.placeholder}>
      {icon ? <Text style={ui.placeholderIcon}>{icon}</Text> : null}
      <Text style={ui.placeholderText}>{text}</Text>
      {action ? (
        <Button
          label={action.label}
          onPress={action.onPress}
          tone={action.tone}
          variant="quiet"
          size="sm"
        />
      ) : null}
    </View>
  );
}

export function Note({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  const { ui } = useUi();
  return <Text style={ui.note}>{children}</Text>;
}

export function SectionLabel({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  const { ui } = useUi();
  return <Text style={ui.sectionLabel}>{children}</Text>;
}

export function Bar({
  pct,
  tone,
}: {
  readonly pct: number;
  readonly tone: string;
}): React.ReactElement {
  const { ui } = useUi();
  return (
    <View style={ui.bar}>
      <View
        style={[ui.barFill, { width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: tone }]}
      />
    </View>
  );
}

export const HISTORY_PAGE_SIZE = 20;

/** Renders the first `pageSize` items and reveals more on demand, so long histories remain cheap to mount. */
export function ShowMoreList<T>({
  items,
  pageSize = HISTORY_PAGE_SIZE,
  renderItem,
}: {
  readonly items: readonly T[];
  readonly pageSize?: number;
  readonly renderItem: (item: T, index: number, isLast: boolean) => React.ReactNode;
}): React.ReactElement {
  const [visible, setVisible] = useState(pageSize);
  const shown = items.slice(0, visible);
  return (
    <View>
      {shown.map((item, i) => renderItem(item, i, i === shown.length - 1))}
      {visible < items.length && (
        <View style={localStyles.showMore}>
          <Button
            label={`Show more (${items.length - visible})`}
            variant="quiet"
            size="sm"
            onPress={() => setVisible((v) => v + pageSize)}
          />
        </View>
      )}
    </View>
  );
}

const localStyles = StyleSheet.create({
  showMore: { alignItems: "center", marginTop: space.md },
});

export { TINT, TINT_STRONG };
