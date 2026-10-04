import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  startTransition,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  TextInput,
  LayoutAnimation,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useWorkoutPick } from "@shared/context/WorkoutContext";
import { useTheme } from "@shared/context/ThemeContext";
import type { ThemeColors } from "@shared/context/ThemeContext";
import { useAlert } from "@shared/components/CustomAlert";
import { matchProgram, applyResolution } from "./utils/matchProgram";
import type { UnresolvedExercise } from "./utils/matchProgram";
import MatchReviewModal from "./components/MatchReviewModal";
import { workoutApi } from "@features/workout/services/index";
import { programApi } from "@features/plan/services/index";
import { log, metric, trackSpan, captureException } from "@shared/services/crashReporting";
import { useWidgets, useWidgetBoard } from "@shared/context/hooks/useWidgets";
import WidgetGallery from "@shared/components/widgets/WidgetGallery";
import WidgetEditButton from "@shared/components/widgets/WidgetEditButton";
import {
  WidgetPullHint,
  WidgetEditHeader,
} from "@shared/components/widgets/WidgetBoardChrome";
import WidgetsPanel from "@shared/components/widgets/WidgetsPanel";
import { embedInstance } from "@shared/components/widgets/embedWidget";
import {
  PLAN_WIDGET_REGISTRY,
  DEFAULT_PLAN_WIDGETS,
  type PlanWidgetType,
} from "./widgets";
import type { WorkoutData, WorkoutDay, WidgetInstance } from "@shared/types";
import {
  DEFAULT_SPLITS,
  createCustomSplitTemplate,
  buildProgramFromTemplate,
  findActiveTemplateId,
  insertTemplateIntoProgram,
  type SplitTemplate,
  type SplitDayTemplate,
} from "@features/plan/utils/splitTemplates";
import {
  exportProgramData,
  exportProgramSpreadsheet,
} from "@features/plan/utils/exportProgram";
import {
  DEFAULT_TARGET_RANGE,
  type TargetRange,
} from "@features/plan/utils/programSpreadsheet";
import { DESTINATION_TEXT, type ExportResult } from "@utils/writeJsonExport";
import { muscleFrequency } from "./utils/muscleFrequency";
import {
  extractSplitColumnCandidates,
  parseWorkoutFileClient,
  type SplitColumnCandidate,
} from "@utils/clientWorkoutParser";
import SplitColumnPicker from "./utils/splitColumnPicker";
import ModalSheet from "@shared/components/ModalSheet";
import type { WdDay, SplitDayDraft } from "./types";
import { SplitDayRow } from "./components/SplitDayRow";
import type { CanonicalExercise } from "@utils/exerciseDb";
import { ProgramDayCard } from "./components/ProgramDayCard";
import { visibleDaysForSplit } from "@utils/programDays";
import {
  applySplitDraft,
  draftsFromProgram,
  sanitizeRepsInput,
} from "./utils/splitDraft";
import { zeroRepExercises } from "./utils/zeroRepExercises";
import { STORAGE_KEYS } from "@shared/services/storage";
import { userFacingError } from "@shared/services/apiError";
import { markProgramDirty } from "@shared/services/programDirty";
import { tutorialAnchor } from "@features/tutorial/anchors";

export type Styles = ReturnType<typeof makeStyles>;

// Rendering every day card at once is what makes Plan feel slow to load for
// large imported programs. Each card is a full nested tree (exercises,
// sets-by-split badges). Showing a bounded slice up front keeps first paint
// fast, and "Show more" reveals the rest on demand.
const INITIAL_DAYS_SHOWN = 10;

const DEFAULT_TEMPLATE_SETS = 3;

let nextDraftDayId = 0;

const EMPTY_SPLIT_DAY = (): SplitDayDraft => ({
  id: `new-${nextDraftDayId++}`,
  dayTitle: "",
  exercises: [],
});

const OFFLINE_SAVE_NOTE =
  "\n\nWe couldn't reach the server, so this isn't on your other devices yet.";

const reportProgramSyncFailure = (op: string, err: unknown): void => {
  metric.count("plan.program_sync_failed", 1, { attributes: { op } });
  log.warn("plan.program_sync_failed", {
    op,
    reason: (err as Error).message,
  });
  captureException(err, { stage: "programSync", op }, "warning");
};

const syncProgram = async (
  op: string,
  program: WorkoutData,
  userId: string | null,
): Promise<boolean> => {
  try {
    await programApi.saveProgram(program);
    return true;
  } catch (err) {
    reportProgramSyncFailure(op, err);
    await markProgramDirty(userId);
    return false;
  }
};

