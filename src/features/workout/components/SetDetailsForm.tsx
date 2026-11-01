import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Switch,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
  type TextInputInstance,
} from "react-native";
import { Text, TextInput } from "@shared/components/Text";
import type { ThemeColors } from "@shared/context/ThemeContext";
import { Button, Chip, useUi } from "@shared/components/ui";
import { formatDate, parseDecimal } from "@utils/format";
import { trackFeature } from "@shared/services/crashReporting";
import { estimateOneRepMax } from "@utils/oneRepMax";
import {
  displayToKg,
  kgToDisplay,
  parseDrops,
  parseReps,
  pickBestPerformanceSummary,
  repsInReserveLabel,
  stepWeight,
  validateWeightInput,
  type DropDraft,
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
  drops: DropDraft[];
  note: string;
  isWarmup: boolean;
  rir: number | null;
}

export const EMPTY_SET_DRAFT: SetDraft = {
  weight: "",
  reps: "",
  drops: [],
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
  /** The active machine's arrow step in kg. Undefined uses the unit default. */
  weightStepKg?: number;
  loadingHistory: boolean;
  /** Past sessions could not be fetched, so "no previous data" would be wrong. */
  historyFailed: boolean;
  onRetryHistory: () => void;
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
  /** Called when the inputs start or stop differing from `initial`. */
  onDirtyChange?: (dirty: boolean) => void;
}

