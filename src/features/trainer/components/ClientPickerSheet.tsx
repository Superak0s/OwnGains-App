import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import ModalSheet from "@shared/components/ModalSheet";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";

export interface PickerClient {
  readonly userId: string;
  readonly username: string;
  /** Why the client can't be picked yet. */
  readonly unavailable?: string;
}

interface ClientPickerSheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly clients: readonly PickerClient[];
  readonly selectedId: string | null;
  /** Called with null when the trainer picks their own entry. */
  readonly onChoose: (userId: string | null) => void;
  /** The trainer's own entry above the clients, left out when unset. */
  readonly ownLabel?: string;
  readonly emptyText: string;
}

/** A searchable client list in a sheet, shared by the trainer's tabs that switch between clients. */
export default function ClientPickerSheet({
  visible,
  onClose,
  title,
  clients,
  selectedId,
  onChoose,
  ownLabel,
  emptyText,
}: ClientPickerSheetProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (visible) setQuery("");
  }, [visible]);

  const needle = query.trim().toLowerCase();
  const matches = clients.filter((c) => c.username.toLowerCase().includes(needle));

  return (
    <ModalSheet visible={visible} onClose={onClose} title={title}>
      {ownLabel && <Option label={ownLabel} selected={selectedId === null} onPress={() => onChoose(null)} styles={styles} />}
      {clients.length > 5 && (
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search by username"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Search clients by username"
          autoCapitalize="none"
          autoCorrect={false}
        />
      )}
      {matches.map((c) => (
        <Option
          key={c.userId}
          label={c.username}
          detail={c.unavailable}
          selected={selectedId === c.userId}
          onPress={c.unavailable ? undefined : () => onChoose(c.userId)}
          styles={styles}
        />
      ))}
      {clients.length > 0 && matches.length === 0 && (
        <Text style={styles.detail}>{`No client named "${query.trim()}"`}</Text>
      )}
      {clients.length === 0 && <Text style={styles.detail}>{emptyText}</Text>}
    </ModalSheet>
  );
}

interface OptionProps {
  readonly label: string;
  readonly detail?: string;
  readonly selected: boolean;
  readonly onPress?: () => void;
  readonly styles: ReturnType<typeof makeStyles>;
}

function Option({ label, detail, selected, onPress, styles }: OptionProps): React.JSX.Element {
  return (
    <TouchableOpacity
      style={styles.option}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !onPress }}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.optionText, !onPress && styles.muted]}>{label}</Text>
        {detail && <Text style={styles.detail}>{detail}</Text>}
      </View>
      {selected && <Text style={styles.link}>✓</Text>}
    </TouchableOpacity>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    search: {
      backgroundColor: colors.surface,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      paddingHorizontal: 12,
      paddingVertical: 9,
      fontSize: 15,
      color: colors.textPrimary,
      marginBottom: 8,
    },
    link: { color: colors.accent, fontWeight: "600" },
    option: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 52,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.separator,
    },
    optionText: { color: colors.textPrimary, fontSize: 15 },
    muted: { color: colors.textSecondary },
    detail: { color: colors.textSecondary, fontSize: 13 },
  });