export default function PlanScreen({
  embedWidget,
}: {
  readonly embedWidget?: PlanWidgetType;
} = {}): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {
    workoutData,
    selectedSplit,
    saveWorkoutData,
    saveSelectedSplit,
    userId,
  } = useWorkoutPick(
    "workoutData",
    "selectedSplit",
    "saveWorkoutData",
    "saveSelectedSplit",
    "userId",
  );
  const { alert, AlertComponent } = useAlert();

  const warnSaveFailed = useCallback(
    (error: unknown) => {
      console.error("Failed to save program change:", error);
      alert(
        "Couldn't save",
        "That change wasn't saved. Check your connection and try again.",
        [{ text: "OK" }],
        "error",
      );
    },
    [alert],
  );
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [unresolvedMatches, setUnresolvedMatches] = useState<
    UnresolvedExercise[]
  >([]);
  const [showMatchReview, setShowMatchReview] = useState(false);
  const hasCheckedMatches = useRef(false);
  // Resolving matches saves several times in a row, but `saveWorkoutData` only
  // publishes the new program after an await, so each resolution has to build
  // on the previous one's result rather than on this render's stale copy.
  const workoutDataRef = useRef(workoutData);
  const publishedRef = useRef(workoutData);
  if (publishedRef.current !== workoutData) {
    publishedRef.current = workoutData;
    workoutDataRef.current = workoutData;
  }
  const [selectedProgram, setSelectedProgram] = useState<string | null>(null);
  const {
    widgets,
    isLoaded: widgetsLoaded,
    availableToAdd,
    addWidget,
    removeWidget,
    cycleWidgetSize,
    reorderWidgets,
  } = useWidgets<PlanWidgetType>(userId ?? null, {
    registry: PLAN_WIDGET_REGISTRY,
    defaults: DEFAULT_PLAN_WIDGETS,
    storageKey: STORAGE_KEYS.PLAN_WIDGETS,
  });

  const [contentReady, setContentReady] = useState(false);

  useEffect(() => {
    startTransition(() => {
      setContentReady(true);
    });
  }, []);

  // Two-finger pull brings up the "deploy" panel for adding widgets, the same
  // gesture as HomeScreen. Opening it and tapping "Edit Widgets" switches
  // this screen into edit mode, where placed widgets can be resized,
  // removed, or dragged to reorder.
  const widgetBoard = useWidgetBoard(addWidget, {
    onError: (message) => alert("Can't Add Widget", message, [{ text: "OK" }]),
  });

  const [visibleDayCount, setVisibleDayCount] = useState(INITIAL_DAYS_SHOWN);
  const [hiddenDays, setHiddenDays] = useState<Set<number>>(new Set());
  const [isCreatingSplit, setIsCreatingSplit] = useState(false);
  const [editingSplitName, setEditingSplitName] = useState<string | null>(null);
  const [expandedSplitDayIdx, setExpandedSplitDayIdx] = useState<number | null>(
    0,
  );
  const [newSplitName, setNewSplitName] = useState("");
  const [draftSplitDays, setDraftSplitDays] = useState<SplitDayDraft[]>([
    EMPTY_SPLIT_DAY(),
  ]);
  const [isApplyingTemplate, setIsApplyingTemplate] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isChoosingTargets, setIsChoosingTargets] = useState(false);
  const [targetMinText, setTargetMinText] = useState(
    String(DEFAULT_TARGET_RANGE.min),
  );
  const [targetMaxText, setTargetMaxText] = useState(
    String(DEFAULT_TARGET_RANGE.max),
  );

  const [pendingImportUri, setPendingImportUri] = useState<string | null>(null);
  const [pendingImportName, setPendingImportName] = useState<string | null>(
    null,
  );
  const [columnCandidates, setColumnCandidates] = useState<
    SplitColumnCandidate[]
  >([]);
  const [selectedColumnIndices, setSelectedColumnIndices] = useState<
    Set<number>
  >(new Set());
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [isImportingColumns, setIsImportingColumns] = useState(false);

  // Any save (logging a set, resolving a match) hands back a fresh
  // workoutData object, so only the set of splits counts as a change. A day
  // renamed, added or removed leaves every row the user opened where it was.
  const programShape = useMemo(
    () => (workoutData?.split ?? []).join(","),
    [workoutData],
  );

  useEffect(() => {
    setSelectedProgram(null);
    setHiddenDays(new Set());
    setVisibleDayCount(INITIAL_DAYS_SHOWN);
  }, [programShape]);

  useEffect(() => {
    hasCheckedMatches.current = false;
  }, [userId]);

  useEffect(() => {
    if (hasCheckedMatches.current || !workoutData?.days?.length) return;
    hasCheckedMatches.current = true;
    const { program: matched, unresolved, changed } = matchProgram(workoutData);
    setUnresolvedMatches(unresolved);
    if (changed) {
      saveWorkoutData(matched)
        .then(() => syncProgram("auto_match", matched, userId ?? null))
        .catch(warnSaveFailed);
    }
  }, [workoutData, saveWorkoutData, warnSaveFailed, userId]);

  const handleRecheckMatches = (): void => {
    if (!workoutData) return;
    const { program: matched, unresolved, changed } = matchProgram(workoutData);
    setUnresolvedMatches(unresolved);
    setShowMatchReview(unresolved.length > 0);
    if (changed)
      saveWorkoutData(matched)
        .then(() => syncProgram("recheck_match", matched, userId ?? null))
        .catch(warnSaveFailed);
    if (unresolved.length === 0)
      alert(
        "All matched",
        "Every exercise is linked to the database.",
        [{ text: "OK" }],
        "success",
      );
  };

  const handleUploadFile = async (): Promise<void> => {
    try {
      setIsUploading(true);
      const fileUri = await workoutApi.pickWorkoutFile();
      if (!fileUri) {
        setIsUploading(false);
        return;
      }

      const candidates = await extractSplitColumnCandidates(fileUri);
      if (candidates.length === 0) {
        alert(
          "No columns found",
          'We couldn\'t find any column headers to choose from in this file. Double-check it has a "Day" row followed by a header row, or a "Day"/"Exercise" header row with a day column.',
          [{ text: "OK" }],
        );
        setIsUploading(false);
        return;
      }

      const fileName = fileUri.split("/").pop() ?? null;
      setPendingImportUri(fileUri);
      setPendingImportName(fileName);
      setColumnCandidates(candidates);
      setSelectedColumnIndices(
        new Set(candidates.filter((c) => c.autoSelected).map((c) => c.index)),
      );
      setShowColumnPicker(true);
    } catch (error) {
      captureException(error, { stage: "readWorkoutFile" });
      alert(
        "Error",
        (error instanceof Error ? error.message : null) ??
          "Failed to read workout file",
        [{ text: "OK" }],
      );
    } finally {
      setIsUploading(false);
    }
  };

  const toggleColumnSelection = (index: number) => {
    setSelectedColumnIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const selectAllColumns = () => {
    setSelectedColumnIndices(new Set(columnCandidates.map((c) => c.index)));
  };

  const selectNoneColumns = () => {
    setSelectedColumnIndices(new Set());
  };

  const resetColumnPicker = () => {
    setShowColumnPicker(false);
    setPendingImportUri(null);
    setPendingImportName(null);
    setColumnCandidates([]);
    setSelectedColumnIndices(new Set());
  };

  const runColumnImport = async (): Promise<void> => {
    if (!pendingImportUri || selectedColumnIndices.size === 0) return;
    setIsImportingColumns(true);
    try {
      const data = await trackSpan("plan.import_workbook", "screen.load", () =>
        parseWorkoutFileClient(
          pendingImportUri,
          Array.from(selectedColumnIndices),
        ),
      );
      const { program: matched, unresolved } = matchProgram(data);
      await saveWorkoutData(matched);
      setUnresolvedMatches(unresolved);
      setShowMatchReview(unresolved.length > 0);
      const synced = await syncProgram("import", matched, userId ?? null);
      alert(
        synced ? "Success!" : "Imported on this device",
        `Loaded ${data?.totalDays ?? data?.days?.length ?? 0} workout days for ${data.split?.join(", ") ?? ""}${synced ? "" : OFFLINE_SAVE_NOTE}`,
        [{ text: "OK" }],
        synced ? "success" : "info",
      );
      resetColumnPicker();
    } catch (error) {
      captureException(error, { stage: "importWorkoutFile" });
      alert(
        "Couldn't import that file",
        `${(error instanceof Error ? error.message : null) ?? "The file couldn't be read."}

Your current program is untouched. Check that you picked the right columns, or pick a different file.`,
        [{ text: "OK" }],
      );
    } finally {
      setIsImportingColumns(false);
    }
  };

  const handleConfirmColumnImport = (): void => {
    if (!pendingImportUri || selectedColumnIndices.size === 0) return;
    if (!workoutData) {
      void runColumnImport();
      return;
    }
    alert(
      "Replace your program?",
      "Importing replaces your current program and every split in it. This can't be undone. Export a copy first if you want to keep it.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Replace",
          style: "destructive",
          onPress: () => void runColumnImport(),
        },
      ],
      "warning",
    );
  };

  const matchUndoRef = useRef<{
    program: WorkoutData;
    target: UnresolvedExercise;
  } | null>(null);
  const [canUndoMatch, setCanUndoMatch] = useState(false);
  const matchSyncDirtyRef = useRef(false);

  const handleResolveMatch = async (
    target: UnresolvedExercise,
    exerciseId: string | null,
  ) => {
    setUnresolvedMatches((prev) => prev.filter((u) => u !== target));
    const current = workoutDataRef.current;
    if (!current) return;
    const updated = applyResolution(current, target, exerciseId);
    matchUndoRef.current = { program: current, target };
    setCanUndoMatch(true);
    workoutDataRef.current = updated;
    await saveWorkoutData(updated);
    // Each answer used to POST the whole program. A 30-name import made 30
    // uploads race each other. Pushed once when the review is put away.
    matchSyncDirtyRef.current = true;
  };

  const handleDismissMatches = () => {
    alert(
      "Dismiss the review?",
      `${unresolvedMatches.length} exercise${unresolvedMatches.length === 1 ? "" : "s"} will stay unmatched. You can bring the review back with "Re-check exercise matches".`,
      [
        { text: "Keep reviewing", style: "cancel" },
        {
          text: "Dismiss",
          style: "destructive",
          onPress: () => setUnresolvedMatches([]),
        },
      ],
      "warning",
    );
  };

  const handleUndoMatch = async () => {
    const undo = matchUndoRef.current;
    if (!undo) return;
    matchUndoRef.current = null;
    setCanUndoMatch(false);
    workoutDataRef.current = undo.program;
    await saveWorkoutData(undo.program);
    setUnresolvedMatches((prev) => [undo.target, ...prev]);
  };

  useEffect(() => {
    if (showMatchReview || !matchSyncDirtyRef.current) return;
    matchSyncDirtyRef.current = false;
    const data = workoutDataRef.current;
    if (data) void syncProgram("resolve_match", data, userId ?? null);
  }, [showMatchReview, userId]);

  const openCreateSplit = () => {
    setExpandedSplitDayIdx(0);
    setIsCreatingSplit(true);
  };

  const toggleSplitDayExpanded = (idx: number) =>
    setExpandedSplitDayIdx((prev) => (prev === idx ? null : idx));

  const addDraftSplitDay = () => {
    setExpandedSplitDayIdx(draftSplitDays.length);
    setDraftSplitDays((prev) => [...prev, EMPTY_SPLIT_DAY()]);
  };

  const removeDraftSplitDay = (idx: number) => {
    const withoutDay = (days: SplitDayDraft[]) =>
      days.filter((_, i) => i !== idx);
    const drop = () => {
      setDraftSplitDays(withoutDay);
      setExpandedSplitDayIdx(null);
    };
    const day = draftSplitDays[idx];
    if (!day || day.exercises.length === 0) {
      drop();
      return;
    }
    const count = `${day.exercises.length} exercise${day.exercises.length === 1 ? "" : "s"}`;
    const dayLabel = day.dayTitle.trim() || `day ${idx + 1}`;
    alert(
      `Remove ${dayLabel}?`,
      day.dayIdx === undefined
        ? `Its ${count} will be discarded.`
        : `Its ${count} go with it, and the day leaves your program when you save.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: drop },
      ],
      "warning",
    );
  };

  const patchDraftSplitDay = (
    idx: number,
    patch: (day: SplitDayDraft) => SplitDayDraft,
  ) => {
    setDraftSplitDays((prev) =>
      prev.map((day, i) => (i === idx ? patch(day) : day)),
    );
  };

  const updateDraftSplitDayTitle = (idx: number, value: string) =>
    patchDraftSplitDay(idx, (day) => ({ ...day, dayTitle: value }));

  const addDraftSplitExercise = (idx: number, exercise: CanonicalExercise) =>
    patchDraftSplitDay(idx, (day) => ({
      ...day,
      exercises: [
        ...day.exercises,
        {
          name: exercise.name,
          exerciseId: exercise.id,
          primaryMuscles: exercise.primaryMuscles,
          secondaryMuscles: exercise.secondaryMuscles,
          sets: String(DEFAULT_TEMPLATE_SETS),
          reps: "",
        },
      ],
    }));

  const updateDraftSplitExerciseSets = (
    idx: number,
    exIdx: number,
    value: string,
  ) =>
    patchDraftSplitDay(idx, (day) => ({
      ...day,
      exercises: day.exercises.map((e, i) =>
        i === exIdx ? { ...e, sets: value.replace(/\D/g, "") } : e,
      ),
    }));

  const updateDraftSplitExerciseReps = (
    idx: number,
    exIdx: number,
    value: string,
  ) =>
    patchDraftSplitDay(idx, (day) => ({
      ...day,
      exercises: day.exercises.map((e, i) =>
        i === exIdx ? { ...e, reps: sanitizeRepsInput(value) } : e,
      ),
    }));

  const removeDraftSplitExercise = (idx: number, exIdx: number) => {
    const drop = () =>
      patchDraftSplitDay(idx, (day) => ({
        ...day,
        exercises: day.exercises.filter((_, i) => i !== exIdx),
      }));
    const name = draftSplitDays[idx]?.exercises[exIdx]?.name?.trim();
    if (!name) {
      drop();
      return;
    }
    alert(
      "Remove exercise?",
      `"${name}" will be removed from this day.`,
      [
        { text: "Keep it", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: drop },
      ],
      "warning",
    );
  };

  const resetCreateSplitForm = () => {
    setIsCreatingSplit(false);
    setEditingSplitName(null);
    setNewSplitName("");
    setDraftSplitDays([EMPTY_SPLIT_DAY()]);
  };

  const draftHasContent = () =>
    newSplitName.trim() !== "" ||
    draftSplitDays.some((d) => d.dayTitle.trim() || d.exercises.length > 0);

  const confirmDiscardDraft = () => {
    if (!draftHasContent()) {
      resetCreateSplitForm();
      return;
    }
    alert(
      "Discard this split?",
      "Everything you've entered here will be lost.",
      [
        { text: "Keep editing", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: resetCreateSplitForm,
        },
      ],
      "warning",
    );
  };

  const openEditSplit = (split: string) => {
    const drafts = draftsFromProgram(workoutData?.days ?? [], split);
    setDraftSplitDays(drafts.length > 0 ? drafts : [EMPTY_SPLIT_DAY()]);
    setNewSplitName(split);
    setEditingSplitName(split);
    setExpandedSplitDayIdx(null);
    setIsCreatingSplit(true);
  };

  const handleSaveSplitEdits = async () => {
    if (!editingSplitName || !workoutData) return;
    const emptyTitled = draftSplitDays.filter(
      (d) => d.dayTitle.trim() && d.exercises.length === 0,
    );
    if (emptyTitled.length > 0) {
      alert(
        "Add an exercise first",
        `${emptyTitled
          .map((d) => `"${d.dayTitle.trim()}"`)
          .join(", ")} has no exercises, so it can't be saved. Add one, or clear the title to drop the day.`,
        [{ text: "OK" }],
        "warning",
      );
      return;
    }
    setIsApplyingTemplate(true);
    try {
      const updated = applySplitDraft(
        workoutData,
        editingSplitName,
        draftSplitDays.filter(
          (d) => d.dayTitle.trim() || d.exercises.length > 0,
        ),
      );
      await saveWorkoutData(updated);
      const synced = await syncProgram("edit_split", updated, userId ?? null);
      resetCreateSplitForm();
      alert(
        synced ? "Saved!" : "Saved on this device",
        `"${editingSplitName}" updated.${synced ? "" : OFFLINE_SAVE_NOTE}`,
        [{ text: "OK" }],
        synced ? "success" : "info",
      );
    } catch (error) {
      alert(
        "Couldn't save your changes",
        `${userFacingError(error, "Something went wrong.")}\n\nYour changes are still here. Try saving again.`,
        [{ text: "OK" }],
      );
    } finally {
      setIsApplyingTemplate(false);
    }
  };

  const handleCreateSplit = async (mode: "new" | "insert") => {
    if (!newSplitName.trim()) {
      alert("Missing name", "Give your split a name first.", [{ text: "OK" }]);
      return;
    }
    const days: SplitDayTemplate[] = draftSplitDays
      .filter((d) => d.dayTitle.trim() || d.exercises.length > 0)
      .map((d, i) => ({
        dayTitle: d.dayTitle.trim() || `Day ${i + 1}`,
        primaryMuscles: Array.from(
          new Set(
            d.exercises
              .flatMap((e) => e.primaryMuscles)
              .filter((g) => g.trim()),
          ),
        ),
        secondaryMuscles: Array.from(
          new Set(
            d.exercises
              .flatMap((e) => e.secondaryMuscles)
              .filter((g) => g.trim()),
          ),
        ),
        exercises: d.exercises
          .map((e) => ({
            ...e,
            sets: e.sets.trim() === "" ? DEFAULT_TEMPLATE_SETS : Number(e.sets),
            reps: e.reps.trim() || undefined,
          }))
          .filter((e) => Number.isFinite(e.sets) && e.sets > 0),
      }));
    if (days.length === 0) {
      alert("Add at least one day", "Give your split at least one named day.", [
        { text: "OK" },
      ]);
      return;
    }
    const template = createCustomSplitTemplate(newSplitName, days);
    await applyTemplate(template, mode, newSplitName.trim());
    resetCreateSplitForm();
  };

  const confirmReplaceProgram = (run: () => Promise<void>) => {
    if (!workoutData?.days?.length) {
      void run();
      return;
    }
    alert(
      "Replace your program?",
      "Starting a new program replaces your current program and every split in it. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Replace",
          style: "destructive",
          onPress: () => void run(),
        },
      ],
      "warning",
    );
  };

  const insertTemplateDays = async (
    template: SplitTemplate,
    program: NonNullable<typeof workoutData>,
    splitName?: string,
  ) => {
    let workoutToInsert = program;
    const existingSplits = program.split ?? [];
    const isNewSplit =
      Boolean(splitName) && !existingSplits.includes(splitName!);

    if (isNewSplit) {
      const days = (program.days ?? []).map((d) => ({
        ...d,
        split: {
          ...d.split,
          [splitName!]: { exercises: [], totalSets: 0 },
        },
      }));
      workoutToInsert = {
        ...program,
        split: [...existingSplits, splitName!],
        days,
        totalDays: days.length,
      };
    }

    const currentSplits =
      selectedSplit && existingSplits.includes(selectedSplit)
        ? [selectedSplit]
        : existingSplits;
    const targetSplits = isNewSplit ? [splitName!] : currentSplits;

    const updated = insertTemplateIntoProgram(
      workoutToInsert,
      template,
      targetSplits,
    );
    await saveWorkoutData(updated);
    if (isNewSplit) await saveSelectedSplit(splitName!);
    const synced = await syncProgram("insert_days", updated, userId ?? null);
    alert(
      synced ? "Inserted!" : "Inserted on this device",
      `Added ${template.days.length} day(s) from "${template.name}" to your current program.${synced ? "" : OFFLINE_SAVE_NOTE}`,
      [{ text: "OK" }],
      synced ? "success" : "info",
    );
  };

  const applyTemplate = async (
    template: SplitTemplate,
    mode: "new" | "insert",
    splitName?: string,
  ) => {
    setIsApplyingTemplate(true);
    try {
      if (mode === "insert" && workoutData) {
        await insertTemplateDays(template, workoutData, splitName);
      } else {
        const splitNames = splitName ? [splitName] : [selectedSplit ?? "Me"];
        const fresh = buildProgramFromTemplate(template, splitNames);
        await saveWorkoutData(fresh);
        await saveSelectedSplit(splitNames[0]);
        const synced = await syncProgram("new_split", fresh, userId ?? null);
        alert(
          synced ? "Split created!" : "Split created on this device",
          `"${template.name}" is now your active program. Add exercises via the day editor.${synced ? "" : OFFLINE_SAVE_NOTE}`,
          [{ text: "OK" }],
          synced ? "success" : "info",
        );
      }
    } catch (error) {
      alert(
        "Couldn't apply the split",
        userFacingError(error, "Something went wrong. Please try again."),
        [{ text: "OK" }],
      );
    } finally {
      setIsApplyingTemplate(false);
    }
  };

  const handlePickDefaultSplit = (template: SplitTemplate) => {
    if (!workoutData) {
      applyTemplate(template, "new");
      return;
    }
    alert(
      `Use "${template.name}"`,
      "Start a brand new program with this split, or insert its days into your current program?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Insert into current",
          onPress: () => applyTemplate(template, "insert"),
        },
        {
          text: "Start new program",
          onPress: () =>
            confirmReplaceProgram(() => applyTemplate(template, "new")),
        },
      ],
    );
  };

  const runExport = async (write: () => Promise<ExportResult | null>) => {
    setIsExporting(true);
    try {
      const saved = await write();
      if (saved) {
        alert(
          saved.destination === "device" ? "Saved on this device" : "Exported",
          `${saved.fileName}\n${DESTINATION_TEXT[saved.destination]}`,
          [{ text: "OK" }],
          "success",
        );
      } else {
        alert("Nothing to export", "Load a program first.", [{ text: "OK" }]);
      }
    } catch (error) {
      alert(
        "Couldn't export your program",
        `${userFacingError(error, "Something went wrong.")}

Your program is untouched. Try again, or pick a different destination.`,
        [{ text: "OK" }],
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportProgram = () => {
    if (!workoutData) return;
    alert(
      "Export program",
      "A spreadsheet lays out every day with weekly sets per muscle graded against a target you choose. A backup file can be restored into OwnGains.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Backup (.json)",
          onPress: () =>
            runExport(() => exportProgramData(workoutData, selectedSplit)),
        },
        {
          text: "Spreadsheet (.xlsx)",
          onPress: () => setIsChoosingTargets(true),
        },
      ],
    );
  };

  const parsedTargetRange = (): TargetRange | null => {
    const toNumber = (text: string) =>
      text.trim() ? Number(text.trim().replace(",", ".")) : Number.NaN;
    const min = toNumber(targetMinText);
    const max = toNumber(targetMaxText);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    if (min < 0 || max <= 0 || min > max) return null;
    return { min, max };
  };

  const handleExportSpreadsheet = async () => {
    const range = parsedTargetRange();
    if (!range) return;
    setIsChoosingTargets(false);
    await runExport(() => exportProgramSpreadsheet(workoutData, range));
  };

  const getSplitWorkoutSummary = (split: string) => {
    if (!workoutData?.days) return null;
    let totalSets = 0;
    let totalDays = 0;
    workoutData.days.forEach((day: WorkoutDay) => {
      const splitWorkout = day.split?.[split];
      if ((splitWorkout?.exercises?.length ?? 0) > 0) {
        totalDays++;
        totalSets += splitWorkout?.totalSets || 0;
      }
    });
    return { totalSets, totalDays };
  };

  const toggleAllDays = (dayIdxs: readonly number[]) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setHiddenDays((prev) =>
      dayIdxs.every((i) => prev.has(i)) ? new Set() : new Set(dayIdxs),
    );
  };

  const toggleDayHidden = (dayIdx: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setHiddenDays((prev) => {
      const next = new Set(prev);
      if (next.has(dayIdx)) next.delete(dayIdx);
      else next.add(dayIdx);
      return next;
    });
  };

  const wd = workoutData as unknown as {
    split?: string[];
    totalDays?: number;
    days?: WdDay[];
  } | null;

  const programSplits: string[] = wd?.split ?? [];
  const allOptions = ["All", ...programSplits];

  const dayTitleSuggestions = useMemo(
    () =>
      Array.from(
        new Set([
          ...DEFAULT_SPLITS.flatMap((t) => t.days.map((d) => d.dayTitle)),
          ...(wd?.days ?? []).map((d) => d.dayTitle ?? ""),
        ]),
      ).filter(Boolean),
    [wd],
  );

  const handleInsertSplit = () => handleCreateSplit("insert");

  const handleCreateNewSplit = (): void => {
    if (!workoutData || !newSplitName.trim()) {
      void handleCreateSplit("new");
      return;
    }
    alert(
      "Replace your program?",
      `Starting "${newSplitName.trim()}" as a new program replaces your current program and every split in it. This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Replace",
          style: "destructive",
          onPress: () => void handleCreateSplit("new"),
        },
      ],
      "warning",
    );
  };

  const handleEditSplitPress = (): void => {
    const target =
      selectedProgram ?? (programSplits.length === 1 ? programSplits[0] : null);
    if (target) {
      openEditSplit(target);
      return;
    }
    if (programSplits.length === 0) return;
    alert("Edit which split?", "Pick the split you want to edit.", [
      ...programSplits.map((split) => ({
        text: split,
        onPress: () => openEditSplit(split),
      })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  // The editor sheet is rendered at screen level, not here: "Edit <split>" in
  // the Program widget opens it too, and would do nothing if the sheet
  // unmounted along with this widget.
  const renderBuildPlanWidget = (): React.ReactNode => (
    <View>
      <View style={styles.buildRow}>
        <TouchableOpacity
          style={[styles.buildTile, styles.buildTilePrimary]}
          onPress={openCreateSplit}
          accessibilityRole='button'
          accessibilityLabel='Create a new split'
        >
          <Text style={[styles.buildTileGlyph, styles.onAccent]}>＋</Text>
          <Text style={[styles.buildTileLabel, styles.onAccent]}>New split</Text>
          <Text style={[styles.buildTileHint, styles.onAccentQuiet]}>
            Name it, add days
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.buildTile}
          onPress={handleUploadFile}
          disabled={isUploading}
          accessibilityRole='button'
          accessibilityLabel='Import a workout from a spreadsheet file'
          ref={tutorialAnchor("plan.import")}
          accessibilityState={{ disabled: isUploading, busy: isUploading }}
        >
          {isUploading ? (
            <ActivityIndicator color={colors.accent} size='small' />
          ) : (
            <>
              <Text style={styles.buildTileGlyph}>📁</Text>
              <Text style={styles.buildTileLabel}>Import file</Text>
              <Text style={styles.buildTileHint}>.ods, .xlsx, .xls</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.railHeading}>Ready-made templates</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.templateRail}
      >
        {DEFAULT_SPLITS.map((template) => {
          const handlePress = () => handlePickDefaultSplit(template);
          const dayCount = `${template.days.length} day${template.days.length === 1 ? "" : "s"}`;
          const isActive = template.id === activeTemplateId;
          return (
            <TouchableOpacity
              key={template.id}
              style={[styles.templateCard, isActive && styles.templateCardActive]}
              onPress={handlePress}
              disabled={isApplyingTemplate}
              accessibilityRole='button'
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`Use the ${template.name} split, ${dayCount}${isActive ? ", in use" : ""}`}
            >
              <View style={styles.templateCardTop}>
                <Text
                  style={[
                    styles.templateCardTitle,
                    isActive && styles.templateCardTitleActive,
                  ]}
                  numberOfLines={1}
                >
                  {template.name}
                </Text>
                <Text style={styles.templateCardCount}>{dayCount}</Text>
              </View>
              <Text style={styles.templateCardMeta} numberOfLines={3}>
                {template.description}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  const renderSelectSplitWidget = (): React.ReactNode => {
    if (!workoutData?.split?.length) {
      return (
        <Text style={styles.widgetLineMuted}>
          No splits yet. Build one above, or import a spreadsheet.
        </Text>
      );
    }
    const dayTotal = workoutData.totalDays ?? workoutData.days?.length ?? 0;
    return (
      <View>
        {workoutData.split.map((split: string) => {
          const summary = getSplitWorkoutSummary(split);
          const isSelected = selectedSplit === split;
          const handleSelect = () =>
            saveSelectedSplit(split).catch(warnSaveFailed);
          const summaryLabel = summary
            ? `, ${summary.totalDays} workout days, ${summary.totalSets} total sets`
            : "";
          return (
            <TouchableOpacity
              key={split}
              style={[styles.splitRow, isSelected && styles.splitRowSelected]}
              onPress={handleSelect}
              accessibilityRole='button'
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`Train the ${split} split${summaryLabel}`}
            >
              <View
                style={[styles.splitRail, isSelected && styles.splitRailActive]}
              />
              <View style={styles.splitRowMain}>
                <Text
                  style={[
                    styles.splitName,
                    isSelected && styles.splitNameSelected,
                  ]}
                  numberOfLines={1}
                >
                  {split}
                </Text>
                <Text style={styles.splitMeta}>
                  {summary
                    ? `${summary.totalDays} training days`
                    : "No days yet"}
                </Text>
              </View>
              {summary && (
                <View style={styles.splitFigure}>
                  <Text
                    style={[
                      styles.splitFigureValue,
                      isSelected && styles.splitNameSelected,
                    ]}
                  >
                    {summary.totalSets}
                  </Text>
                  <Text style={styles.splitFigureUnit}>sets</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        <View style={styles.splitFooter}>
          <Text style={styles.splitMeta}>
            {dayTotal} {dayTotal === 1 ? "day" : "days"} in this program
          </Text>
          {unresolvedMatches.length === 0 && (
            <TouchableOpacity
              onPress={handleRecheckMatches}
              hitSlop={8}
              accessibilityRole='button'
              accessibilityLabel='Re-check exercise matches'
            >
              <Text style={styles.linkAction}>Re-match</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={handleExportProgram}
            disabled={isExporting}
            hitSlop={8}
            accessibilityRole='button'
            accessibilityLabel='Export program as a spreadsheet or backup file'
            ref={tutorialAnchor("plan.export")}
            accessibilityState={{ disabled: isExporting, busy: isExporting }}
          >
            {isExporting ? (
              <ActivityIndicator color={colors.accent} size='small' />
            ) : (
              <Text style={styles.linkAction}>Export</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const activeTemplateId = useMemo(
    () =>
      findActiveTemplateId(
        workoutData,
        selectedSplit ?? workoutData?.split?.[0],
      ),
    [workoutData, selectedSplit],
  );
  const zeroRepWarnings = useMemo(
    () => zeroRepExercises(workoutData, selectedSplit),
    [workoutData, selectedSplit],
  );

  const muscleFrequencyRows = useMemo(
    () => muscleFrequency(workoutData, selectedSplit),
    [workoutData, selectedSplit],
  );

  const renderMuscleFrequencyWidget = (): React.ReactNode => {
    if (muscleFrequencyRows.length === 0) {
      return (
        <Text style={styles.widgetLineMuted}>
          Pick a split to see how much work each muscle gets in a week.
        </Text>
      );
    }
    const peak = Math.max(...muscleFrequencyRows.map((r) => r.setsPerWeek), 0);
    return (
      <View>
        {muscleFrequencyRows.map((row) => (
          <View key={row.muscle} style={styles.freqRow}>
            <Text style={styles.freqLabel} numberOfLines={1}>
              {row.muscle}
            </Text>
            <View style={styles.freqTrack}>
              <View
                style={[
                  styles.freqFill,
                  { width: peak > 0 ? `${(row.setsPerWeek / peak) * 100}%` : 0 },
                ]}
              />
            </View>
            <Text style={styles.freqValue}>{row.setsPerWeek}</Text>
          </View>
        ))}
        <Text style={styles.widgetLineMuted}>
          Sets per week. A primary muscle counts 1, a secondary one 0.5.
        </Text>
      </View>
    );
  };

  const renderViewProgramWidget = (): React.ReactNode => {
    if (!workoutData || !wd?.days || wd.days.length === 0) {
      return (
        <Text style={styles.widgetLineMuted}>
          Create a split or import a workout to see your program here.
        </Text>
      );
    }
    const visibleDays = visibleDaysForSplit(wd.days, selectedProgram);
    const dayIndices = visibleDays.map((d) => d.dayIdx);
    const allCollapsed =
      dayIndices.length > 0 && dayIndices.every((i) => hiddenDays.has(i));

    return (
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterSelectorScroll}
          style={styles.filterSelectorContainer}
        >
          {allOptions.map((option) => {
            const isActive =
              selectedProgram === option ||
              (option === "All" && !selectedProgram);
            const handleSelectOption = () =>
              setSelectedProgram(option === "All" ? null : option);
            return (
              <TouchableOpacity
                key={option}
                style={[styles.filterPill, isActive && styles.filterPillActive]}
                onPress={handleSelectOption}
                accessibilityRole='button'
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={
                  option === "All"
                    ? "Show every split"
                    : `Show only the ${option} split`
                }
              >
                <Text
                  style={[
                    styles.filterPillText,
                    isActive && styles.filterPillTextActive,
                  ]}
                >
                  {option}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.toolbar}>
          {programSplits.length > 0 && (
            <TouchableOpacity
              style={styles.toolbarBtn}
              onPress={handleEditSplitPress}
              accessibilityRole='button'
              accessibilityLabel={
                selectedProgram
                  ? `Edit the ${selectedProgram} split`
                  : "Edit a split"
              }
            >
              <Text style={styles.toolbarBtnText}>
                {`Edit ${selectedProgram ?? "split"}`}
              </Text>
            </TouchableOpacity>
          )}

          {dayIndices.length > 1 && (
            <TouchableOpacity
              style={styles.toolbarBtn}
              onPress={() => toggleAllDays(dayIndices)}
              accessibilityRole='button'
              accessibilityLabel={
                allCollapsed ? "Expand every day" : "Collapse every day"
              }
            >
              <Text style={styles.toolbarBtnText}>
                {allCollapsed ? "Expand all" : "Collapse all"}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {visibleDays
          .slice(0, visibleDayCount)
          .map(({ day, dayIdx, displayNumber }) => (
            <ProgramDayCard
              key={`${dayIdx}-${day.dayNumber ?? "x"}`}
              day={day}
              dayIdx={dayIdx}
              displayNumber={displayNumber}
              selectedProgram={selectedProgram}
              isHidden={hiddenDays.has(dayIdx)}
              styles={styles}
              onToggleHidden={toggleDayHidden}
            />
          ))}

        {visibleDays.length > visibleDayCount && (
          <TouchableOpacity
            style={styles.showMoreBtn}
            onPress={() =>
              setVisibleDayCount((prev) => prev + INITIAL_DAYS_SHOWN)
            }
            accessibilityRole='button'
            accessibilityLabel={`Show more days, ${visibleDays.length - visibleDayCount} left`}
          >
            <Text style={styles.showMoreBtnText}>
              Show more days ({visibleDays.length - visibleDayCount} left)
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const WIDGET_RENDERERS: Record<PlanWidgetType, () => React.ReactNode> = {
    build_plan: renderBuildPlanWidget,
    select_split: renderSelectSplitWidget,
    muscle_frequency: renderMuscleFrequencyWidget,
    view_program: renderViewProgramWidget,
  };

  const renderWidgetContent = (
    instance: WidgetInstance<PlanWidgetType>,
  ): React.ReactNode => {
    const renderer = WIDGET_RENDERERS[instance.type];
    if (renderer) return renderer();
    return <Text style={styles.widgetLineMuted}>Coming soon</Text>;
  };

  const programDayTotal = wd?.totalDays ?? wd?.days?.length ?? 0;
  const dayWord = programDayTotal === 1 ? "day" : "days";
  let headerSubtitle =
    "Start from a template, build your own, or import a spreadsheet.";
  if (workoutData)
    headerSubtitle = selectedSplit
      ? `Training ${selectedSplit}: ${programDayTotal} ${dayWord}`
      : `${programDayTotal} ${dayWord} ready. Pick a split to train.`;

  let splitSubmitLabel = "Create split";
  if (editingSplitName) splitSubmitLabel = "Save changes";
  else if (workoutData) splitSubmitLabel = "Start as new program";

  return (
    <SafeAreaView
      style={embedWidget ? undefined : { flex: 1 }}
      edges={embedWidget ? [] : ["top"]}
      {...(embedWidget ? {} : widgetBoard.panHandlers)}
    >
      {embedWidget && renderWidgetContent(embedInstance(embedWidget))}
      {!embedWidget && (
        <>
          {widgetBoard.isPulling && (
            <WidgetPullHint armed={widgetBoard.pullArmed} />
          )}
          <ScrollView
            style={styles.container}
            scrollEnabled={!widgetBoard.isPulling}
            keyboardShouldPersistTaps='handled'
          >
            <View style={styles.content}>
              <View style={styles.header}>
                <Text style={styles.title}>Plan</Text>
                <Text style={styles.subtitle}>{headerSubtitle}</Text>
              </View>

              {widgetsLoaded && widgets.length > 0 && (
                <WidgetEditHeader
                  editMode={widgetBoard.editMode}
                  onDone={() => widgetBoard.setEditMode(false)}
                />
              )}

              {unresolvedMatches.length > 0 && !showMatchReview && (
                <View style={styles.matchBanner}>
                  <TouchableOpacity
                    accessibilityRole='button'
                    accessibilityLabel={`Review ${unresolvedMatches.length} unmatched exercises`}
                    onPress={() => setShowMatchReview(true)}
                  >
                    <Text style={styles.matchBannerText}>
                      Review {unresolvedMatches.length} unmatched exercise
                      {unresolvedMatches.length === 1 ? "" : "s"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole='button'
                    accessibilityLabel='Dismiss unmatched exercises notice'
                    onPress={handleDismissMatches}
                    hitSlop={8}
                  >
                    <Text style={styles.matchBannerDismiss}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}

              {contentReady ? (
                <WidgetsPanel
                  widgets={widgets}
                  editMode={widgetBoard.editMode}
                  onCycleSize={cycleWidgetSize}
                  onRemove={removeWidget}
                  onReorder={reorderWidgets}
                  renderContent={renderWidgetContent}
                  registry={PLAN_WIDGET_REGISTRY}
                />
              ) : (
                <ActivityIndicator
                  color={colors.accent}
                  style={{ marginTop: 20 }}
                />
              )}

              {contentReady && widgetsLoaded && widgets.length > 0 && (
                <WidgetEditButton onPress={widgetBoard.openGallery} />
              )}

              {zeroRepWarnings.length > 0 && (
                <View style={styles.warnBanner}>
                  <Text style={styles.warnBannerText}>
                    No reps set for {zeroRepWarnings.length} exercise
                    {zeroRepWarnings.length === 1 ? "" : "s"}. Edit the split to
                    give them a rep target.
                  </Text>
                  {zeroRepWarnings.slice(0, 5).map((e) => (
                    <Text
                      key={`${e.day}-${e.name}`}
                      style={styles.warnBannerText}
                    >
                      {`• ${e.name} (${e.day})`}
                    </Text>
                  ))}
                  {zeroRepWarnings.length > 5 && (
                    <Text style={styles.warnBannerText}>
                      {`• and ${zeroRepWarnings.length - 5} more`}
                    </Text>
                  )}
                </View>
              )}
            </View>
          </ScrollView>
        </>
      )}
      {AlertComponent}
      <ModalSheet
        visible={isCreatingSplit}
        onClose={confirmDiscardDraft}
        title={editingSplitName ? `Edit ${editingSplitName}` : "Create a split"}
        showCancelButton={false}
        showConfirmButton={false}
        scrollable
        fullHeight
      >
        {!editingSplitName && (
          <>
            <Text style={styles.editFieldLabel}>Split name</Text>
            <TextInput
              style={styles.editInput}
              value={newSplitName}
              onChangeText={setNewSplitName}
              placeholder='e.g. My Custom Split'
              placeholderTextColor={colors.textMuted}
            />
          </>
        )}

        {draftSplitDays.map((day, idx) => (
          <SplitDayRow
            key={day.id}
            index={idx}
            day={day}
            canRemove={draftSplitDays.length > 1}
            isExpanded={expandedSplitDayIdx === idx}
            titleSuggestions={dayTitleSuggestions}
            colors={colors}
            styles={styles}
            onToggleExpand={toggleSplitDayExpanded}
            onChangeTitle={updateDraftSplitDayTitle}
            onAddExercise={addDraftSplitExercise}
            onChangeExerciseSets={updateDraftSplitExerciseSets}
            onChangeExerciseReps={updateDraftSplitExerciseReps}
            onRemoveExercise={removeDraftSplitExercise}
            onRemove={removeDraftSplitDay}
          />
        ))}

        <TouchableOpacity
          style={styles.addExerciseBtn}
          onPress={addDraftSplitDay}
          accessibilityRole='button'
          accessibilityLabel='Add another day to this split'
        >
          <Text style={styles.addExerciseBtnText}>+ Add day</Text>
        </TouchableOpacity>

        <View style={styles.editActions}>
          <TouchableOpacity
            style={styles.cancelBtn}
            disabled={isApplyingTemplate}
            accessibilityRole='button'
            accessibilityLabel='Cancel and discard this split'
            onPress={confirmDiscardDraft}
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
          {!editingSplitName && workoutData && (
            <TouchableOpacity
              style={styles.insertBtn}
              disabled={isApplyingTemplate}
              onPress={handleInsertSplit}
              accessibilityRole='button'
              accessibilityLabel='Insert these days into your current program'
            >
              <Text style={styles.insertBtnText}>Insert into current</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.submitBtn, isApplyingTemplate && { opacity: 0.6 }]}
            disabled={isApplyingTemplate}
            accessibilityRole='button'
            accessibilityLabel={splitSubmitLabel}
            onPress={
              editingSplitName ? handleSaveSplitEdits : handleCreateNewSplit
            }
          >
            {isApplyingTemplate ? (
              <ActivityIndicator color={colors.textOnAccent} size='small' />
            ) : (
              <Text style={styles.submitBtnText}>{splitSubmitLabel}</Text>
            )}
          </TouchableOpacity>
        </View>
      </ModalSheet>

      <ModalSheet
        visible={isChoosingTargets}
        onClose={() => setIsChoosingTargets(false)}
        title='Export spreadsheet'
        subtitle='Weekly sets per muscle you aim for. Each muscle is graded against this range, and you can still change it (or give one muscle its own) inside the spreadsheet.'
        confirmText='Export'
        onConfirm={handleExportSpreadsheet}
        confirmDisabled={!parsedTargetRange()}
      >
        <View style={styles.targetRangeRow}>
          <View style={styles.targetRangeField}>
            <Text style={styles.editFieldLabel}>Target min</Text>
            <TextInput
              style={styles.editInput}
              value={targetMinText}
              onChangeText={setTargetMinText}
              keyboardType='decimal-pad'
              accessibilityLabel='Minimum weekly sets per muscle'
            />
          </View>
          <View style={styles.targetRangeField}>
            <Text style={styles.editFieldLabel}>Target max</Text>
            <TextInput
              style={styles.editInput}
              value={targetMaxText}
              onChangeText={setTargetMaxText}
              keyboardType='decimal-pad'
              accessibilityLabel='Maximum weekly sets per muscle'
            />
          </View>
        </View>
        {!parsedTargetRange() && (
          <Text style={styles.editFieldHint}>
            Enter both numbers, with the minimum no higher than the maximum.
          </Text>
        )}
      </ModalSheet>

      <SplitColumnPicker
        visible={showColumnPicker}
        fileName={pendingImportName}
        candidates={columnCandidates}
        selectedIndices={selectedColumnIndices}
        onToggle={toggleColumnSelection}
        onSelectAll={selectAllColumns}
        onSelectNone={selectNoneColumns}
        onCancel={resetColumnPicker}
        onConfirm={handleConfirmColumnImport}
        isImporting={isImportingColumns}
        colors={colors}
      />

      <MatchReviewModal
        visible={showMatchReview}
        unresolved={unresolvedMatches}
        onResolve={handleResolveMatch}
        canUndo={canUndoMatch}
        onUndo={() => void handleUndoMatch()}
        onClose={() => setShowMatchReview(false)}
      />

      {!embedWidget && (
        <WidgetGallery
          visible={widgetBoard.galleryVisible}
          onClose={widgetBoard.closeGallery}
          availableWidgets={availableToAdd}
          onAddWidget={widgetBoard.add}
          hasPlacedWidgets={widgets.length > 0}
          onEditWidgets={widgetBoard.editWidgets}
        />
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: 14, paddingTop: 18, paddingBottom: 120 },
    header: { marginBottom: 18 },
    title: {
      fontSize: 30,
      fontWeight: "800",
      letterSpacing: -0.6,
      color: colors.textPrimary,
    },
    subtitle: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.textSecondary,
      marginTop: 4,
    },
    widgetLineMuted: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 6,
      lineHeight: 17,
    },
    linkAction: { fontSize: 13, fontWeight: "700", color: colors.accent },

    buildRow: { flexDirection: "row", gap: 10 },
    buildTile: {
      flex: 1,
      minHeight: 104,
      justifyContent: "center",
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 16,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    buildTilePrimary: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    onAccent: { color: colors.textOnAccent },
    onAccentQuiet: { color: colors.textOnAccent, opacity: 0.8 },
    buildTileGlyph: {
      fontSize: 22,
      lineHeight: 26,
      color: colors.accent,
      marginBottom: 6,
    },
    buildTileLabel: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
    buildTileHint: { fontSize: 12, color: colors.textMuted, marginTop: 2 },

    railHeading: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textSecondary,
      marginTop: 16,
      marginBottom: 8,
    },
    templateRail: { gap: 10, paddingRight: 4, paddingVertical: 2 },
    templateCard: {
      width: 196,
      backgroundColor: colors.background,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      padding: 12,
    },
    templateCardActive: {
      backgroundColor: colors.infoLight,
      borderColor: colors.info,
      borderWidth: 2,
      padding: 11,
    },
    templateCardTitleActive: { color: colors.info },
    templateCardTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      marginBottom: 6,
    },
    templateCardTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.textPrimary,
      flexShrink: 1,
    },
    templateCardCount: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.accent,
      backgroundColor: colors.accentLight,
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 999,
      overflow: "hidden",
    },
    templateCardMeta: { fontSize: 12, lineHeight: 17, color: colors.textMuted },

    splitRow: {
      flexDirection: "row",
      alignItems: "stretch",
      backgroundColor: colors.background,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      marginBottom: 8,
      overflow: "hidden",
    },
    splitRowSelected: {
      backgroundColor: colors.accentLight,
      borderColor: colors.accent,
    },
    splitRail: { width: 4, backgroundColor: "transparent" },
    splitRailActive: { backgroundColor: colors.accent },
    splitRowMain: { flex: 1, paddingVertical: 12, paddingLeft: 12 },
    splitName: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
    splitNameSelected: { color: colors.accent },
    splitMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    splitFigure: {
      alignItems: "flex-end",
      justifyContent: "center",
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    splitFigureValue: {
      fontSize: 20,
      fontWeight: "800",
      lineHeight: 23,
      color: colors.textPrimary,
    },
    splitFigureUnit: { fontSize: 11, color: colors.textMuted },
    splitFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      marginTop: 4,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.separator,
    },

    freqRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 8,
    },
    freqLabel: { width: 78, fontSize: 13, color: colors.textSecondary },
    freqTrack: {
      flex: 1,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.separator,
      overflow: "hidden",
    },
    freqFill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
    freqValue: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.textPrimary,
      minWidth: 30,
      textAlign: "right",
    },

    matchBanner: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.warningLight,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 12,
      borderLeftWidth: 3,
      borderLeftColor: colors.warning,
    },
    matchBannerText: {
      flex: 1,
      fontSize: 14,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    matchBannerDismiss: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.textMuted,
    },
    warnBanner: {
      backgroundColor: colors.warningLight,
      borderRadius: 12,
      padding: 14,
      borderLeftWidth: 3,
      borderLeftColor: colors.warning,
    },
    warnBannerText: {
      fontSize: 13,
      lineHeight: 19,
      color: colors.textPrimary,
    },

    filterSelectorContainer: { marginBottom: 12 },
    filterSelectorScroll: { gap: 8, paddingVertical: 2, paddingRight: 4 },
    filterPill: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      justifyContent: "center",
    },
    filterPillActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    filterPillText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    filterPillTextActive: { color: colors.textOnAccent },

    toolbar: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 12,
    },
    toolbarBtn: {
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 10,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    toolbarBtnText: { fontSize: 13, fontWeight: "600", color: colors.accent },
    showMoreBtn: {
      alignItems: "center",
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: colors.surfaceBorder,
      marginTop: 4,
    },
    showMoreBtnText: { fontSize: 13, fontWeight: "600", color: colors.accent },

    programDayCard: {
      backgroundColor: colors.background,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 10,
    },
    programDayHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 6,
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.separator,
    },
    programDayNumber: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.accent,
      backgroundColor: colors.accentLight,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      overflow: "hidden",
    },
    programDayTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.textPrimary,
      flex: 1,
    },
    iconBtn: { padding: 4 },
    iconBtnText: { fontSize: 18 },
    chevron: { fontSize: 16, lineHeight: 18, color: colors.textMuted },
    programExerciseRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 9,
      borderBottomWidth: 1,
      borderBottomColor: colors.separator,
    },
    programExerciseLeft: { flex: 1, marginRight: 12 },
    programExerciseName: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    programExerciseSets: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
    emptyDayText: {
      fontSize: 13,
      color: colors.textMuted,
      paddingVertical: 10,
    },
    programSetsRow: { flexDirection: "row", gap: 6 },
    programSetsBadge: {
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 5,
      minWidth: 46,
    },
    programSetsBadgeText: {
      fontSize: 15,
      fontWeight: "800",
      color: colors.textPrimary,
      lineHeight: 18,
    },
    programSetsBadgeLabel: {
      fontSize: 10,
      fontWeight: "600",
      color: colors.textMuted,
    },

    removeExerciseBtnText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.error,
    },
    splitDayBlock: {
      borderWidth: 1,
      borderColor: colors.separator,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingBottom: 10,
      marginTop: 12,
      backgroundColor: colors.background,
    },
    splitDayHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 12,
    },
    splitDayHeaderTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.textPrimary,
      flex: 1,
    },
    splitDayHeaderMeta: { fontSize: 12, color: colors.textMuted },
    editFieldLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.textSecondary,
      marginBottom: 4,
      marginTop: 10,
    },
    editFieldHint: { fontSize: 11, color: colors.textMuted, marginBottom: 6 },
    targetRangeRow: { flexDirection: "row", gap: 12, marginBottom: 8 },
    targetRangeField: { flex: 1 },
    editInput: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.textPrimary,
    },
    editSetInput: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 16,
      fontWeight: "700",
      color: colors.accent,
      textAlign: "center",
      width: 64,
    },
    addExerciseBtn: {
      borderWidth: 1,
      borderColor: colors.accent,
      borderStyle: "dashed",
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: "center",
      marginTop: 6,
      marginBottom: 4,
    },
    addExerciseBtnText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.accent,
    },
    editActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginTop: 16,
      justifyContent: "flex-end",
    },
    cancelBtn: {
      borderRadius: 10,
      paddingHorizontal: 18,
      paddingVertical: 11,
      backgroundColor: colors.separator,
    },
    cancelBtnText: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    insertBtn: {
      borderRadius: 10,
      paddingHorizontal: 18,
      paddingVertical: 11,
      borderWidth: 1.5,
      borderColor: colors.accent,
    },
    insertBtnText: { fontSize: 15, fontWeight: "600", color: colors.accent },
    submitBtn: {
      borderRadius: 10,
      paddingHorizontal: 20,
      paddingVertical: 11,
      backgroundColor: colors.accent,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    submitBtnText: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.textOnAccent,
    },
  });
