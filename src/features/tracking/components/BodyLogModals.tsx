import React, { useEffect, useEffectEvent, useState } from "react";
import { Switch, Text, TextInput, View } from "react-native";
import { useTheme } from "@shared/context/ThemeContext";
import ModalSheet from "@shared/components/ModalSheet";
import { useAlert } from "@shared/components/CustomAlert";
import type { TrackingStyles } from "../styles";
import type { SavedMacroFood } from "../types";
import type { HeightInput } from "../hooks/useWeightTab";
import type { MacrosEntryInput, MacrosGoalInput } from "../hooks/useMacrosTab";
import type { BodyFatInput } from "../hooks/useBodyFatTab";
import type {
  MeasurementInput,
  MeasurementLogResult,
} from "../hooks/useMeasurementsTab";
import { isValidTime, maskTimeInput, toFeetInches } from "../utils";
import { Chip, ErrorMarginStepper, space } from "../ui";

interface SheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly styles: TrackingStyles;
}

export function WeightLogModal({
  visible,
  onClose,
  onSave,
  weightUnit,
  styles,
}: SheetProps & {
  readonly onSave: (value: string) => Promise<boolean>;
  readonly weightUnit: string;
}) {
  const { colors } = useTheme();
  const [value, setValue] = useState("");
  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Log Weight"
      onConfirm={async () => {
        if (await onSave(value)) setValue("");
      }}
    >
      <TextInput
        style={styles.input}
        placeholder={`Enter weight (${weightUnit})`}
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
        value={value}
        onChangeText={setValue}
      />
    </ModalSheet>
  );
}

const EMPTY_HEIGHT: HeightInput = { cm: "", ft: "", in: "" };

function heightFields(heightCm: number | undefined, unit: string): HeightInput {
  if (!heightCm) return EMPTY_HEIGHT;
  if (unit === "cm") return { ...EMPTY_HEIGHT, cm: heightCm.toFixed(1) };
  const { feet, inches } = toFeetInches(heightCm);
  return { cm: "", ft: String(feet), in: String(inches) };
}

export function HeightModal({
  visible,
  onClose,
  onSave,
  currentHeightCm,
  heightUnit,
  setHeightUnit,
  styles,
}: SheetProps & {
  readonly onSave: (input: HeightInput) => Promise<boolean>;
  readonly currentHeightCm: number | undefined;
  readonly heightUnit: string;
  readonly setHeightUnit: (unit: string) => void;
}) {
  const { colors } = useTheme();
  const [input, setInput] = useState<HeightInput>(EMPTY_HEIGHT);

  const seedFromCurrentHeight = useEffectEvent(() =>
    setInput(heightFields(currentHeightCm, heightUnit)),
  );
  useEffect(() => {
    if (visible) seedFromCurrentHeight();
  }, [visible]);

  const field = (key: keyof HeightInput) => (text: string) =>
    setInput((prev) => ({ ...prev, [key]: text }));

  return (
    <ModalSheet
      visible={visible}
      onClose={() => {
        onClose();
        setInput(EMPTY_HEIGHT);
      }}
      title="Set Height"
      onConfirm={async () => {
        if (await onSave(input)) setInput(EMPTY_HEIGHT);
      }}
      confirmText="Save"
      scrollable={false}
    >
      <Text style={styles.inputLabel}>Unit</Text>
      <View style={{ flexDirection: "row", gap: space.sm, marginBottom: space.sm }}>
        {["cm", "ft"].map((u: string) => (
          <Chip
            key={u}
            label={u}
            selected={heightUnit === u}
            onPress={() => {
              setHeightUnit(u);
              setInput(EMPTY_HEIGHT);
            }}
          />
        ))}
      </View>
      {heightUnit === "cm" ? (
        <>
          <Text style={styles.inputLabel}>Height (cm)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 175"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            value={input.cm}
            onChangeText={field("cm")}
          />
        </>
      ) : (
        <>
          <Text style={styles.inputLabel}>Feet</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 5"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            value={input.ft}
            onChangeText={field("ft")}
          />
          <Text style={styles.inputLabel}>Inches</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 10"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            value={input.in}
            onChangeText={field("in")}
          />
        </>
      )}
    </ModalSheet>
  );
}

