import React, { useMemo, useState } from "react";
import { View, Text, TextInput, ScrollView } from "react-native";
import { useTheme } from "@shared/context/ThemeContext";
import { sorenessApi } from "../services";
import { MuscleGroup, MUSCLE_GROUP_LABELS } from "../types/muscleRecovery";
import ModalSheet from "@shared/components/ModalSheet";
import { IntensityPicker } from "@shared/components/IntensityPicker";
import { getSeverityColor } from "@utils/severityColor";
import { buildLocalISOForDate } from "../utils";
import makeStyles from "../styles";
import { Bar, Metric, Note, radius, space } from "../ui";
import { captureException, metric } from "@shared/services/crashReporting";
import { NOTE_MAX_LENGTH } from "@shared/limits";

interface MuscleSorenessModalProps {
  readonly visible: boolean;
  readonly muscleGroup: MuscleGroup;
  readonly onClose: () => void;
  readonly onSuccess: () => void;
  readonly prefillDate?: Date;
}

function intensityLabel(value: number): string {
  if (value === 0) return "No soreness";
  if (value <= 3) return "Mild";
  if (value <= 6) return "Moderate";
  if (value <= 8) return "Severe";
  return "Extreme";
}

export const MuscleSorenessModal: React.FC<MuscleSorenessModalProps> = ({
  visible,
  muscleGroup,
  onClose,
  onSuccess,
  prefillDate,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [intensity, setIntensity] = useState(5);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const muscleLabel = MUSCLE_GROUP_LABELS[muscleGroup] || muscleGroup;
  const tone = getSeverityColor(intensity);

  const handleSubmit = async () => {
    if (intensity === 0) {
      onClose();
      return;
    }

    try {
      setSubmitting(true);
      await sorenessApi.logSoreness({
        muscleGroup,
        intensity,
        note: notes.trim() || undefined,
        loggedAt: prefillDate ? buildLocalISOForDate(prefillDate) : undefined,
      });
      onSuccess();
      setIntensity(5);
      setNotes("");
      onClose();
    } catch (error) {
      console.error("Failed to log soreness:", error);
      metric.count("tracking.soreness_log_failed");
      captureException(error, { stage: "logSoreness" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalSheet
      visible={visible}
      title={`How sore is your ${muscleLabel.toLowerCase()}?`}
      onClose={onClose}
      confirmText="Save"
      confirmDisabled={submitting}
      onConfirm={handleSubmit}
      cancelText="Cancel"
    >
      <ScrollView style={{ maxHeight: 500 }}>
        <View style={{ gap: space.md }}>
          <Metric
            label="Soreness"
            value={String(intensity)}
            unit="/ 10"
            meta={intensityLabel(intensity)}
            tone={tone}
          />
          <Bar pct={intensity * 10} tone={tone} />

          <IntensityPicker
            value={intensity}
            onChange={setIntensity}
            getColor={getSeverityColor}
            unselectedBackground={colors.inputBackground}
            unselectedBorder={colors.inputBorder}
            unselectedTextColor={colors.textSecondary}
            styles={{
              container: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
              button: {
                width: 42,
                height: 42,
                borderRadius: radius.md,
                borderWidth: 1,
                justifyContent: "center",
                alignItems: "center",
              },
              buttonText: { fontSize: 15, fontWeight: "600" },
            }}
          />
        </View>

        <Text style={styles.inputLabel}>
          Notes <Text style={styles.inputLabelOptional}>(optional)</Text>
        </Text>
        <TextInput
          style={[styles.input, { minHeight: 80 }]}
          placeholder="What were you doing when this got sore?"
          placeholderTextColor={colors.textMuted}
          value={notes}
          maxLength={NOTE_MAX_LENGTH}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        <Note>
          Log soreness soon after training. Recovery estimates get less
          accurate the longer you wait.
        </Note>
      </ScrollView>
    </ModalSheet>
  );
};

export default MuscleSorenessModal;
