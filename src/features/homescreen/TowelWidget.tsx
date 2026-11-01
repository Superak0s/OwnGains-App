import React, { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Text, TextInput } from "@shared/components/Text";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "@react-navigation/native";
import ModalSheet from "@shared/components/ModalSheet";
import { useAlert } from "@shared/components/CustomAlert";
import { Bar, Button, Placeholder, SectionLabel, Stepper, radius, space } from "@shared/components/ui";
import { useAuth } from "@shared/context/AuthContext";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";
import { captureException } from "@shared/services/crashReporting";
import { formatDate, generateId } from "@utils/format";
import {
  deleteTowelPhoto,
  keepTowelPhoto,
  loadTowels,
  saveTowels,
  updateTowel,
  washTowel,
  type Towel,
  type TowelRack,
} from "./towels";

const LAST_USED_FORMAT: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" };
const MAX_WASH_AFTER = 30;
const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: "images",
  quality: 0.7,
  allowsEditing: true,
  aspect: [1, 1],
};

type Draft = Pick<Towel, "name" | "photoUri" | "washAfter"> & { id: string | null };

const newDraft = (): Draft => ({ id: null, name: "", photoUri: null, washAfter: 5 });

function TowelPhoto({
  uri,
  style,
  colors,
}: {
  readonly uri: string | null;
  readonly style: StyleProp<ViewStyle>;
  readonly colors: ThemeColors;
}): React.JSX.Element {
  return (
    <View style={[{ backgroundColor: colors.badgeBackground, borderRadius: radius.lg, overflow: "hidden" }, style]}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
    </View>
  );
}

