import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { ThemeColors } from "@shared/context/ThemeContext";
import { formatDate } from "@utils/format";
import { trackFeature } from "@shared/services/crashReporting";
import { estimateOneRepMax } from "@utils/oneRepMax";
import {
  KG_TO_LBS,
  LBS_TO_KG,
  displayToKg,
  kgToDisplay,
  parseDecimal,
  parseReps,
  pickBestPerformanceSummary,
  repsInReserveLabel,
  validateWeightInput,
  type ProgressionSuggestion,
} from "../utils";
import type { makeStyles } from "../WorkoutScreen";

const RIR_SCALE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

const PROGRESSION_ICON: Record<ProgressionSuggestion["direction"], string> = {
  up: "📈",
  down: "📉",
  same: "↩️",
};

export interface SetDraft {
  weight: string;
  reps: string;
  note: string;
  isWarmup: boolean;
  rir: number | null;
}

export const EMPTY_SET_DRAFT: SetDraft = {
  weight: "",
  reps: "",
  note: "",
  isWarmup: false,
  rir: null,
};

type WeightUnit = "kg" | "lbs";

interface SetDetailsFormProps {
  styles: ReturnType<typeof makeStyles>;
  colors: ThemeColors;
  initial: SetDraft;
  weightUnit: WeightUnit;
  loadingHistory: boolean;
  performanceHistory: ReturnType<typeof pickBestPerformanceSummary>;
  progression: ProgressionSuggestion | null;
  onDismissProgression: () => void;
  isAssisted: boolean;
  isSaving: boolean;
  onSave: (draft: SetDraft) => void;
  onSwitchUnit: (unit: WeightUnit) => void;
  /** Kept current so the parent can tell whether the user has started typing. */
  draftStartedRef: React.MutableRefObject<boolean>;
}