const freshMacrosEntry = (): MacrosEntryInput => ({
  name: "",
  calories: "",
  protein: "",
  carbs: "",
  fat: "",
  time: new Date().toTimeString().slice(0, 5),
  errorMargin: "5",
  remember: false,
});

export function MacrosLogModal({
  visible,
  onClose,
  onSave,
  savedFoods,
  quickLogSavedFood,
  removeSavedFood,
  styles,
}: SheetProps & {
  readonly onSave: (form: MacrosEntryInput) => Promise<boolean>;
  readonly savedFoods: SavedMacroFood[];
  readonly quickLogSavedFood: (food: SavedMacroFood) => void;
  readonly removeSavedFood: (id: string) => void;
}) {
  const { colors } = useTheme();
  const { alert, AlertComponent } = useAlert();
  const [form, setForm] = useState<MacrosEntryInput>(freshMacrosEntry);
  const field =
    <K extends keyof MacrosEntryInput>(key: K) =>
    (value: MacrosEntryInput[K]) =>
      setForm((prev) => ({ ...prev, [key]: value }));
  const calories = Number.parseFloat(form.calories);
  const protein = Number.parseFloat(form.protein);

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Log Macros"
      onConfirm={async () => {
        if (await onSave(form)) setForm(freshMacrosEntry());
      }}
      scrollable={true}
    >
      {savedFoods.length > 0 && (
        <>
          <Text style={styles.inputLabel}>Quick Log</Text>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: space.sm,
              marginBottom: space.sm,
            }}
          >
            {savedFoods.map((food) => (
              <Chip
                key={food.id}
                label={food.name}
                selected={false}
                onPress={() => quickLogSavedFood(food)}
                onLongPress={() =>
                  alert(
                    "Remove Saved Food",
                    `Remove "${food.name}" from quick log?`,
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Remove",
                        style: "destructive",
                        onPress: () => removeSavedFood(food.id),
                      },
                    ],
                    "warning",
                  )
                }
              />
            ))}
          </View>
          <Text style={styles.modalHint}>
            Tap to log instantly · long-press to remove
          </Text>
        </>
      )}
      <Text style={styles.inputLabel}>
        Name{" "}
        <Text style={styles.inputLabelOptional}>(e.g. "Chicken & rice")</Text>
      </Text>
      <TextInput
        style={styles.input}
        placeholder="What did you eat? (optional)"
        placeholderTextColor={colors.textMuted}
        value={form.name}
        onChangeText={field("name")}
        autoCapitalize="words"
      />
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <Text style={styles.inputLabel}>
          Remember this food for quick logging
        </Text>
        <Switch value={form.remember} onValueChange={field("remember")} />
      </View>
      <View style={styles.optionalDivider}>
        <View style={styles.optionalDividerLine} />
        <Text style={styles.optionalDividerText}>
          Fill in what you know. All fields below are optional
        </Text>
        <View style={styles.optionalDividerLine} />
      </View>
      <Text style={styles.inputLabel}>Calories (kcal)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 420"
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
        value={form.calories}
        onChangeText={field("calories")}
      />
      <Text style={styles.inputLabel}>Protein (g)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 32"
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
        value={form.protein}
        onChangeText={field("protein")}
      />
      {calories > 0 && protein > 0 && (
        <Text style={styles.modalHint}>
          {((protein / calories) * 100).toFixed(1)}g protein / 100 kcal
        </Text>
      )}
      <Text style={styles.inputLabel}>Carbohydrates (g)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 45"
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
        value={form.carbs}
        onChangeText={field("carbs")}
      />
      <Text style={styles.inputLabel}>Fat (g)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 12"
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
        value={form.fat}
        onChangeText={field("fat")}
      />
      <Text style={styles.inputLabel}>Time</Text>
      <TextInput
        style={styles.input}
        placeholder="HH:MM"
        placeholderTextColor={colors.textMuted}
        keyboardType="numbers-and-punctuation"
        maxLength={5}
        value={form.time}
        onChangeText={(text) => field("time")(maskTimeInput(text))}
      />
      {!!form.time && !isValidTime(form.time) && (
        <Text style={styles.inputError}>
          Enter a 24-hour time between 00:00 and 23:59
        </Text>
      )}
      <ErrorMarginStepper
        value={Number(form.errorMargin) || 0}
        onChange={(v) => field("errorMargin")(String(v))}
      />
      <Text style={styles.modalHint}>
        Nutrition labels and eyeballed portions are rarely exact. This margin
        widens each total into a min-max range, so ±5% on 400 kcal shows as
        380-420.
      </Text>
      {AlertComponent}
    </ModalSheet>
  );
}

