import React, { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import type { LayoutChangeEvent, StyleProp, ViewStyle } from "react-native";
import type { ThemeColors } from "@shared/context/ThemeContext";
import type { PartnerProgress } from "@shared/context/hooks/useJointSession";
import { normalizeExerciseName } from "@utils/exerciseMatching";
import { muscleLabel } from "@utils/exerciseDb";
import type { MachineMeta, SetDetail } from "@shared/types";
import { activeMachine, kgToDisplay } from "../utils";
import type { makeStyles } from "../WorkoutScreen";
import {
  PartnerExercisePill,
  PartnerExerciseMatchBadge,
  PriorityMuscleGroupBadge,
} from "./PartnerBadges";

type PartnerMatchInfo = {
  partnerMatchesByName: boolean;
  partnerOnThis: boolean;
  partnerSetCount: number | null;
};

function getPartnerMatchInfo(
  isInJointSession: boolean,
  partnerNameSet: Set<string>,
  partnerProgress: PartnerProgress | null,
  partnerParticipant:
    | { exerciseNames?: Array<string | { name: string; sets?: number }> }
    | null
    | undefined,
  exerciseNameLower: string,
): PartnerMatchInfo {
  const partnerMatchesByName =
    isInJointSession && partnerNameSet.has(exerciseNameLower);
  const partnerActiveExercise = partnerProgress?.exerciseName ?? undefined;
  const partnerActiveNameLower = partnerActiveExercise
    ? normalizeExerciseName(partnerActiveExercise)
    : undefined;
  const partnerOnThis =
    isInJointSession &&
    !!partnerActiveNameLower &&
    partnerMatchesByName &&
    partnerActiveNameLower === exerciseNameLower;

  let partnerSetCount: number | null = null;
  if (partnerMatchesByName) {
    const entry = (partnerParticipant?.exerciseNames ?? []).find(
      (e) =>
        (typeof e === "string" ? e : e.name).trim().toLowerCase() ===
        exerciseNameLower,
    );
    partnerSetCount = typeof entry === "object" ? (entry?.sets ?? null) : null;
  }

  return { partnerMatchesByName, partnerOnThis, partnerSetCount };
}

// partnerProgress/partnerCompletedSets get a new reference on every joint-session
// websocket message, so a shallow-compare memo would re-render every card on every
// partner rep. The comparator below re-derives this card's partner state instead.

type ExerciseCardStyles = ReturnType<typeof makeStyles>;

type ExerciseCardProps = {
  exercise: {
    name: string;
    sets: number;
    primaryMuscles?: string[];
    secondaryMuscles?: string[];
    machines?: string[];
    selectedMachine?: string;
    defaultMachine?: string;
    machineMeta?: Record<string, MachineMeta>;
  };
  exerciseIndex: number;
  priorityMuscle?: string;
  currentDay: number;
  isCurrentDayLocked: boolean;
  colors: ThemeColors;
  styles: ExerciseCardStyles;
  weightUnit: "kg" | "lbs";
  isInJointSession: boolean;
  partnerNameSet: Set<string>;
  partnerProgress: PartnerProgress | null;
  partnerParticipant:
    | { exerciseNames?: Array<string | { name: string; sets?: number }> }
    | null
    | undefined;
  partnerCompletedSets: Array<{ exerciseName?: string; setIndex: number }>;
  partnerUsername: string;
  getExerciseCompletedSets: (
    currentDay: number,
    exerciseIndex: number,
  ) => unknown;
  isSetComplete: (
    currentDay: number,
    exerciseIndex: number,
    setIndex: number,
  ) => boolean;
  getSetDetails: (
    currentDay: number,
    exerciseIndex: number,
    setIndex: number,
  ) => unknown;
  isAssistedExercise: (name: string) => boolean;
  onEditExerciseName: (exerciseIndex: number) => void;
  onOpenMachines: (exerciseIndex: number) => void;
  onOpenExerciseSettings: (exerciseIndex: number) => void;
  onSetPress: (exerciseIndex: number, setIndex: number) => void;
  onQuickAddSet: (exerciseIndex: number) => void;
  onAddMultipleSets: (exerciseIndex: number) => void;
};

function partnerSetIndicesFor(
  sets: ExerciseCardProps["partnerCompletedSets"],
  exerciseNameLower: string,
): number[] {
  return sets
    .filter(
      (s) =>
        (s.exerciseName ? normalizeExerciseName(s.exerciseName) : undefined) ===
        exerciseNameLower,
    )
    .map((s) => s.setIndex);
}

const PARTNER_LIVE_KEYS = new Set(["partnerProgress", "partnerCompletedSets"]);

// The icon buttons are visually small but must still clear Android's 48dp
// minimum touch target.
const ICON_HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 };

