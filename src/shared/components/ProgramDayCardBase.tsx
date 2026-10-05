import React from "react";
import {
  View,
  Text,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { muscleLabel } from "@utils/exerciseDb";

interface ProgramExerciseLike {
  readonly name?: string;
  readonly primaryMuscles?: readonly string[];
  readonly secondaryMuscles?: readonly string[];
  readonly setsBySplit?: Record<string, number | string> | null;
  readonly reps?: string | number;
}

export interface ProgramDayLike<
  Ex extends ProgramExerciseLike = ProgramExerciseLike,
> {
  readonly dayNumber?: number;
  readonly dayTitle?: string;
  readonly exercises?: readonly Ex[] | null;
}

export function getDayExerciseList<Ex extends ProgramExerciseLike>(
  day: ProgramDayLike<Ex>,
  selectedProgram: string | null,
): Ex[] {
  if (!Array.isArray(day.exercises)) return [];
  if (!selectedProgram) return day.exercises as Ex[];
  return day.exercises.filter(
    (ex) => Number(ex.setsBySplit?.[selectedProgram] ?? 0) > 0,
  );
}

/** A program without reps leaves them blank, but an explicit 0 is a mistake to warn about. */
function repsLabel(reps: string | number | undefined): string | null {
  const text = String(reps ?? "").trim();
  if (!text || Number(text) === 0) return null;
  return `${text} reps`;
}

export function getDayLabelAndTitle(
  day: ProgramDayLike,
  dayIdx: number,
  displayNumber?: number,
): { dayLabel: string; dayTitle: string } {
  const dayLabel = `Day ${displayNumber ?? day.dayNumber ?? dayIdx + 1}`;
  if (!day.dayTitle) return { dayLabel, dayTitle: "" };
  const emDash = day.dayTitle.indexOf("—");
  const dayTitle =
    emDash === -1 ? day.dayTitle : day.dayTitle.slice(emDash + 1).trim();
  return { dayLabel, dayTitle };
}

export function getSplitEntries(
  exercise: ProgramExerciseLike,
  selectedProgram: string | null,
): Array<[string, number]> {
  const setsBySplit = exercise.setsBySplit ?? {};
  if (!selectedProgram) {
    return Object.entries(setsBySplit).map(
      ([split, count]) => [split, Number(count)] as [string, number],
    );
  }
  return [[selectedProgram, Number(setsBySplit[selectedProgram] ?? 0)]];
}

interface ProgramExerciseRowStyles {
  readonly programExerciseRow: StyleProp<ViewStyle>;
  readonly programExerciseLeft: StyleProp<ViewStyle>;
  readonly programExerciseName: StyleProp<TextStyle>;
  readonly programExerciseSets: StyleProp<TextStyle>;
  readonly programSetsRow: StyleProp<ViewStyle>;
  readonly programSetsBadge: StyleProp<ViewStyle>;
  readonly programSetsBadgeText: StyleProp<TextStyle>;
  readonly programSetsBadgeLabel: StyleProp<TextStyle>;
}

interface ProgramExerciseRowProps {
  readonly name: string;
  readonly primaryMuscles?: readonly string[];
  readonly secondaryMuscles?: readonly string[];
  readonly reps?: string | number;
  readonly splitEntries: Array<[string, number]>;
  readonly styles: ProgramExerciseRowStyles;
}

export function ProgramExerciseRow({
  name,
  primaryMuscles,
  secondaryMuscles,
  reps,
  splitEntries,
  styles,
}: ProgramExerciseRowProps): React.JSX.Element {
  const muscles = muscleLabel(primaryMuscles, secondaryMuscles);
  const repsText = repsLabel(reps);
  const label = [muscles, repsText].filter(Boolean).join(" • ");
  return (
    <View style={styles.programExerciseRow}>
      <View style={styles.programExerciseLeft}>
        <Text style={styles.programExerciseName}>{name}</Text>
        {label ? <Text style={styles.programExerciseSets}>{label}</Text> : null}
      </View>
      <View style={styles.programSetsRow}>
        {splitEntries.map(([split, count]) => (
          <View key={split} style={styles.programSetsBadge}>
            <Text style={styles.programSetsBadgeText}>{count}</Text>
            <Text style={styles.programSetsBadgeLabel}>{split}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

interface ProgramDayHeaderStyles {
  readonly programDayHeader: StyleProp<ViewStyle>;
  readonly programDayNumber: StyleProp<TextStyle>;
  readonly programDayTitle: StyleProp<TextStyle>;
}

interface ProgramDayHeaderProps {
  readonly dayLabel: string;
  readonly dayTitle: string;
  readonly styles: ProgramDayHeaderStyles;
  readonly children?: React.ReactNode;
}

export function ProgramDayHeader({
  dayLabel,
  dayTitle,
  styles,
  children,
}: ProgramDayHeaderProps): React.JSX.Element {
  return (
    <View style={styles.programDayHeader}>
      <Text style={styles.programDayNumber}>{dayLabel}</Text>
      <Text style={styles.programDayTitle} numberOfLines={2}>
        {dayTitle}
      </Text>
      {children}
    </View>
  );
}