/** Holds the set inputs in this component so a keystroke re-renders this form, not the workout screen. */
export const SetDetailsForm = React.memo(function SetDetailsForm({
  styles,
  colors,
  initial,
  weightUnit,
  weightStepKg,
  loadingHistory,
  historyFailed,
  onRetryHistory,
  performanceHistory,
  progression,
  onDismissProgression,
  isAssisted,
  isSaving: isSavingSet,
  onSave,
  onSwitchUnit,
  onDelete,
  draftStartedRef,
  onDirtyChange,
}: SetDetailsFormProps): React.JSX.Element {
  const { ui } = useUi();
  const [weight, setWeight] = useState(initial.weight);
  const [reps, setReps] = useState(initial.reps);
  const [drops, setDrops] = useState(initial.drops);
  const [setNote, setSetNote] = useState(initial.note);
  const [isWarmupSet, setIsWarmupSet] = useState(initial.isWarmup);
  const [rir, setRir] = useState(initial.rir);
  const repsRef = useRef<TextInputInstance>(null);

  useEffect(() => {
    draftStartedRef.current = weight.trim() !== "" || reps.trim() !== "";
  }, [weight, reps, draftStartedRef]);

  const dirty =
    weight !== initial.weight ||
    reps !== initial.reps ||
    drops !== initial.drops ||
    setNote !== initial.note ||
    isWarmupSet !== initial.isWarmup ||
    rir !== initial.rir;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const parsedReps = parseReps(reps);
  const hasValidReps = parsedReps !== null;
  const weightError = validateWeightInput(weight, weightUnit);
  // Assistance is not load, so an estimated 1RM from it means nothing.
  const liveOneRepMax = isAssisted
    ? 0
    : estimateOneRepMax(displayToKg(weight, weightUnit), parsedReps ?? 0);

  const switchWeightUnit = (unit: WeightUnit) => {
    if (weightUnit === unit) return;
    const current = parseDecimal(weight);
    if (current !== null && current > 0) {
      setWeight(kgToDisplay(displayToKg(weight, weightUnit), unit));
    }
    if (drops.length)
      setDrops(
        drops.map((d) =>
          parseDecimal(d.weight)
            ? { ...d, weight: kgToDisplay(displayToKg(d.weight, weightUnit), unit) }
            : d,
        ),
      );
    onSwitchUnit(unit);
  };

  const save = () =>
    onSave({ weight, reps, drops, note: setNote, isWarmup: isWarmupSet, rir });
  const hasWeight = weight.trim() !== "";
  const dropsValid = parseDrops(drops, weightUnit) !== null;
  const canSave =
    !isSavingSet && hasValidReps && hasWeight && !weightError && dropsValid;
  const last = performanceHistory?.last;
  const lastWeight = last ? kgToDisplay(last.weight, weightUnit) : "0";
  const stepLabel = stepWeight("0", weightUnit, weightStepKg, 1);
  const nudge = (direction: 1 | -1) =>
    setWeight(stepWeight(weight, weightUnit, weightStepKg, direction, lastWeight));
  const addDrop = () => {
    const from = drops.at(-1)?.weight ?? weight;
    setDrops([
      ...drops,
      { weight: stepWeight(from, weightUnit, weightStepKg, -1, lastWeight), reps: "" },
    ]);
    trackFeature("drop_set", "add");
  };
  const editDrop = (index: number, change: Partial<DropDraft>) =>
    setDrops(drops.map((d, i) => (i === index ? { ...d, ...change } : d)));

  return (
    <View style={styles.setFormBody}>
      <ScrollView
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps='handled'
        bounces={false}
      >
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>
            Weight ({weightUnit})
          </Text>
          {last && (
            <Text style={styles.inputHint}>
              Last time: {kgToDisplay(last.weight, weightUnit)}
              {weightUnit} × {last.reps}
            </Text>
          )}
          <View style={styles.weightRow}>
            <TextInput
              style={[styles.input, styles.weightInput]}
              value={weight}
              onChangeText={setWeight}
              keyboardType='decimal-pad'
              autoFocus
              returnKeyType='next'
              submitBehavior='submit'
              onSubmitEditing={() => repsRef.current?.focus()}
              placeholder='0 for bodyweight'
              placeholderTextColor={colors.textMuted}
              accessibilityLabel={`Weight in ${weightUnit}, leave zero for bodyweight`}
            />
            <View style={styles.weightArrows}>
              <TouchableOpacity
                style={styles.weightArrowButton}
                accessibilityRole='button'
                accessibilityLabel={`Increase weight by ${stepLabel} ${weightUnit}`}
                onPress={() => nudge(1)}
              >
                <Text style={styles.weightArrowText}>▲</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.weightArrowButton}
                accessibilityRole='button'
                accessibilityLabel={`Decrease weight by ${stepLabel} ${weightUnit}`}
                onPress={() => nudge(-1)}
              >
                <Text style={styles.weightArrowText}>▼</Text>
              </TouchableOpacity>
            </View>
          </View>
          {weightError && (
            <Text style={styles.inputError}>{weightError}</Text>
          )}
          {!hasWeight && (
            <Text style={styles.inputHint}>
              Enter a weight, or 0 for bodyweight.
            </Text>
          )}
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
        {isAssisted && (
          <View style={styles.assistedInfoBox}>
            <Text style={styles.assistedInfoText}>
              Assisted exercise: Weight represents assistance from the
              machine. Lower = harder.
            </Text>
          </View>
        )}
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

        <View style={styles.inputGroup}>
          {drops.length > 0 && (
            <Text style={styles.inputLabel}>Drops ({weightUnit} × reps)</Text>
          )}
          {drops.map((drop, index) => (
             
            <View key={index} style={styles.dropRow}>
              <TextInput
                style={[styles.input, styles.weightInput]}
                value={drop.weight}
                onChangeText={(text) => editDrop(index, { weight: text })}
                keyboardType='decimal-pad'
                placeholderTextColor={colors.textMuted}
                accessibilityLabel={`Drop ${index + 1} weight in ${weightUnit}`}
              />
              <TextInput
                style={[styles.input, styles.weightInput]}
                value={drop.reps}
                onChangeText={(text) => editDrop(index, { reps: text })}
                keyboardType='number-pad'
                autoFocus={drop.reps === ""}
                placeholder='reps'
                placeholderTextColor={colors.textMuted}
                accessibilityLabel={`Drop ${index + 1} reps`}
              />
              <Button
                label='✕'
                variant='danger'
                size='sm'
                accessibilityLabel={`Remove drop ${index + 1}`}
                onPress={() => setDrops(drops.filter((_, i) => i !== index))}
              />
            </View>
          ))}
          {!dropsValid && (
            <Text style={styles.inputHint}>
              Fill in a weight and reps for each drop, or remove it.
            </Text>
          )}
          <Button
            label='↘ Add drop'
            variant='quiet'
            size='sm'
            accessibilityLabel='Add a drop: keep going at a lower weight'
            onPress={addDrop}
          />
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
              showOneRepMax={!isAssisted}
              styles={styles}
              cardStyle={styles.performanceCard}
              valueStyle={styles.performanceStatValue}
            />
            <PerformanceCard
              title='Best Performance'
              entry={performanceHistory.best}
              weightUnit={weightUnit}
              showOneRepMax={!isAssisted}
              styles={styles}
              cardStyle={[styles.performanceCard, styles.bestPerformanceCard]}
              valueStyle={[styles.performanceStatValue, styles.bestStatValue]}
            />
            <Text style={styles.performanceTotalAttempts}>
              Total attempts: {performanceHistory.totalAttempts}
            </Text>
          </View>
        )}
        {!loadingHistory && historyFailed && (
          <View style={styles.noHistoryContainer}>
            <Text style={styles.noHistoryText}>
              {performanceHistory
                ? "Showing this week only. Couldn't load older sessions."
                : "Couldn't load your past sessions"}
            </Text>
            <TouchableOpacity
              style={styles.retryButton}
              accessibilityRole='button'
              accessibilityLabel='Retry loading history'
              onPress={onRetryHistory}
            >
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}
        {!loadingHistory && !historyFailed && !performanceHistory && (
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
          <Text style={styles.inputLabel}>Reps in reserve (RIR, optional)</Text>
          <View style={ui.chipRow} accessibilityRole='radiogroup'>
            {RIR_SCALE.map((value) => {
              const selected = rir === value;
              return (
                <Chip
                  key={value}
                  label={String(value)}
                  selected={selected}
                  accessibilityRole='radio'
                  accessibilityLabel={`${value} ${value === 1 ? "rep" : "reps"} in reserve`}
                  onPress={() => setRir(selected ? null : value)}
                />
              );
            })}
          </View>
          <Text style={styles.inputHint}>
            {rir === null
              ? "How many more reps could you have done?"
              : repsInReserveLabel(rir)}
          </Text>
        </View>
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
  showOneRepMax,
  styles,
  cardStyle,
  valueStyle,
}: {
  readonly title: string;
  readonly entry: PerformanceEntry;
  readonly weightUnit: WeightUnit;
  readonly showOneRepMax: boolean;
  readonly styles: ReturnType<typeof makeStyles>;
  readonly cardStyle: StyleProp<ViewStyle>;
  readonly valueStyle: StyleProp<TextStyle>;
}): React.JSX.Element {
  const stats: [string, string | number][] = [
    ["Weight", `${kgToDisplay(entry.weight, weightUnit)}${weightUnit}`],
    ["Reps", entry.reps],
  ];
  if (showOneRepMax)
    stats.push(["Est. 1RM", `${kgToDisplay(entry.oneRepMax, weightUnit)}${weightUnit}`]);
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