type SetButtonFlags = {
  done: boolean;
  locked: boolean;
  warmup: boolean;
  partnerDoneThisSet: boolean;
  partnerOnSet: boolean;
};

const SETS_PER_ROW = 5;
export const SET_GAP = 8;

function setButtonStyle(
  styles: ReturnType<typeof makeStyles>,
  f: SetButtonFlags,
  size: number | null,
): StyleProp<ViewStyle> {
  return [
    styles.setButton,
    size !== null && { width: size, height: size },
    f.done && styles.setButtonComplete,
    f.locked && f.done && styles.setButtonLocked,
    f.warmup && styles.setButtonWarmup,
    f.partnerDoneThisSet && styles.setButtonPartnerDone,
    f.partnerOnSet && styles.setButtonPartner,
  ];
}

function setAccessibilityLabel(
  setIndex: number,
  done: boolean,
  detail: SetDetail | null,
  weightUnit: "kg" | "lbs",
  partnerDone: boolean,
): string {
  const parts = [
    detail?.isWarmup ? `Warm-up set ${setIndex + 1}` : `Set ${setIndex + 1}`,
  ];
  if (done && detail) {
    const load = detail.weight
      ? `${kgToDisplay(detail.weight, weightUnit)} ${weightUnit}`
      : "bodyweight";
    parts.push(`completed, ${load} for ${detail.reps || 0} reps`);
    if (detail.note) parts.push("has a note");
  } else if (done) {
    parts.push("completed");
  } else {
    parts.push("not logged");
  }
  if (partnerDone) parts.push("partner completed this set");
  return parts.join(", ");
}

function exerciseCardPropsAreEqual(
  prev: Readonly<ExerciseCardProps>,
  next: Readonly<ExerciseCardProps>,
): boolean {
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const key of keys) {
    if (PARTNER_LIVE_KEYS.has(key)) continue;
    if (
      prev[key as keyof ExerciseCardProps] !==
      next[key as keyof ExerciseCardProps]
    )
      return false;
  }

  if (
    prev.partnerProgress === next.partnerProgress &&
    prev.partnerCompletedSets === next.partnerCompletedSets
  ) {
    return true;
  }

  const exerciseNameLower = next.exercise.name
    ? normalizeExerciseName(next.exercise.name)
    : "";
  const prevMatch = getPartnerMatchInfo(
    prev.isInJointSession,
    prev.partnerNameSet,
    prev.partnerProgress,
    prev.partnerParticipant,
    exerciseNameLower,
  );
  const nextMatch = getPartnerMatchInfo(
    next.isInJointSession,
    next.partnerNameSet,
    next.partnerProgress,
    next.partnerParticipant,
    exerciseNameLower,
  );
  if (
    prevMatch.partnerOnThis !== nextMatch.partnerOnThis ||
    prevMatch.partnerMatchesByName !== nextMatch.partnerMatchesByName ||
    prevMatch.partnerSetCount !== nextMatch.partnerSetCount ||
    prev.partnerProgress?.setIndex !== next.partnerProgress?.setIndex
  ) {
    return false;
  }

  const setsKey = (sets: ExerciseCardProps["partnerCompletedSets"]) =>
    partnerSetIndicesFor(sets, exerciseNameLower)
      .sort((a, b) => a - b)
      .join(",");

  return (
    setsKey(prev.partnerCompletedSets) === setsKey(next.partnerCompletedSets)
  );
}