export default function TowelWidget(): React.JSX.Element {
  const userId = useAuth().user?.id ?? null;
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { alert, AlertComponent } = useAlert();
  const [rack, setRack] = useState<TowelRack | null>(null);
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadTowels(userId).then((next) => {
        if (active) setRack(next);
      });
      return () => {
        active = false;
      };
    }, [userId]),
  );

  // Re-reads first, so a use counted by a workout since the last load isn't overwritten.
  const change = async (edit: (rack: TowelRack) => TowelRack): Promise<void> => {
    const next = edit(await loadTowels(userId));
    await saveTowels(userId, next);
    setRack(next);
  };

  const pickPhoto = async (source: "camera" | "library") => {
    try {
      const permission =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        alert(
          source === "camera" ? "Camera access is off" : "Photo access is off",
          "Turn it on in your phone's settings to add a towel photo.",
        );
        return;
      }
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS)
          : await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
      const uri = result.canceled ? null : result.assets[0]?.uri;
      if (uri) setDraft((d) => d && { ...d, photoUri: uri });
    } catch (error) {
      captureException(error, { feature: "towels", stage: source });
      alert("Couldn't open the picker", "Try again.");
    }
  };

  const saveDraft = async (d: Draft) => {
    setDraft(null);
    try {
      const existing = rack?.towels.find((t) => t.id === d.id);
      const photoUri =
        d.photoUri && d.photoUri !== existing?.photoUri ? await keepTowelPhoto(d.photoUri) : d.photoUri;
      if (existing && existing.photoUri !== photoUri) await deleteTowelPhoto(existing.photoUri);
      const fields = { name: d.name.trim(), photoUri, washAfter: d.washAfter };
      if (d.id) {
        const id = d.id;
        await change((r) => updateTowel(r, id, () => fields));
      } else {
        const towel: Towel = { id: generateId("towel"), ...fields, uses: 0, lastUsed: null };
        await change((r) => ({ towels: [...r.towels, towel], currentId: towel.id }));
      }
    } catch (error) {
      captureException(error, { feature: "towels", stage: "save" });
      alert("Couldn't save the towel", "Try again.");
    }
  };

  const confirmDelete = (towel: Towel) =>
    alert("Delete this towel?", `${towel.name} and its count will be removed.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          setDraft(null);
          void change((r) => ({
            towels: r.towels.filter((t) => t.id !== towel.id),
            currentId: r.currentId === towel.id ? null : r.currentId,
          })).then(() => deleteTowelPhoto(towel.photoUri));
        },
      },
    ]);

  if (!rack) return <Placeholder text="Loading…" />;
  const current = rack.towels.find((t) => t.id === rack.currentId);
  const due = !!current && current.uses >= current.washAfter;

  const openSheet = (next: Draft) => {
    setPicking(false);
    setDraft(next);
  };

  return (
    <>
      {current ? (
        <View style={styles.row}>
          <TowelPhoto uri={current.photoUri} style={styles.photo} colors={colors} />
          <View style={styles.info}>
            <Text style={styles.name} numberOfLines={1}>
              {current.name}
            </Text>
            <Text style={[styles.meta, due && styles.due]}>
              {due ? "Time to wash · " : ""}
              {current.uses} of {current.washAfter} uses
            </Text>
            <Text style={styles.meta}>
              {current.lastUsed
                ? `Last used ${formatDate(current.lastUsed, LAST_USED_FORMAT)}`
                : "Not used yet"}
            </Text>
            <Bar pct={(current.uses / current.washAfter) * 100} tone={due ? colors.error : colors.accent} />
            <View style={styles.actions}>
              <Button size="sm" label="Swap" variant={due ? "quiet" : "primary"} onPress={() => setPicking(true)} />
              <Button
                size="sm"
                label="Washed"
                variant={due ? "primary" : "quiet"}
                tone={due ? colors.error : undefined}
                onPress={() => void change((r) => washTowel(r, current.id))}
              />
            </View>
          </View>
        </View>
      ) : (
        <Placeholder
          text={
            rack.towels.length
              ? "Pick the towel you're using. Every workout you finish counts as a use."
              : "Add a towel with a photo. Every workout you finish counts as a use."
          }
          action={
            rack.towels.length
              ? { label: "Pick towel", onPress: () => setPicking(true) }
              : { label: "Add towel", onPress: () => setDraft(newDraft()) }
          }
        />
      )}

      <ModalSheet
        visible={picking}
        onClose={() => setPicking(false)}
        title="Pick a towel"
        subtitle="Long-press a towel to edit or delete it"
        scrollable
      >
        <View style={styles.grid}>
          {rack.towels.map((towel) => {
            const selected = towel.id === rack.currentId;
            return (
              <Pressable
                key={towel.id}
                style={styles.cell}
                accessibilityRole="button"
                accessibilityLabel={`${towel.name}, ${towel.uses} of ${towel.washAfter} uses`}
                accessibilityHint="Long-press to edit"
                accessibilityState={{ selected }}
                onPress={() => {
                  setPicking(false);
                  void change((r) => ({ ...r, currentId: towel.id }));
                }}
                onLongPress={() => openSheet({ ...towel })}
              >
                <TowelPhoto uri={towel.photoUri} style={[styles.tile, selected && styles.selected]} colors={colors} />
                <Text style={[styles.count, towel.uses >= towel.washAfter && styles.due]}>
                  {towel.uses}/{towel.washAfter}
                </Text>
                <Text style={styles.cellName} numberOfLines={1}>
                  {towel.name}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            style={styles.cell}
            accessibilityRole="button"
            accessibilityLabel="Add towel"
            onPress={() => openSheet(newDraft())}
          >
            <View style={[styles.tile, styles.addTile]}>
              <Text style={styles.addGlyph}>+</Text>
            </View>
            <Text style={styles.cellName}>Add</Text>
          </Pressable>
        </View>
      </ModalSheet>

      <ModalSheet
        visible={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Edit towel" : "New towel"}
        showCancelButton
        showConfirmButton
        confirmText="Save"
        confirmDisabled={!draft?.name.trim()}
        onConfirm={() => {
          if (draft) void saveDraft(draft);
        }}
        scrollable
      >
        {draft ? (
          <View style={styles.form}>
            <TowelPhoto uri={draft.photoUri} style={styles.preview} colors={colors} />
            <View style={styles.actions}>
              <Button size="sm" variant="quiet" label="Take photo" onPress={() => void pickPhoto("camera")} />
              <Button size="sm" variant="quiet" label="From gallery" onPress={() => void pickPhoto("library")} />
            </View>
            <View>
              <SectionLabel>Name</SectionLabel>
              <TextInput
                style={styles.input}
                value={draft.name}
                onChangeText={(name) => setDraft({ ...draft, name })}
                placeholder="Navy stripe"
                placeholderTextColor={colors.textMuted}
                maxLength={40}
                accessibilityLabel="Towel name"
              />
            </View>
            <View>
              <SectionLabel>Wash after</SectionLabel>
              <Stepper
                label="uses before washing"
                value={draft.washAfter}
                onChange={(washAfter) => setDraft({ ...draft, washAfter })}
                min={1}
                max={MAX_WASH_AFTER}
                format={(v) => `${v} ${v === 1 ? "use" : "uses"}`}
              />
            </View>
            {draft.id ? (
              <Button
                variant="danger"
                label="Delete towel"
                onPress={() => {
                  const towel = rack.towels.find((t) => t.id === draft.id);
                  if (towel) confirmDelete(towel);
                }}
              />
            ) : null}
          </View>
        ) : null}
      </ModalSheet>

      {AlertComponent}
    </>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: { flexDirection: "row", gap: space.md },
    photo: { width: 96, height: 96 },
    info: { flex: 1, gap: space.xs },
    name: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
    meta: { fontSize: 12, color: colors.textSecondary },
    due: { color: colors.error, fontWeight: "700" },
    actions: { flexDirection: "row", gap: space.sm, marginTop: space.xs },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
    cell: { width: "30%", alignItems: "center", gap: space.xs },
    tile: { width: "100%", aspectRatio: 1 },
    selected: { borderWidth: 3, borderColor: colors.accent },
    count: { fontSize: 12, fontWeight: "700", color: colors.textPrimary },
    cellName: { fontSize: 12, color: colors.textSecondary },
    addTile: {
      borderWidth: 2,
      borderStyle: "dashed",
      borderColor: colors.surfaceBorder,
      borderRadius: radius.lg,
      alignItems: "center",
      justifyContent: "center",
    },
    addGlyph: { fontSize: 28, color: colors.accent },
    form: { gap: space.md },
    preview: { width: "100%", aspectRatio: 1, maxHeight: 220 },
    input: {
      backgroundColor: colors.inputBackground,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      fontSize: 15,
      color: colors.textPrimary,
    },
  });
