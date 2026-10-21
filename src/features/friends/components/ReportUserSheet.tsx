import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import ModalSheet from "@shared/components/ModalSheet";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";
import { userFacingError } from "@shared/services/apiError";
import { friendsApi, REPORT_REASONS } from "../services";
import type { ReportReason, UserRef } from "../types";

interface ReportUserSheetProps {
  readonly target: UserRef | null;
  readonly onClose: () => void;
  readonly onResult: (title: string, message: string, ok: boolean) => void;
}

export default function ReportUserSheet({
  target,
  onClose,
  onResult,
}: ReportUserSheetProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setReason(null);
    setDetails("");
  }, [target]);

  const submit = async () => {
    if (!target || !reason) return;
    setSubmitting(true);
    try {
      await friendsApi.reportUser(target.id, reason, details.trim() || undefined);
      onClose();
      onResult(
        "Report Sent",
        "Whoever runs this server can now review it. You can also block this user to cut off contact straight away.",
        true,
      );
    } catch (e) {
      onResult("Error", userFacingError(e, "Failed to submit report"), false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalSheet
      visible={target !== null}
      onClose={onClose}
      title={target ? `Report ${target.username}` : "Report"}
      subtitle='Reports go to the operator of the server you are signed in to.'
      confirmText={submitting ? "Sending…" : "Submit Report"}
      confirmDisabled={!reason || submitting}
      onConfirm={submit}
      scrollable={true}
    >
      <View style={styles.content}>
        {REPORT_REASONS.map((r) => (
          <TouchableOpacity
            key={r.key}
            style={[styles.reasonRow, reason === r.key && styles.reasonRowActive]}
            onPress={() => setReason(r.key)}
            activeOpacity={0.7}
            accessibilityRole='radio'
            accessibilityState={{ selected: reason === r.key }}
            accessibilityLabel={r.label}
          >
            <Text style={styles.reasonText}>{r.label}</Text>
            {reason === r.key && <Text style={styles.reasonCheck}>✓</Text>}
          </TouchableOpacity>
        ))}
        <TextInput
          style={styles.detailsInput}
          value={details}
          onChangeText={setDetails}
          placeholder='Anything else the operator should know (optional)'
          placeholderTextColor={colors.textMuted}
          multiline={true}
          maxLength={1000}
          accessibilityLabel='Additional report details'
        />
      </View>
    </ModalSheet>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    content: { paddingHorizontal: 20, paddingBottom: 12, gap: 8 },
    reasonRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      backgroundColor: colors.surface,
    },
    reasonRowActive: {
      borderColor: colors.accent,
      backgroundColor: colors.accentLight,
    },
    reasonText: { fontSize: 15, color: colors.textPrimary, flex: 1 },
    reasonCheck: { fontSize: 16, color: colors.accent, fontWeight: "700" },
    detailsInput: {
      marginTop: 8,
      minHeight: 90,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      backgroundColor: colors.inputBackground,
      padding: 14,
      fontSize: 15,
      color: colors.textPrimary,
      textAlignVertical: "top",
    },
  });