export const ExerciseCard = React.memo(function ExerciseCard({
  exercise,
  exerciseIndex,
  priorityMuscle,
  currentDay,
  isCurrentDayLocked,
  colors,
  styles,
  weightUnit,
  isInJointSession,
  partnerNameSet,
  partnerProgress,
  partnerParticipant,
  partnerCompletedSets,
  partnerUsername,
  getExerciseCompletedSets,
  isSetComplete,
  getSetDetails,
  isAssistedExercise,
  onEditExerciseName,
  onOpenMachines,
  onOpenExerciseSettings,
  onSetPress,
  onQuickAddSet,
  onAddMultipleSets,
}: Readonly<ExerciseCardProps>) {
  const completedSets = getExerciseCompletedSets(
    currentDay,
    exerciseIndex,
  ) as number;
  const allDone = completedSets === exercise.sets;
  const isAssisted = isAssistedExercise(exercise.name);
  const machine = activeMachine(exercise);
  const machinePin = machine ? exercise.machineMeta?.[machine]?.pin : undefined;
  const exerciseNameLower = exercise.name
    ? normalizeExerciseName(exercise.name)
    : "";
  const { partnerMatchesByName, partnerOnThis, partnerSetCount } =
    getPartnerMatchInfo(
      isInJointSession,
      partnerNameSet,
      partnerProgress,
      partnerParticipant,
      exerciseNameLower,
    );
  const partnerDoneSetIndices = new Set(
    isInJointSession
      ? partnerSetIndicesFor(partnerCompletedSets, exerciseNameLower)
      : [],
  );
  const lockedTextStyle = isCurrentDayLocked
    ? { color: colors.textPrimary }
    : null;
  const [setsRowWidth, setSetsRowWidth] = useState(0);
  const setButtonSize =
    setsRowWidth > 0
      ? Math.floor((setsRowWidth - SET_GAP * (SETS_PER_ROW - 1)) / SETS_PER_ROW)
      : null;
  const onSetsLayout = (e: LayoutChangeEvent) =>
    setSetsRowWidth(e.nativeEvent.layout.width);

  return (
    <View
      style={[
        styles.exerciseCard,
        allDone && styles.exerciseCardComplete,
        isCurrentDayLocked && styles.exerciseCardLocked,
        partnerMatchesByName && styles.exerciseCardShared,
        partnerOnThis && styles.exerciseCardPartner,
      ]}
    >
      {partnerOnThis && <PartnerExercisePill username={partnerUsername} />}
      {partnerMatchesByName && !partnerOnThis && (
        <PartnerExerciseMatchBadge
          partnerSets={partnerSetCount}
          mySets={exercise.sets}
        />
      )}
      {priorityMuscle && (
        <PriorityMuscleGroupBadge muscleGroup={priorityMuscle} />
      )}

      <View style={styles.exerciseHeader}>
        <View style={styles.exerciseInfo}>
          <View style={styles.exerciseNameRow}>
            <Text
              numberOfLines={1}
              style={[
                styles.exerciseName,
                allDone && styles.exerciseNameComplete,
              ]}
            >
              {exercise.name}
              {isAssisted && (
                <Text accessibilityLabel="assisted exercise"> 🤝</Text>
              )}
            </Text>
            {!isCurrentDayLocked && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Rename exercise"
                hitSlop={ICON_HIT_SLOP}
                onPress={() => onEditExerciseName(exerciseIndex)}
                style={styles.editButton}
              >
                <Text style={styles.editButtonText}>✏️</Text>
              </TouchableOpacity>
            )}
            {!isCurrentDayLocked && machine && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Change machine, currently ${machine}`}
                hitSlop={ICON_HIT_SLOP}
                onPress={() => onOpenMachines(exerciseIndex)}
                style={styles.machineChip}
              >
                <Text style={styles.machineChipText} numberOfLines={1}>
                  {machine}
                  {machinePin === undefined ? "" : ` · pin ${machinePin}`} ▾
                </Text>
              </TouchableOpacity>
            )}
            {!isCurrentDayLocked && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Exercise and machine settings"
                hitSlop={ICON_HIT_SLOP}
                onPress={() => onOpenExerciseSettings(exerciseIndex)}
                style={styles.editButton}
              >
                <Text style={styles.editButtonText}>⚙️</Text>
              </TouchableOpacity>
            )}
          </View>
          {muscleLabel(exercise.primaryMuscles, exercise.secondaryMuscles) ? (
            <Text style={styles.muscleGroup}>
              {muscleLabel(exercise.primaryMuscles, exercise.secondaryMuscles)}
            </Text>
          ) : null}
        </View>
        <View style={styles.exerciseProgress}>
          <Text style={styles.exerciseProgressText}>
            {completedSets}/{exercise.sets}
          </Text>
        </View>
      </View>

      <View style={styles.setsContainer} onLayout={onSetsLayout}>
        {Array.from({ length: exercise.sets }, (_, setIndex) => {
          const done = isSetComplete(currentDay, exerciseIndex, setIndex);
          if (isCurrentDayLocked && !done) return null;
          const setDetails = getSetDetails(
            currentDay,
            exerciseIndex,
            setIndex,
          ) as SetDetail | null;
          const partnerDoneThisSet = partnerDoneSetIndices.has(setIndex);
          const partnerOnSet =
            partnerOnThis && partnerProgress?.setIndex === setIndex;
          return (
            <TouchableOpacity
              key={`${exercise.name || exerciseIndex}-set-${setIndex}`}
              style={setButtonStyle(
                styles,
                {
                  done,
                  locked: isCurrentDayLocked,
                  warmup: !!setDetails?.isWarmup,
                  partnerDoneThisSet,
                  partnerOnSet,
                },
                setButtonSize,
              )}
              onPress={() => onSetPress(exerciseIndex, setIndex)}
              activeOpacity={isCurrentDayLocked ? 1 : 0.7}
              disabled={isCurrentDayLocked && !done}
              accessibilityRole="button"
              accessibilityLabel={setAccessibilityLabel(
                setIndex,
                done,
                setDetails,
                weightUnit,
                partnerDoneThisSet,
              )}
              accessibilityState={{
                checked: done,
                disabled: isCurrentDayLocked && !done,
              }}
            >
              {partnerOnSet && <View style={styles.partnerSetDot} />}
              <Text
                style={[
                  styles.setButtonNumber,
                  done && styles.setButtonNumberComplete,
                  done && lockedTextStyle,
                  setDetails?.isWarmup && styles.warmupText,
                  partnerDoneThisSet && done && { color: colors.accentDark },
                ]}
              >
                {setDetails?.isWarmup ? "W" : setIndex + 1}
              </Text>
              {done && setDetails && (
                <View style={styles.setDetailsPreview}>
                  <Text
                    style={[styles.setDetailsText, lockedTextStyle]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {setDetails.weight
                      ? `${kgToDisplay(setDetails.weight, weightUnit)}${weightUnit}`
                      : "BW"}
                  </Text>
                  <Text
                    style={[styles.setDetailsText, lockedTextStyle]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    ×{setDetails.reps || 0}
                  </Text>
                </View>
              )}
              {done && !!setDetails?.note && (
                <Text style={styles.setNoteIndicator}>📝</Text>
              )}
              {done && (
                <View style={styles.setCheckmark}>
                  <Text style={styles.setCheckmarkText}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
        {!isCurrentDayLocked && (
          <TouchableOpacity
            style={[
              styles.addSetButton,
              setButtonSize !== null && {
                width: setButtonSize,
                height: setButtonSize,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Add a set"
            accessibilityHint="Long press to add multiple sets"
            onPress={() => onQuickAddSet(exerciseIndex)}
            onLongPress={() => onAddMultipleSets(exerciseIndex)}
          >
            <Text style={styles.addSetButtonIcon}>+</Text>
          </TouchableOpacity>
        )}
      </View>

      {!isCurrentDayLocked && (
        <View style={styles.exerciseHint}>
          <Text style={styles.exerciseHintText}>
            Tap + to add 1 set · Long press for multiple
          </Text>
        </View>
      )}
    </View>
  );
}, exerciseCardPropsAreEqual);
