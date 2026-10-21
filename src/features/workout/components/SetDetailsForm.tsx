import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
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
  type PerformanceEntry,
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
  onDelete?: () => void;
  /** Kept current so the parent can tell whether the user has started typing. */
  draftStartedRef: React.RefObject<boolean>;
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
  onDelete,
  draftStartedRef,
}: SetDetailsFormProps): React.JSX.Element {
  const [weight, setWeight] = useState(initial.weight);
  const [reps, setReps] = useState(initial.reps);
  const [setNote, setSetNote] = useState(initial.note);
  const [isWarmupSet, setIsWarmupSet] = useState(initial.isWarmup);
  const [rir, setRir] = useState(initial.rir);
  const repsRef = useRef<TextInput>(null);

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
  const canSave = !isSavingSet && hasValidReps && !weightError;

  return (
    <View style={styles.setFormBody}>
      <ScrollView
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps='handled'
        bounces={false}
      >
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>
            Weight ({weightUnit}), leave 0 for bodyweight
          </Text>
          <TextInput
            style={styles.input}
            value={weight}
            onChangeText={setWeight}
            keyboardType='decimal-pad'
            autoFocus
            returnKeyType='next'
            submitBehavior='submit'
            onSubmitEditing={() => repsRef.current?.focus()}
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
            ref={repsRef}
            style={styles.input}
            value={reps}
            onChangeText={setReps}
            keyboardType='number-pad'
            returnKeyType='done'
            onSubmitEditing={() => {
              if (canSave) save();
            }}
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

        {loadingHistory && (
          <View style={styles.historyLoading}>
            <Text style={styles.historyLoadingText}>Loading history...</Text>
          </View>
        )}
        {!loadingHistory && performanceHistory && (
          <View style={styles.performanceSection}>
            <Text style={styles.performanceSectionTitle}>
              Performance History
            </Text>
            <PerformanceCard
              title='Last Time'
              entry={performanceHistory.last}
              weightUnit={weightUnit}
              styles={styles}
              cardStyle={styles.performanceCard}
              valueStyle={styles.performanceStatValue}
            />
            <PerformanceCard
              title='Best Performance'
              entry={performanceHistory.best}
              weightUnit={weightUnit}
              styles={styles}
              cardStyle={[styles.performanceCard, styles.bestPerformanceCard]}
              valueStyle={[styles.performanceStatValue, styles.bestStatValue]}
            />
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

        <View style={styles.warmupToggle}>
          <Text style={styles.warmupToggleText}>
            Warm-up set
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
          <View style={styles.chipRow} accessibilityRole='radiogroup'>
            {RIR_SCALE.map((value) => {
              const selected = rir === value;
              return (
                <TouchableOpacity
                  key={value}
                  style={[styles.chip, selected && styles.chipActive]}
                  accessibilityRole='radio'
                  accessibilityLabel={`${value} ${value === 1 ? "rep" : "reps"} in reserve`}
                  accessibilityState={{ checked: selected }}
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
          </View>
          <Text style={styles.inputHint}>
            {rir === null
              ? "Reps in reserve: how many more could you have done?"
              : repsInReserveLabel(rir)}
          </Text>
        </View>
        {isAssisted && (
          <View style={styles.assistedInfoBox}>
            <Text style={styles.assistedInfoText}>
              Assisted exercise: Weight represents assistance from the
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
            Weight unit for this exercise
          </Text>
          <View style={styles.unitSelectorRow} accessibilityRole='radiogroup'>
            <TouchableOpacity
              style={[
                styles.unitButton,
                weightUnit === "kg" && styles.unitButtonActive,
              ]}
              accessibilityRole='radio'
              accessibilityLabel='Kilograms'
              accessibilityState={{ checked: weightUnit === "kg" }}
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
              accessibilityState={{ checked: weightUnit === "lbs" }}
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
        style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
        accessibilityRole='button'
        accessibilityLabel='Save set'
        accessibilityState={{ disabled: !canSave }}
        disabled={!canSave}
        onPress={save}
      >
        {isSavingSet ? (
          <ActivityIndicator color={colors.textOnAccent} />
        ) : (
          <Text style={styles.saveButtonText}>Save Set</Text>
        )}
      </TouchableOpacity>
      {onDelete && (
        <TouchableOpacity
          style={styles.destructiveTextButton}
          accessibilityRole='button'
          onPress={onDelete}
        >
          <Text style={styles.destructiveTextButtonText}>Delete set</Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

function PerformanceCard({
  title,
  entry,
  weightUnit,
  styles,
  cardStyle,
  valueStyle,
}: {
  readonly title: string;
  readonly entry: PerformanceEntry;
  readonly weightUnit: WeightUnit;
  readonly styles: ReturnType<typeof makeStyles>;
  readonly cardStyle: StyleProp<ViewStyle>;
  readonly valueStyle: StyleProp<TextStyle>;
}): React.JSX.Element {
  const stats: [string, string | number][] = [
    ["Weight", `${kgToDisplay(entry.weight, weightUnit)}${weightUnit}`],
    ["Reps", entry.reps],
    ["Est. 1RM", `${kgToDisplay(entry.oneRepMax, weightUnit)}${weightUnit}`],
  ];
  return (
    <View style={cardStyle}>
      <View style={styles.performanceCardHeader}>
        <Text style={styles.performanceCardTitle}>{title}</Text>
        <Text style={styles.performanceCardDate}>{formatDate(entry.date)}</Text>
      </View>
      <View style={styles.performanceStats}>
        {stats.map(([label, value]) => (
          <View key={label} style={styles.performanceStat}>
            <Text style={valueStyle}>{value}</Text>
            <Text style={styles.performanceStatLabel}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
