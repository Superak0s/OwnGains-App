import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TextInput, ScrollView, Alert } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useTheme } from "@shared/context/ThemeContext";
import { progressPhotoApi } from "../services";
import {
  MuscleGroup,
  MUSCLE_GROUPS,
  MUSCLE_GROUP_LABELS,
} from "../types/muscleRecovery";
import ModalSheet from "@shared/components/ModalSheet";
import { captureException } from "@shared/services/crashReporting";
import makeStyles from "../styles";
import { Button, Chip, radius, space } from "../ui";
import { NOTE_MAX_LENGTH } from "@shared/limits";

interface LogProgressPhotoModalProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onSuccess: () => void;
  /** Fired right as the modal closes and the background upload begins, with the file size in bytes. */
  readonly onUploadStart?: (totalBytes: number) => void;
  readonly onUploadEnd?: (success: boolean) => void;
}

const ANGLE_OPTIONS = [
  { value: "front" as const, label: "Front" },
  { value: "back" as const, label: "Back" },
  { value: "side" as const, label: "Side" },
  { value: "custom" as const, label: "Custom" },
];

export const LogProgressPhotoModal: React.FC<LogProgressPhotoModalProps> = ({
  visible,
  onClose,
  onSuccess,
  onUploadStart,
  onUploadEnd,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [step, setStep] = useState<"select" | "tag">("select");
  const [selectedUri, setSelectedUri] = useState<string | null>(null);
  const [selectedMuscles, setSelectedMuscles] = useState<string[]>([]);
  const [customMuscleInput, setCustomMuscleInput] = useState("");
  const [muscleSearch, setMuscleSearch] = useState("");
  const [selectedAngle, setSelectedAngle] = useState<
    "front" | "back" | "side" | "custom"
  >("front");
  const [customSideName, setCustomSideName] = useState("");
  const [notes, setNotes] = useState("");
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setStep("select");
      setSelectedUri(null);
      setSelectedMuscles([]);
      setCustomMuscleInput("");
      setMuscleSearch("");
      setSelectedAngle("front");
      setCustomSideName("");
      setNotes("");
      setCameraError(null);
    }
  }, [visible]);

  const pickFromCamera = async () => {
    setCameraError(null);
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Camera access is off",
          "Enable camera access in Settings to take progress photos.",
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: "images",
        quality: 0.8,
        allowsEditing: true,
        aspect: [3, 4],
      });

      if (!result.canceled && result.assets?.[0]) {
        setSelectedUri(result.assets[0].uri);
        setStep("tag");
      }
    } catch (error) {
      setCameraError("Couldn't open the camera. Try again.");
      console.error("Camera picker error:", error);
      captureException(error, { stage: "cameraPicker" });
    }
  };

  const pickFromGallery = async () => {
    setCameraError(null);
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Photo access is off",
          "Enable photo library access in Settings to pick a photo.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        quality: 0.8,
        allowsEditing: true,
        aspect: [3, 4],
      });

      if (!result.canceled && result.assets?.[0]) {
        setSelectedUri(result.assets[0].uri);
        setStep("tag");
      }
    } catch (error) {
      setCameraError("Couldn't open your photo library. Try again.");
      console.error("Gallery picker error:", error);
      captureException(error, { stage: "galleryPicker" });
    }
  };

  const toggleMuscle = (muscle: string) => {
    setSelectedMuscles((prev) =>
      prev.includes(muscle) ? prev.filter((m) => m !== muscle) : [...prev, muscle],
    );
  };

  const addCustomMuscle = () => {
    const name = customMuscleInput.trim();
    if (!name) return;
    setSelectedMuscles((prev) => (prev.includes(name) ? prev : [...prev, name]));
    setCustomMuscleInput("");
  };

  const filteredMuscleGroups = MUSCLE_GROUPS.filter((muscle) =>
    MUSCLE_GROUP_LABELS[muscle]
      .toLowerCase()
      .includes(muscleSearch.trim().toLowerCase()),
  );

  const customMuscles = selectedMuscles.filter(
    (m) => !(MUSCLE_GROUPS as readonly string[]).includes(m),
  );

  // Compression + upload/copy takes several seconds, so close the modal right away
  // and let it finish in the background instead of blocking the UI on it.
  const handleSubmit = async () => {
    if (!selectedUri) {
      Alert.alert("Pick a photo first");
      return;
    }

    const uploadParams = {
      uri: selectedUri,
      muscleGroups: selectedMuscles as MuscleGroup[],
      notes: notes.trim() || undefined,
      angle: selectedAngle,
      customSideName:
        selectedAngle === "custom" ? customSideName.trim() || undefined : undefined,
      takenAt: new Date().toISOString(),
    };
    const info = await FileSystem.getInfoAsync(selectedUri);
    const totalBytes = info.exists && !info.isDirectory ? (info.size ?? 0) : 0;

    onClose();
    onUploadStart?.(totalBytes);

    progressPhotoApi
      .uploadPhoto(uploadParams)
      .then(() => {
        onSuccess();
        onUploadEnd?.(true);
      })
      .catch((error) => {
        console.error("Upload photo error:", error);
        captureException(error, { stage: "uploadProgressPhoto" });
        Alert.alert("Upload failed", "Your progress photo wasn't saved. Try again.");
        onUploadEnd?.(false);
      });
  };

  if (step === "select") {
    return (
      <ModalSheet
        visible={visible}
        title="Progress photo"
        onClose={onClose}
        showConfirmButton={false}
        showCancelButton={false}
      >
        <View style={local.selectStep}>
          <Button label="Take a photo" onPress={pickFromCamera} full />
          <Button
            label="Choose from gallery"
            variant="quiet"
            onPress={pickFromGallery}
            full
          />
          {cameraError ? (
            <Text style={styles.inputError}>{cameraError}</Text>
          ) : null}
        </View>
      </ModalSheet>
    );
  }

  return (
    <ModalSheet
      visible={visible}
      title="Tag your photo"
      onClose={onClose}
      confirmText="Save"
      onConfirm={handleSubmit}
      cancelText="Cancel"
      scrollable
      fullHeight
    >
      <ScrollView keyboardShouldPersistTaps="handled">
        {selectedUri && (
          <View style={local.preview}>
            <Image
              source={{ uri: selectedUri }}
              style={local.previewImage}
              contentFit="cover"
            />
            <View style={local.retake}>
              <Button
                label="Retake"
                size="sm"
                variant="quiet"
                onPress={() => {
                  setStep("select");
                  setSelectedUri(null);
                }}
              />
            </View>
          </View>
        )}

        <Text style={styles.inputLabel}>Angle</Text>
        <View style={local.grid}>
          {ANGLE_OPTIONS.map((opt) => (
            <Chip
              key={opt.value}
              label={opt.label}
              selected={selectedAngle === opt.value}
              onPress={() => setSelectedAngle(opt.value)}
            />
          ))}
        </View>

        {selectedAngle === "custom" && (
          <TextInput
            style={[styles.input, { marginTop: space.sm }]}
            placeholder="Name this angle, e.g. 3/4 turn"
            placeholderTextColor={colors.textMuted}
            value={customSideName}
            onChangeText={setCustomSideName}
          />
        )}

        <Text style={styles.inputLabel}>
          Muscle groups{" "}
          {selectedMuscles.length > 0 ? (
            <Text style={styles.inputLabelOptional}>
              ({selectedMuscles.length} selected)
            </Text>
          ) : null}
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Search muscle groups"
          placeholderTextColor={colors.textMuted}
          value={muscleSearch}
          onChangeText={setMuscleSearch}
        />
        <View style={local.grid}>
          {filteredMuscleGroups.map((muscle) => (
            <Chip
              key={muscle}
              label={MUSCLE_GROUP_LABELS[muscle]}
              selected={selectedMuscles.includes(muscle)}
              onPress={() => toggleMuscle(muscle)}
            />
          ))}
          {customMuscles.map((muscle) => (
            <Chip
              key={muscle}
              label={muscle}
              selected
              onPress={() => toggleMuscle(muscle)}
            />
          ))}
        </View>

        <View style={local.addRow}>
          <TextInput
            style={[styles.input, { flex: 1, marginBottom: 0 }]}
            placeholder="Add your own"
            placeholderTextColor={colors.textMuted}
            value={customMuscleInput}
            onChangeText={setCustomMuscleInput}
            onSubmitEditing={addCustomMuscle}
          />
          <Button
            label="Add"
            onPress={addCustomMuscle}
            disabled={!customMuscleInput.trim()}
          />
        </View>

        {selectedMuscles.length > 0 && (
          <View style={local.clearRow}>
            <Button
              label="Clear selection"
              size="sm"
              variant="quiet"
              onPress={() => setSelectedMuscles([])}
            />
          </View>
        )}

        <Text style={styles.inputLabel}>
          Notes <Text style={styles.inputLabelOptional}>(optional)</Text>
        </Text>
        <TextInput
          style={[styles.input, { minHeight: 80 }]}
          placeholder="What changed since the last one?"
          placeholderTextColor={colors.textMuted}
          value={notes}
          maxLength={NOTE_MAX_LENGTH}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
      </ScrollView>
    </ModalSheet>
  );
};

const local = StyleSheet.create({
  selectStep: { gap: space.sm, paddingVertical: space.sm },
  preview: {
    width: "100%",
    height: 240,
    borderRadius: radius.lg,
    overflow: "hidden",
    marginBottom: space.md,
  },
  previewImage: { width: "100%", height: "100%" },
  retake: { position: "absolute", bottom: space.sm, right: space.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  addRow: { flexDirection: "row", gap: space.sm, marginTop: space.md },
  clearRow: { flexDirection: "row", marginTop: space.sm },
});

export default LogProgressPhotoModal;
