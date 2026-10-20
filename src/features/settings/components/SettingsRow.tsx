import React, { useMemo } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
  type AccessibilityRole,
  type AccessibilityState,
} from "react-native";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";

interface SettingsRowProps {
  readonly label: string;
  readonly description?: React.ReactNode;
  readonly icon?: string;
  readonly value?: string;
  readonly busy?: boolean;
  readonly disabled?: boolean;
  readonly destructive?: boolean;
  readonly toggle?: {
    readonly value: boolean;
    readonly onChange: (on: boolean) => void;
    readonly label: string;
  };
  readonly right?: React.ReactNode;
  readonly onPress?: () => void;
  readonly accessibilityLabel?: string;
  readonly accessibilityRole?: AccessibilityRole;
  readonly accessibilityState?: AccessibilityState;
  readonly anchorRef?: React.Ref<View>;
}

export function SettingsRow({
  label,
  description,
  icon,
  value,
  busy,
  disabled,
  destructive,
  toggle,
  right,
  onPress,
  accessibilityLabel,
  accessibilityRole = "button",
  accessibilityState,
  anchorRef,
}: SettingsRowProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  let accessory: React.ReactNode = right;
  if (busy) accessory = <ActivityIndicator color={colors.accent} />;
  else if (toggle)
    accessory = (
      <Switch
        value={toggle.value}
        onValueChange={toggle.onChange}
        disabled={disabled}
        trackColor={{ false: colors.surfaceBorder, true: colors.accent }}
        thumbColor={toggle.value ? colors.textOnAccent : colors.textMuted}
        accessibilityLabel={toggle.label}
      />
    );
  else if (value !== undefined)
    accessory = <Text style={styles.value}>{value}</Text>;
  else if (onPress && !right)
    accessory = (
      <Text style={styles.chevron} importantForAccessibility="no">
        ›
      </Text>
    );

  const content = (
    <>
      {icon && (
        <View style={[styles.iconBox, destructive && styles.iconBoxDanger]}>
          <Text style={styles.icon} importantForAccessibility="no">
            {icon}
          </Text>
        </View>
      )}
      <View style={styles.text}>
        <Text style={[styles.label, destructive && styles.danger]}>
          {label}
        </Text>
        {description ? (
          <Text style={styles.description}>{description}</Text>
        ) : null}
      </View>
      {accessory}
    </>
  );

  if (!onPress)
    return (
      <View ref={anchorRef} style={[styles.row, disabled && styles.disabled]}>
        {content}
      </View>
    );
  return (
    <TouchableOpacity
      ref={anchorRef}
      activeOpacity={0.6}
      style={[styles.row, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy, ...accessibilityState }}
    >
      {content}
    </TouchableOpacity>
  );
}

interface SettingsGroupProps {
  readonly title?: string;
  readonly footer?: string;
  readonly danger?: boolean;
  readonly children: React.ReactNode;
}

export function SettingsGroup({
  title,
  footer,
  danger,
  children,
}: SettingsGroupProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.group}>
      {title && (
        <Text
          style={[styles.groupTitle, danger && styles.danger]}
          accessibilityRole="header"
        >
          {title}
        </Text>
      )}
      <View style={[styles.card, danger && styles.cardDanger]}>
        {rows.map((row, index) => (
          <React.Fragment key={index}>
            {index > 0 && <View style={styles.divider} />}
            {row}
          </React.Fragment>
        ))}
      </View>
      {footer && <Text style={styles.footer}>{footer}</Text>}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    group: { marginBottom: 24 },
    groupTitle: {
      fontSize: 13,
      fontWeight: "700",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: colors.textSecondary,
      marginBottom: 8,
      marginLeft: 4,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    cardDanger: { borderColor: colors.error },
    divider: { height: 1, backgroundColor: colors.surfaceBorder },
    footer: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.textSecondary,
      marginTop: 8,
      marginHorizontal: 4,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 56,
      paddingVertical: 12,
      gap: 12,
    },
    disabled: { opacity: 0.5 },
    iconBox: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accentLight,
    },
    iconBoxDanger: { backgroundColor: colors.errorLight },
    icon: { fontSize: 18 },
    text: { flex: 1 },
    label: { fontSize: 16, fontWeight: "600", color: colors.textPrimary },
    description: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.textSecondary,
      marginTop: 2,
    },
    value: { fontSize: 15, fontWeight: "600", color: colors.accent },
    chevron: { fontSize: 24, color: colors.textMuted, marginTop: -2 },
    danger: { color: colors.error },
  });