/** Holds the set inputs in this component so a keystroke re-renders this form, not the workout screen. */
export const SetDetailsForm = React.memo(function SetDetailsForm({
  styles,
  colors,
  initial,
  weightUnit,
  loadingHistory,
  performanceHistory,
  progression,
  onDismissProgression,
  isAssisted,
  isSaving: isSavingSet,
  onSave,
  onSwitchUnit,
  draftStartedRef,
}: SetDetailsFormProps): React.JSX.Element {
  const [weight, setWeight] = useState(initial.weight);
  const [reps, setReps] = useState(initial.reps);
  const [setNote, setSetNote] = useState(initial.note);
  const [isWarmupSet, setIsWarmupSet] = useState(initial.isWarmup);
  const [rir, setRir] = useState(initial.rir);

  useEffect(() => {
    draftStartedRef.current = weight.trim() !== "" || reps.trim() !== "";
  }, [weight, reps, draftStartedRef]);

  const parsedReps = parseReps(reps);
  const hasValidReps = parsedReps !== null;
  const weightError = validateWeightInput(weight, weightUnit);
  const liveOneRepMax = estimateOneRepMax(
    displayToKg(weight, weightUnit),
    parsedReps ?? 0,
  );

  const switchWeightUnit = (unit: WeightUnit) => {
    if (weightUnit === unit) return;
    const current = parseDecimal(weight);
    if (current !== null && current > 0) {
      setWeight((current * (unit === "kg" ? LBS_TO_KG : KG_TO_LBS)).toFixed(1));
    }
    onSwitchUnit(unit);
  };

  const save = () =>
    onSave({ weight, reps, note: setNote, isWarmup: isWarmupSet, rir });

  return (
    <View style={styles.setFormBody}>
      <ScrollView
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps='handled'
        bounces={false}
      >
        {loadingHistory && (
          <View style={styles.historyLoading}>
            <Text style={styles.historyLoadingText}>Loading history...</Text>
          </View>
        )}
        {!loadingHistory && performanceHistory && (
          <View style={styles.performanceSection}>
            <Text style={styles.performanceSectionTitle}>
              📊 Performance History
            </Text>
            <View style={styles.performanceCard}>
              <View style={styles.performanceCardHeader}>
                <Text style={styles.performanceCardTitle}>🕐 Last Time</Text>
                <Text style={styles.performanceCardDate}>
                  {formatDate(performanceHistory.last.date)}
                </Text>
              </View>
              <View style={styles.performanceStats}>
                <View style={styles.performanceStat}>
                  {/* History is stored in kg, display in chosen unit */}
                  <Text style={styles.performanceStatValue}>
                    {kgToDisplay(performanceHistory.last.weight, weightUnit)}
                    {weightUnit}
                  </Text>
                  <Text style={styles.performanceStatLabel}>Weight</Text>
                </View>
                <View style={styles.performanceStat}>
                  <Text style={styles.performanceStatValue}>
                    {performanceHistory.last.reps}
                  </Text>
                  <Text style={styles.performanceStatLabel}>Reps</Text>
                </View>
                <View style={styles.performanceStat}>
                  <Text style={styles.performanceStatValue}>
                    {kgToDisplay(
                      performanceHistory.last.oneRepMax,
                      weightUnit,
                    )}
                    {weightUnit}
                  </Text>
                  <Text style={styles.performanceStatLabel}>Est. 1RM</Text>
                </View>
              </View>
            </View>
            <View
              style={[styles.performanceCard, styles.bestPerformanceCard]}
            >
              <View style={styles.performanceCardHeader}>
                <Text style={styles.performanceCardTitle}>
                  🏆 Best Performance
                </Text>
                <Text style={styles.performanceCardDate}>
                  {formatDate(performanceHistory.best.date)}
                </Text>
              </View>
              <View style={styles.performanceStats}>
                <View style={styles.performanceStat}>
                  <Text
                    style={[
                      styles.performanceStatValue,
                      styles.bestStatValue,
                    ]}
                  >
                    {kgToDisplay(performanceHistory.best.weight, weightUnit)}
                    {weightUnit}
                  </Text>
                  <Text style={styles.performanceStatLabel}>Weight</Text>
                </View>
                <View style={styles.performanceStat}>
                  <Text
                    style={[
                      styles.performanceStatValue,
                      styles.bestStatValue,
                    ]}
                  >
                    {performanceHistory.best.reps}
                  </Text>
                  <Text style={styles.performanceStatLabel}>Reps</Text>
                </View>
                <View style={styles.performanceStat}>
                  <Text
                    style={[
                      styles.performanceStatValue,
                      styles.bestStatValue,
                    ]}
                  >
                    {kgToDisplay(
                      performanceHistory.best.oneRepMax,
                      weightUnit,
                    )}
                    {weightUnit}
                  </Text>
                  <Text style={styles.performanceStatLabel}>Est. 1RM</Text>
                </View>
              </View>
            </View>
            <Text style={styles.performanceTotalAttempts}>
              Total attempts: {performanceHistory.totalAttempts}
            </Text>
          </View>
        )}
        {!loadingHistory && !performanceHistory && (
          <View style={styles.noHistoryContainer}>
            <Text style={styles.noHistoryText}>
              No previous data for this exercise
            </Text>
          </View>
        )}

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>
            Weight ({weightUnit}), leave 0 for bodyweight
          </Text>
          <TextInput
            style={styles.input}
            value={weight}
            onChangeText={setWeight}
            keyboardType='decimal-pad'
            placeholder='0'
            placeholderTextColor={colors.textMuted}
            accessibilityLabel={`Weight in ${weightUnit}, leave zero for bodyweight`}
          />
          {weightError && (
            <Text style={styles.inputError}>{weightError}</Text>
          )}
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Reps</Text>
          <TextInput
            style={styles.input}
            value={reps}
            onChangeText={setReps}
            keyboardType='number-pad'
            placeholder='0'
            placeholderTextColor={colors.textMuted}
            accessibilityLabel='Reps'
          />
          {!hasValidReps && (
            <Text style={styles.inputHint}>
              Enter at least 1 rep to save.
            </Text>
          )}
          {liveOneRepMax > 0 && (
            <Text style={styles.oneRepMaxHint}>
              Est. 1RM {kgToDisplay(liveOneRepMax, weightUnit)}
              {weightUnit}
            </Text>
          )}
        </View>

        {progression && !isWarmupSet && (
          <View style={styles.progressionPrompt}>
            <Text style={styles.progressionPromptText}>
              {PROGRESSION_ICON[progression.direction]} {progression.reason}.
              Try {kgToDisplay(progression.weightKg, weightUnit)}
              {weightUnit} × {progression.reps}?
            </Text>
            <View style={styles.progressionPromptActions}>
              <TouchableOpacity
                style={styles.progressionApplyButton}
                accessibilityRole='button'
                accessibilityLabel={`Use ${kgToDisplay(progression.weightKg, weightUnit)} ${weightUnit} for ${progression.reps} reps`}
                onPress={() => {
                  setWeight(kgToDisplay(progression.weightKg, weightUnit));
                  setReps(String(progression.reps));
                  trackFeature("progression", "apply", { direction: progression.direction });
                  onDismissProgression();
                }}
              >
                <Text style={styles.progressionApplyText}>Use it</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.progressionDismissButton}
                accessibilityRole='button'
                accessibilityLabel='Dismiss progression suggestion'
                onPress={() => {
                  trackFeature("progression", "dismiss", { direction: progression.direction });
                  onDismissProgression();
                }}
              >
                <Text style={styles.progressionDismissText}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.warmupToggle}>
          <Text style={styles.warmupToggleText}>
            {isWarmupSet ? "🔥 " : ""}Warm-up set
          </Text>
          <Switch
            value={isWarmupSet}
            onValueChange={setIsWarmupSet}
            trackColor={{
              false: colors.surfaceBorder,
              true: colors.warning,
            }}
            thumbColor={isWarmupSet ? colors.textOnAccent : colors.textMuted}
            accessibilityLabel='Warm-up set'
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Effort (optional)</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps='handled'
            contentContainerStyle={styles.chipRow}
          >
            {RIR_SCALE.map((value) => {
              const selected = rir === value;
              return (
                <TouchableOpacity
                  key={value}
                  style={[styles.chip, selected && styles.chipActive]}
                  accessibilityRole='radio'
                  accessibilityLabel={`${value} ${value === 1 ? "rep" : "reps"} in reserve`}
                  accessibilityState={{ selected }}
                  onPress={() => setRir(selected ? null : value)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selected && styles.chipTextActive,
                    ]}
                  >
                    {value}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <Text style={styles.inputHint}>
            {rir === null
              ? "Reps in reserve: how many more could you have done?"
              : repsInReserveLabel(rir)}
          </Text>
        </View>
        {isAssisted && (
          <View style={styles.assistedInfoBox}>
            <Text style={styles.assistedInfoText}>
              🤝 Assisted Exercise: Weight represents assistance from the
              machine. Lower = harder.
            </Text>
          </View>
        )}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Notes (optional)</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            value={setNote}
            onChangeText={setSetNote}
            placeholder='e.g., felt strong'
            placeholderTextColor={colors.textMuted}
            accessibilityLabel='Set notes, optional'
            multiline
            numberOfLines={3}
          />
        </View>

        <View style={styles.unitSelectorContainer}>
          <Text style={styles.unitSelectorLabel}>
            Weight unit (applies everywhere)
          </Text>
          <View style={styles.unitSelectorRow}>
            <TouchableOpacity
              style={[
                styles.unitButton,
                weightUnit === "kg" && styles.unitButtonActive,
              ]}
              accessibilityRole='radio'
              accessibilityLabel='Kilograms'
              accessibilityState={{ selected: weightUnit === "kg" }}
              onPress={() => switchWeightUnit("kg")}
            >
              <Text
                style={[
                  styles.unitButtonText,
                  weightUnit === "kg" && styles.unitButtonTextActive,
                ]}
              >
                kg
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.unitButton,
                weightUnit === "lbs" && styles.unitButtonActive,
              ]}
              accessibilityRole='radio'
              accessibilityLabel='Pounds'
              accessibilityState={{ selected: weightUnit === "lbs" }}
              onPress={() => switchWeightUnit("lbs")}
            >
              <Text
                style={[
                  styles.unitButtonText,
                  weightUnit === "lbs" && styles.unitButtonTextActive,
                ]}
              >
                lbs
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
      <TouchableOpacity
        style={[
          styles.saveButton,
          (isSavingSet || !hasValidReps || !!weightError) &&
            styles.saveButtonDisabled,
        ]}
        accessibilityRole='button'
        accessibilityLabel='Save set'
        accessibilityState={{
          disabled: isSavingSet || !hasValidReps || !!weightError,
        }}
        disabled={isSavingSet || !hasValidReps || !!weightError}
        onPress={save}
      >
        {isSavingSet ? (
          <ActivityIndicator color={colors.textOnAccent} />
        ) : (
          <Text style={styles.saveButtonText}>Save Set</Text>
        )}
      </TouchableOpacity>
    </View>
  );
});