const EMPTY_GOALS: MacrosGoalInput = { protein: "", carbs: "", fat: "", calories: "" };

const GOAL_FIELDS: { key: keyof MacrosGoalInput; label: string; placeholder: string }[] = [
  { key: "protein", label: "Protein goal (g)", placeholder: "e.g., 150" },
  { key: "carbs", label: "Carbohydrates goal (g)", placeholder: "e.g., 250" },
  { key: "fat", label: "Fat goal (g)", placeholder: "e.g., 65" },
  { key: "calories", label: "Calories goal (kcal)", placeholder: "e.g., 2000" },
];

export function MacrosGoalModal({
  visible,
  onClose,
  onSave,
  styles,
}: SheetProps & {
  readonly onSave: (input: MacrosGoalInput) => Promise<boolean>;
}) {
  const { colors } = useTheme();
  const [input, setInput] = useState<MacrosGoalInput>(EMPTY_GOALS);
  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Set Daily Macros Goals"
      onConfirm={async () => {
        if (await onSave(input)) setInput(EMPTY_GOALS);
      }}
      scrollable={true}
    >
      {GOAL_FIELDS.map(({ key, label, placeholder }) => (
        <React.Fragment key={key}>
          <Text style={styles.inputLabel}>{label}</Text>
          <TextInput
            style={styles.input}
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            value={input[key]}
            onChangeText={(v) => setInput((p) => ({ ...p, [key]: v }))}
          />
        </React.Fragment>
      ))}
    </ModalSheet>
  );
}

const EMPTY_BODY_FAT: BodyFatInput = { waist: "", neck: "", hip: "" };

