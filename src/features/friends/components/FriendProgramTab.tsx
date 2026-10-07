import React from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { formatDate } from "@utils/format";
import {
  ProgramDayHeader,
  ProgramExerciseRow,
  getDayExerciseList,
  getDayLabelAndTitle,
  getSplitEntries,
} from "@shared/components/ProgramDayCardBase";
import type { Friend } from "../services";
import type { ProgramData, ReceivedProgram } from "../types";
import type { makeStyles } from "../FriendsScreen";

type ProgramDay = NonNullable<ProgramData["days"]>[number];

interface ProgramDayCardProps {
  readonly day: ProgramDay;
  readonly dayIdx: number;
  readonly selectedProgram: string | null;
  readonly styles: ReturnType<typeof makeStyles>;
}

function ProgramDayCard({
  day,
  dayIdx,
  selectedProgram,
  styles,
}: ProgramDayCardProps): React.JSX.Element | null {
  const exercises = getDayExerciseList(day, selectedProgram);
  if (!exercises.length) return null;
  const { dayLabel, dayTitle } = getDayLabelAndTitle(day, dayIdx);

  return (
    <View style={styles.programDayCard}>
      <ProgramDayHeader
        dayLabel={dayLabel}
        dayTitle={dayTitle}
        styles={styles}
      />
      {exercises.map((exercise, exIdx) => (
        <ProgramExerciseRow
          key={exercise.name ?? `exercise-${exIdx}`}
          name={exercise.name ?? `Exercise ${exIdx + 1}`}
          primaryMuscles={exercise.primaryMuscles}
          secondaryMuscles={exercise.secondaryMuscles}
          reps={exercise.reps}
          splitEntries={getSplitEntries(exercise, selectedProgram)}
          styles={styles}
        />
      ))}
    </View>
  );
}

interface ProgramPeopleSelectorProps {
  readonly options: string[];
  readonly selectedProgram: string | null;
  readonly onSelect: (option: string | null) => void;
  readonly styles: ReturnType<typeof makeStyles>;
}

function ProgramPeopleSelector({
  options,
  selectedProgram,
  onSelect,
  styles,
}: ProgramPeopleSelectorProps): React.JSX.Element {
  return (
    <View style={styles.peopleSelectorContainer}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.peopleSelectorScroll}
      >
        {options.map((option) => {
          const active =
            selectedProgram === option ||
            (option === "All" && !selectedProgram);
          return (
            <TouchableOpacity
              key={option}
              style={[styles.peoplePill, active && styles.peoplePillActive]}
              onPress={() => onSelect(option === "All" ? null : option)}
            >
              <Text
                style={[
                  styles.peoplePillText,
                  active && styles.peoplePillTextActive,
                ]}
              >
                {option}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

interface FriendProgramTabProps {
  readonly selectedFriend: Friend | null;
  readonly receivedPrograms: ReceivedProgram[];
  readonly selectedProgram: string | null;
  readonly setSelectedProgram: (option: string | null) => void;
  readonly onUsePlan: (program: ReceivedProgram) => void;
  readonly styles: ReturnType<typeof makeStyles>;
}

export function FriendProgramTab({
  selectedFriend,
  receivedPrograms,
  selectedProgram,
  setSelectedProgram,
  onUsePlan,
  styles,
}: FriendProgramTabProps): React.JSX.Element {
  const programsFromFriend = receivedPrograms.filter(
    (p) => p.senderId === selectedFriend?.id,
  );

  if (!programsFromFriend.length) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyIcon}>🔒</Text>
        <Text style={styles.emptyTitle}>No program shared</Text>
        <Text style={styles.emptyText}>
          {selectedFriend?.username} hasn't shared a program with you.
        </Text>
      </View>
    );
  }

  const program = programsFromFriend[0];
  const pd = program.programData;
  const firstExercise = pd?.days?.[0]?.exercises?.[0];
  const setsBySplit = firstExercise?.setsBySplit;
  const splitNames = setsBySplit ? Object.keys(setsBySplit) : [];
  const allOptions = ["All", ...splitNames];

  return (
    <View style={{ flex: 1 }}>
      <ProgramPeopleSelector
        options={allOptions}
        selectedProgram={selectedProgram}
        onSelect={setSelectedProgram}
        styles={styles}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 16, paddingBottom: 40 }}
      >
        <View style={styles.programViewHeader}>
          <Text style={styles.programViewTitle}>
            {pd?.name || "Shared Program"}
          </Text>
          <Text style={styles.programViewMeta}>
            {pd?.totalDays} days
            {splitNames.length ? ` • ${splitNames.join(" / ")}` : ""}
          </Text>
          <Text style={styles.programViewShared}>
            Shared {formatDate(program.sharedAt)}
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => onUsePlan(program)}
            accessibilityRole="button"
            accessibilityLabel={`Use ${pd?.name || "this plan"} as your plan`}
          >
            <Text style={styles.primaryButtonText}>Use this plan</Text>
          </TouchableOpacity>
        </View>
        {Array.isArray(pd?.days) &&
          pd.days.map((day, dayIdx) => (
            <ProgramDayCard
              key={day.dayNumber ?? `day-${dayIdx}`}
              day={day}
              dayIdx={dayIdx}
              selectedProgram={selectedProgram}
              styles={styles}
            />
          ))}
      </ScrollView>
    </View>
  );
}
