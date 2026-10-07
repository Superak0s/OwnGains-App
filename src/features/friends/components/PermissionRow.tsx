import React, { useMemo } from "react";
import { View, Text, StyleSheet, Switch, ActivityIndicator } from "react-native";
import { useTheme } from "@shared/context/ThemeContext";
import type { ThemeColors } from "@shared/context/ThemeContext";

interface PermissionRowProps {
  readonly icon: string;
  readonly title: string;
  readonly description: string;
  readonly granted: boolean;
  readonly loading?: boolean;
  readonly onGrant?: () => void;
  readonly onRevoke?: () => void;
  /** Read-only display (no Grant/Revoke actions) for permissions the friend granted you, not the reverse. */
  readonly readOnly?: boolean;
  readonly friendName?: string;
}

export function PermissionRow({
  icon,
  title,
  description,
  granted,
  loading = false,
  onGrant,
  onRevoke,
  readOnly = false,
  friendName,
}: PermissionRowProps): React.JSX.Element {
  const { colors } = useTheme();
  const permStyles = useMemo(() => makePermStyles(colors), [colors]);
  const target = friendName ? ` for ${friendName}` : "";

  let actionBtn: React.JSX.Element;
  if (readOnly) {
    actionBtn = (
      <View
        style={[
          permStyles.statusBadge,
          { backgroundColor: granted ? colors.successLight : colors.separator },
        ]}
      >
        <Text
          style={[
            permStyles.statusBadgeText,
            { color: granted ? colors.success : colors.textMuted },
          ]}
        >
          {granted ? "✓ Granted" : "Not yet"}
        </Text>
      </View>
    );
  } else {
    actionBtn = (
      <Switch
        value={granted}
        onValueChange={(on) => (on ? onGrant?.() : onRevoke?.())}
        trackColor={{ false: colors.surfaceBorder, true: colors.accent }}
        thumbColor={granted ? colors.textOnAccent : colors.textMuted}
        accessibilityLabel={`${title}${target}`}
        style={permStyles.toggle}
      />
    );
  }

  return (
    <View
      style={[
        permStyles.row,
        granted && permStyles.rowGranted,
        !granted && readOnly && { opacity: 0.5 },
      ]}
    >
      <Text style={permStyles.icon}>{icon}</Text>
      <View style={permStyles.text}>
        <Text style={permStyles.title}>{title}</Text>
        <Text style={permStyles.desc}>{description}</Text>
      </View>
      {loading ? (
        <ActivityIndicator
          size='small'
          color={colors.accent}
          style={{ marginLeft: 8 }}
        />
      ) : (
        actionBtn
      )}
    </View>
  );
}

export const makePermStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 1,
    },
    rowGranted: {
      borderColor: colors.success,
      backgroundColor: colors.successLight,
    },
    icon: { fontSize: 24, marginRight: 12 },
    text: { flex: 1 },
    title: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.textPrimary,
      marginBottom: 2,
    },
    desc: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
    toggle: { marginLeft: 8 },
    statusBadge: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 10,
      marginLeft: 8,
    },
    statusBadgeText: { fontSize: 13, fontWeight: "700" },
  });