export function BodyFatCalcModal({
  visible,
  onClose,
  onSave,
  gender,
  setGenderPersist,
  measurementUnit,
  setMeasurementUnit,
  styles,
}: SheetProps & {
  readonly onSave: (input: BodyFatInput) => Promise<boolean>;
  readonly gender: string;
  readonly setGenderPersist: (gender: string) => void;
  readonly measurementUnit: string;
  readonly setMeasurementUnit: (unit: string) => void;
}) {
  const { colors } = useTheme();
  const [input, setInput] = useState<BodyFatInput>(EMPTY_BODY_FAT);
  const field = (key: keyof BodyFatInput) => (text: string) =>
    setInput((prev) => ({ ...prev, [key]: text }));
  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Calculate Body Fat %"
      subtitle="US Navy Method"
      onConfirm={async () => {
        if (await onSave(input)) setInput(EMPTY_BODY_FAT);
      }}
      confirmText="Calculate"
      scrollable={true}
    >
      <View style={{ flexDirection: "row", gap: space.sm }}>
        {["male", "female"].map((g: string) => (
          <Chip
            key={g}
            label={g.charAt(0).toUpperCase() + g.slice(1)}
            selected={gender === g}
            onPress={() => setGenderPersist(g)}
          />
        ))}
      </View>
      <Text style={styles.inputLabel}>Unit</Text>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        {["cm", "in"].map((u: string) => (
          <Chip
            key={u}
            label={u}
            sub={u === "cm" ? "Centimetres" : "Inches"}
            selected={measurementUnit === u}
            onPress={() => setMeasurementUnit(u)}
          />
        ))}
      </View>
      <Text style={styles.modalHint}>
        Hold the tape snug but not tight, and measure the same way every time.
        A 1cm difference in tape placement moves the result more than a real
        change in body fat does.
      </Text>
      <Text style={styles.inputLabel}>Waist ({measurementUnit})</Text>
      <TextInput
        style={styles.input}
        placeholder="Measure at navel"
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
        value={input.waist}
        onChangeText={field("waist")}
      />
      <Text style={styles.inputLabel}>Neck ({measurementUnit})</Text>
      <TextInput
        style={styles.input}
        placeholder="Measure below larynx"
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
        value={input.neck}
        onChangeText={field("neck")}
      />
      {gender === "female" && (
        <>
          <Text style={styles.inputLabel}>Hip ({measurementUnit})</Text>
          <TextInput
            style={styles.input}
            placeholder="Measure at widest point"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            value={input.hip}
            onChangeText={field("hip")}
          />
        </>
      )}
    </ModalSheet>
  );
}

const EMPTY_MEASUREMENT: MeasurementInput = {
  waist: "",
  armLeft: "",
  armRight: "",
  chest: "",
  customPart: "",
  customValue: "",
};

const STANDARD_MEASUREMENTS: {
  key: "waist" | "armLeft" | "armRight" | "chest";
  label: string;
  placeholder: string;
}[] = [
  { key: "waist", label: "Waist (cm)", placeholder: "e.g., 80" },
  { key: "armLeft", label: "Left Arm (cm)", placeholder: "e.g., 30" },
  { key: "armRight", label: "Right Arm (cm)", placeholder: "e.g., 30" },
  { key: "chest", label: "Chest (cm)", placeholder: "e.g., 100" },
];

export function MeasurementLogModal({
  visible,
  onClose,
  onSave,
  styles,
}: SheetProps & {
  readonly onSave: (form: MeasurementInput) => Promise<MeasurementLogResult>;
}) {
  const { colors } = useTheme();
  const [form, setForm] = useState<MeasurementInput>(EMPTY_MEASUREMENT);
  const field = (key: keyof MeasurementInput) => (text: string) =>
    setForm((prev) => ({ ...prev, [key]: text }));
  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Log Measurements"
      onConfirm={async () => {
        const result = await onSave(form);
        if (result === "all") setForm(EMPTY_MEASUREMENT);
        else if (result === "standard")
          setForm((prev) => ({
            ...EMPTY_MEASUREMENT,
            customPart: prev.customPart,
            customValue: prev.customValue,
          }));
      }}
    >
      {STANDARD_MEASUREMENTS.map(({ key, label, placeholder }) => (
        <React.Fragment key={key}>
          <Text style={styles.inputLabel}>{label}</Text>
          <TextInput
            style={styles.input}
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            value={form[key]}
            onChangeText={field(key)}
          />
        </React.Fragment>
      ))}
      <View style={styles.optionalDivider}>
        <View style={styles.optionalDividerLine} />
        <Text style={styles.optionalDividerText}>Custom Body Part</Text>
        <View style={styles.optionalDividerLine} />
      </View>
      <Text style={styles.inputLabel}>Body Part Name</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g., Calves"
        placeholderTextColor={colors.textMuted}
        value={form.customPart}
        onChangeText={field("customPart")}
        autoCapitalize="words"
      />
      <Text style={styles.inputLabel}>Value (cm)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g., 38"
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
        value={form.customValue}
        onChangeText={field("customValue")}
      />
    </ModalSheet>
  );
}
