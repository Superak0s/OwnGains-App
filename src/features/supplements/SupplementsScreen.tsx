import React, { useState, useEffect, useCallback, useMemo } from "react";
import ScreenTitle from "@shared/components/ScreenTitle";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { supplementsApi } from "./services";
import type {
  SupplementSummary,
  SupplementEntry,
  CreateSupplementParams,
} from "./services";
import QuickLogSupplement from "./components/QuickLogSupplement";
import SupplementSettingsModal from "./components/SupplementSettingsModal";
import ModalSheet from "@shared/components/ModalSheet";
import { useAlert } from "@shared/components/CustomAlert";
import { useTheme } from "@shared/context/ThemeContext";
import type { ThemeColors } from "@shared/context/ThemeContext";
import { useAuth } from "@shared/context/AuthContext";
import {
  cancelTimeReminder,
  cancelNextDoseReminder,
  scheduleNextDoseReminder,
  removeSupplementReminderConfig,
  pruneOrphanedSupplementReminders,
  readSupplementReminderConfigs,
  saveSupplementReminderConfig,
  scheduleTimeReminder,
} from "@shared/services/supplementReminders";
import type { SupplementReminderConfig } from "@shared/services/supplementReminders";
import type { SupplementTemplate } from "./types";
import {
  allDosesTaken,
  formatCountdown,
  formatInterval,
  nextDoseAt,
  quickAmountsFor,
} from "./utils";
import { formatDate as formatDateUtil, formatClockTime, parseDecimal } from "@utils/format";
import LocalOnlyNotice from "@shared/components/LocalOnlyNotice";
import { captureException, metric } from "@shared/services/crashReporting";
import { userFacingError } from "@shared/services/apiError";
import { SCREEN_PADDING } from "@shared/layout";

const DEFAULT_SUPPLEMENT_TEMPLATES: SupplementTemplate[] = [
  {
    name: "Creatine",
    icon: "💪",
    unit: "g",
    defaultAmount: 5,
    color: "#6d28d9",
    description: "Strength & muscle growth",
  },
  {
    name: "Protein",
    icon: "🥛",
    unit: "g",
    defaultAmount: 30,
    color: "#0ea5e9",
    description: "Muscle recovery & growth",
  },
  {
    name: "Vitamin D",
    icon: "☀️",
    unit: "IU",
    defaultAmount: 2000,
    color: "#f59e0b",
    description: "Bone health & immunity",
  },
  {
    name: "Omega-3",
    icon: "🐟",
    unit: "mg",
    defaultAmount: 1000,
    color: "#0891b2",
    description: "Heart & brain health",
  },
  {
    name: "Magnesium",
    icon: "🧲",
    unit: "mg",
    defaultAmount: 400,
    color: "#059669",
    description: "Sleep & muscle function",
  },
  {
    name: "Zinc",
    icon: "⚡",
    unit: "mg",
    defaultAmount: 15,
    color: "#dc2626",
    description: "Immune support & testosterone",
  },
  {
    name: "Caffeine",
    icon: "☕",
    unit: "mg",
    defaultAmount: 200,
    color: "#78350f",
    description: "Energy & focus",
  },
  {
    name: "Ashwagandha",
    icon: "🌿",
    unit: "mg",
    defaultAmount: 600,
    color: "#65a30d",
    description: "Stress & cortisol support",
  },
];

export default function SupplementsScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { alert, AlertComponent } = useAlert();
  const { user } = useAuth();
  const userId = user?.id ? String(user.id) : null;

  const [supplements, setSupplements] = useState<SupplementSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showTemplateSheet, setShowTemplateSheet] = useState(false);

  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("g");
  const [newAmount, setNewAmount] = useState("5");
  const [newIcon, setNewIcon] = useState("💊");
  const [saving, setSaving] = useState(false);

  const [quickLogSupplement, setQuickLogSupplement] =
    useState<SupplementSummary | null>(null);

  const [settingsSupplement, setSettingsSupplement] =
    useState<SupplementSummary | null>(null);

  const [historySupp, setHistorySupp] = useState<SupplementSummary | null>(
    null,
  );
  const [history, setHistory] = useState<SupplementEntry[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistorySheet, setShowHistorySheet] = useState(false);

  const [now, setNow] = useState(() => new Date());
  useFocusEffect(
    useCallback(() => {
      setNow(new Date());
      const timer = setInterval(() => setNow(new Date()), 30_000);
      return () => clearInterval(timer);
    }, []),
  );

  const loadSupplements = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await supplementsApi.list();
      setSupplements(res.supplements);
      setLoadError(null);
      if (userId)
        void pruneOrphanedSupplementReminders(
          userId,
          res.supplements.map((s) => s.id),
        );
    } catch (err) {
      // Never show the empty state on a load error: a user with twenty supplements
      // must not be told they have none and invited to re-create them.
      console.error("Failed to load supplements:", err);
      metric.count("supplements.load_failed");
      captureException(err, { stage: "loadSupplements" });
      setLoadError(
        userFacingError(err, "Could not load your supplements."),
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadSupplements();
  }, [loadSupplements]);

  const handleRefresh = () => {
    setRefreshing(true);
    void loadSupplements(true);
  };

  const handleAddFromTemplate = async (template: SupplementTemplate) => {
    setSaving(true);
    try {
      const params: CreateSupplementParams = {
        name: template.name,
        unit: template.unit,
        defaultAmount: template.defaultAmount,
        icon: template.icon,
        color: template.color,
      };
      await supplementsApi.create(params);
      setShowTemplateSheet(false);
      await loadSupplements(true);
    } catch (err) {
      alert(
        "Error",
        userFacingError(err, "Failed to add supplement"),
        [{ text: "OK" }],
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleAddCustom = async () => {
    if (!newName.trim()) {
      alert(
        "Missing Name",
        "Please enter a supplement name.",
        [{ text: "OK" }],
        "warning",
      );
      return;
    }
    if (
      supplements.some(
        (existing) =>
          existing.name.toLowerCase() === newName.trim().toLowerCase(),
      )
    ) {
      alert(
        "Already added",
        `You already track "${newName.trim()}". Two entries with the same name mean two separate streaks and two reminders.`,
        [{ text: "OK" }],
        "warning",
      );
      return;
    }
    const amt = parseDecimal(newAmount);
    if (Number.isNaN(amt) || amt <= 0) {
      alert(
        "Invalid Amount",
        "Please enter a valid default amount.",
        [{ text: "OK" }],
        "error",
      );
      return;
    }
    setSaving(true);
    try {
      await supplementsApi.create({
        name: newName.trim(),
        unit: newUnit.trim() || "g",
        defaultAmount: amt,
        icon: newIcon || "💊",
      });
      setShowAddSheet(false);
      setNewName("");
      setNewUnit("g");
      setNewAmount("5");
      setNewIcon("💊");
      await loadSupplements(true);
    } catch (err) {
      alert(
        "Error",
        userFacingError(err, "Failed to add supplement"),
        [{ text: "OK" }],
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleLog = async (
    supp: SupplementSummary,
    amount: number,
    note: string,
    takenAt: string | null,
  ): Promise<boolean> => {
    try {
      await supplementsApi.log(supp.id, {
        amount,
        note: note || null,
        ...(takenAt && { takenAt }),
      });
      await loadSupplements(true);
      void syncNextDoseReminder(supp, takenAt);
      return true;
    } catch (err) {
      alert(
        "Log Failed",
        userFacingError(err, "Could not log supplement"),
        [{ text: "OK" }],
        "error",
      );
      return false;
    }
  };

  // Only a dose taken now starts the timer: a backdated one says nothing about
  // when the next is due today.
  const syncNextDoseReminder = async (
    supp: SupplementSummary,
    takenAt: string | null,
  ) => {
    if (user?.id == null || takenAt) return;
    const userId = String(user.id);
    const remaining = supp.dosesPerDay - (supp.dosesToday + 1);
    if (remaining <= 0 || !supp.doseIntervalMinutes) {
      await cancelNextDoseReminder(userId, supp.id);
      return;
    }
    await scheduleNextDoseReminder(
      userId,
      supp.id,
      supp.name,
      supp.defaultAmount,
      supp.unit,
      new Date(Date.now() + supp.doseIntervalMinutes * 60_000),
    );
  };

  const openHistory = async (supp: SupplementSummary) => {
    setHistorySupp(supp);
    setShowHistorySheet(true);
    setHistoryLoading(true);
    try {
      const res = await supplementsApi.getLog(supp.id, 30);
      setHistory(res.entries);
      setHistoryError(null);
    } catch (err) {
      // Distinct from an empty log: "no entries yet" would be a lie, and the
      // user would have no way to retry.
      setHistory([]);
      setHistoryError(
        userFacingError(err, "Could not load the history."),
      );
    } finally {
      setHistoryLoading(false);
    }
  };

  const performDeleteEntry = async (entry: SupplementEntry) => {
    try {
      await supplementsApi.deleteLogEntry(entry.supplementId, entry.id);
      removeHistoryEntry(entry.id);
      await loadSupplements(true);
    } catch (err) {
      alert(
        "Error",
        userFacingError(err, "Failed"),
        [{ text: "OK" }],
        "error",
      );
    }
  };

  const removeHistoryEntry = (entryId: number) => {
    setHistory((prev) => prev.filter((e) => e.id !== entryId));
  };

  const handleDeleteEntry = (entry: SupplementEntry) => {
    alert(
      "Delete Entry",
      `Remove the ${entry.amount}${historySupp?.unit ?? ""} entry from ${formatDate(entry.takenAt)}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void performDeleteEntry(entry),
        },
      ],
      "warning",
    );
  };

  const performDeleteSupplement = async (supp: SupplementSummary) => {
    const userId = user?.id == null ? null : String(user.id);
    if (!userId) {
      alert(
        "Not ready yet",
        "No profile is active right now. Try again in a moment.",
        [{ text: "OK" }],
        "error",
      );
      return;
    }
    const reminderConfig = (await readSupplementReminderConfigs(userId)).find(
      (c) => c.supplementId === supp.id,
    );
    try {
      // Reminder first: a supplement deleted before its reminder config is
      // removed leaves the boot re-arm scheduling a daily notification for
      // something the app no longer knows about, with no UI to stop it.
      await cancelTimeReminder(userId, supp.id);
      await cancelNextDoseReminder(userId, supp.id);
      await removeSupplementReminderConfig(userId, supp.id);
      await supplementsApi.delete(supp.id);
      removeSupplementFromList(supp.id);
    } catch (err) {
      if (reminderConfig) await restoreReminder(userId, reminderConfig);
      alert(
        "Error",
        userFacingError(err, "Failed"),
        [{ text: "OK" }],
        "error",
      );
    }
  };

  const restoreReminder = async (
    userId: string,
    config: SupplementReminderConfig,
  ) => {
    await saveSupplementReminderConfig(userId, config);
    if (config.enabled && config.timeBasedEnabled) {
      await scheduleTimeReminder(
        userId,
        config.supplementId,
        config.name,
        config.defaultAmount,
        config.unit,
        config.reminderTime,
        config.notificationType,
      );
    }
  };

  const removeSupplementFromList = (suppId: number) => {
    setSupplements((prev) => prev.filter((s) => s.id !== suppId));
  };

  const handleDeleteSupplement = (supp: SupplementSummary) => {
    alert(
      `Delete ${supp.name}?`,
      "This will permanently delete the supplement and all its history.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void performDeleteSupplement(supp),
        },
      ],
      "error",
    );
  };

  const formatDate = (iso: string) =>
    formatDateUtil(iso, { month: "short", day: "numeric" }) +
    " " +
    formatClockTime(iso, { hour: "2-digit", minute: "2-digit" });

  const alreadyAdded = (template: SupplementTemplate) =>
    supplements.some(
      (s) => s.name.toLowerCase() === template.name.toLowerCase(),
    );

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size='large' color={colors.accent} />
          <Text style={styles.loadingText}>Loading supplements…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const takenTodayCount = supplements.filter(allDosesTaken).length;
  const supplementNoun =
    supplements.length === 1 ? "supplement" : "supplements";
  const headerSubtitle =
    supplements.length === 0
      ? "No supplements yet"
      : `${supplements.length} ${supplementNoun} · ${takenTodayCount} taken today`;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <FlatList
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accent}
          />
        }
        data={supplements}
        keyExtractor={(supp) => String(supp.id)}
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <ScreenTitle
                title='Supplements'
                subtitle={headerSubtitle}
                style={{ marginBottom: 0 }}
              />
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => setShowTemplateSheet(true)}
              >
                <Text style={styles.addButtonText}>+ Add</Text>
              </TouchableOpacity>
            </View>

            <LocalOnlyNotice
              feature="supplements"
              detail="Your supplements and their history are stored on this phone only. Back them up from Settings."
            />

            {loadError && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>⚠️</Text>
                <Text style={styles.emptyTitle}>Could not load supplements</Text>
                <Text style={styles.emptySubtitle}>{loadError}</Text>
                <TouchableOpacity
                  style={styles.emptyButton}
                  onPress={() => void loadSupplements()}
                >
                  <Text style={styles.emptyButtonText}>Try again</Text>
                </TouchableOpacity>
              </View>
            )}

            {!loadError && supplements.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>💊</Text>
                <Text style={styles.emptyTitle}>No supplements yet</Text>
                <Text style={styles.emptySubtitle}>
                  Add supplements to track your daily intake and set reminders.
                </Text>
                <TouchableOpacity
                  style={styles.emptyButton}
                  onPress={() => setShowTemplateSheet(true)}
                >
                  <Text style={styles.emptyButtonText}>
                    Add your first supplement
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        }
        renderItem={({ item: supp }) => (
          <SupplementCard
            supplement={supp}
            colors={colors}
            now={now}
            onLog={() => setQuickLogSupplement(supp)}
            onHistory={() => openHistory(supp)}
            onSettings={() => setSettingsSupplement(supp)}
            onDelete={() => handleDeleteSupplement(supp)}
          />
        )}
      />

      {quickLogSupplement && (
        <QuickLogSupplement
          visible={!!quickLogSupplement}
          onClose={() => setQuickLogSupplement(null)}
          onLog={(amount, note, takenAt) => {
            void handleLog(quickLogSupplement, amount, note, takenAt);
          }}
          supplementName={quickLogSupplement.name}
          subtitle={
            quickLogSupplement.dosesPerDay > 1
              ? `Dose ${Math.min(quickLogSupplement.dosesToday + 1, quickLogSupplement.dosesPerDay)} of ${quickLogSupplement.dosesPerDay} today`
              : undefined
          }
          unit={quickLogSupplement.unit}
          icon={quickLogSupplement.icon || "💊"}
          defaultAmount={quickLogSupplement.defaultAmount}
          quickAmounts={quickAmountsFor(quickLogSupplement.defaultAmount)}
        />
      )}

      <ModalSheet
        visible={showTemplateSheet}
        onClose={() => setShowTemplateSheet(false)}
        showCancelButton={false}
        showConfirmButton={false}
      >
        <Text style={styles.sheetTitle}>Add Supplement</Text>
        <Text style={styles.sheetSubtitle}>
          Pick a template or create your own
        </Text>

        <ScrollView
          style={{ maxHeight: 440 }}
          showsVerticalScrollIndicator={false}
        >
          {DEFAULT_SUPPLEMENT_TEMPLATES.map((t) => {
            const added = alreadyAdded(t);
            return (
              <TouchableOpacity
                key={t.name}
                style={[styles.templateRow, added && styles.templateRowAdded]}
                onPress={() => !added && handleAddFromTemplate(t)}
                disabled={added || saving}
              >
                <Text style={styles.templateIcon}>{t.icon}</Text>
                <View style={styles.templateInfo}>
                  <Text
                    style={[
                      styles.templateName,
                      added && styles.templateNameAdded,
                    ]}
                  >
                    {t.name}
                  </Text>
                  <Text style={styles.templateDesc}>{t.description}</Text>
                  <Text style={styles.templateAmount}>
                    Default: {t.defaultAmount} {t.unit}
                  </Text>
                </View>
                {added ? (
                  <Text style={styles.templateAddedBadge}>✓ Added</Text>
                ) : (
                  <Text style={styles.templateAddIcon}>+</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <TouchableOpacity
          style={styles.customButton}
          onPress={() => {
            setShowTemplateSheet(false);
            setShowAddSheet(true);
          }}
        >
          <Text style={styles.customButtonText}>
            ✏️ Create Custom Supplement
          </Text>
        </TouchableOpacity>
      </ModalSheet>

      <ModalSheet
        visible={showAddSheet}
        onClose={() => setShowAddSheet(false)}
        showCancelButton={false}
        showConfirmButton={false}
      >
        <Text style={styles.sheetTitle}>Custom Supplement</Text>

        <View style={styles.formRow}>
          <TextInput
            style={[
              styles.formInput,
              { flex: 0, width: 60, textAlign: "center", fontSize: 28 },
            ]}
            value={newIcon}
            onChangeText={setNewIcon}
            placeholder='💊'
            // Counted in UTF-16 units, so a compound emoji (🧘‍♂️ is 5) needs
            // headroom or it is truncated to an unpaired surrogate.
            // ponytail: a grapheme-aware cap needs Intl.Segmenter, which Hermes
            // may not include. 8 units covers every emoji in the templates.
            maxLength={8}
            accessibilityLabel='Supplement icon'
          />
          <TextInput
            style={[styles.formInput, { flex: 1, marginLeft: 10 }]}
            value={newName}
            onChangeText={setNewName}
            placeholder='Supplement name'
            accessibilityLabel='Supplement name'
            maxLength={40}
            autoFocus
          />
        </View>

        <View style={styles.formRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.formLabel}>Default amount</Text>
            <TextInput
              style={styles.formInput}
              value={newAmount}
              onChangeText={setNewAmount}
              keyboardType='decimal-pad'
              placeholder='5'
              accessibilityLabel='Dose amount'
              maxLength={8}
            />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.formLabel}>Unit</Text>
            <TextInput
              style={styles.formInput}
              value={newUnit}
              onChangeText={setNewUnit}
              placeholder='g'
              accessibilityLabel='Dose unit'
              maxLength={12}
              autoCapitalize='none'
            />
          </View>
        </View>

        <View style={styles.sheetButtons}>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => setShowAddSheet(false)}
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleAddCustom}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color='#fff' />
            ) : (
              <Text style={styles.saveBtnText}>Add Supplement</Text>
            )}
          </TouchableOpacity>
        </View>
      </ModalSheet>

      <ModalSheet
        visible={showHistorySheet}
        onClose={() => setShowHistorySheet(false)}
        showCancelButton={false}
        showConfirmButton={false}
      >
        <Text style={styles.sheetTitle}>
          {historySupp?.icon || "💊"} {historySupp?.name} History
        </Text>
        <Text style={styles.sheetSubtitle}>Last 30 entries</Text>

        {historyLoading && (
          <View style={{ paddingVertical: 40, alignItems: "center" }}>
            <ActivityIndicator color={colors.accent} />
          </View>
        )}
        {!historyLoading && historyError && (
          <View style={styles.historyEmpty}>
            <Text style={styles.historyEmptyIcon}>⚠️</Text>
            <Text style={styles.historyEmptyText}>{historyError}</Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => historySupp && void openHistory(historySupp)}
            >
              <Text style={styles.emptyButtonText}>Try again</Text>
            </TouchableOpacity>
          </View>
        )}
        {!historyLoading && !historyError && history.length === 0 && (
          <View style={styles.historyEmpty}>
            <Text style={styles.historyEmptyIcon}>📋</Text>
            <Text style={styles.historyEmptyText}>No entries yet</Text>
          </View>
        )}
        {!historyLoading && !historyError && history.length > 0 && (
          <ScrollView
            style={{ maxHeight: 420 }}
            showsVerticalScrollIndicator={false}
          >
            {history.map((entry) => (
              <View key={entry.id} style={styles.historyRow}>
                <View style={styles.historyInfo}>
                  <Text style={styles.historyAmount}>
                    {entry.amount} {historySupp?.unit}
                  </Text>
                  {entry.note ? (
                    <Text style={styles.historyNote}>{entry.note}</Text>
                  ) : null}
                  <Text style={styles.historyDate}>
                    {formatDate(entry.takenAt)}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleDeleteEntry(entry)}
                  style={styles.historyDelete}
                  accessibilityRole='button'
                  accessibilityLabel='Delete supplement entry'
                >
                  <Text style={styles.historyDeleteText}>🗑</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}
      </ModalSheet>

      {settingsSupplement && (
        <SupplementSettingsModal
          visible={!!settingsSupplement}
          supplement={settingsSupplement}
          onClose={() => setSettingsSupplement(null)}
          onSaved={(message) => {
            setSettingsSupplement(null);
            void loadSupplements(true);
            // Shown from the screen, not the modal: the modal unmounts in the
            // same tick, taking its own alert with it.
            if (message) alert("✅ Saved", message, [{ text: "OK" }], "success");
          }}
        />
      )}

      {AlertComponent}
    </SafeAreaView>
  );
}

interface SupplementCardProps {
  readonly supplement: SupplementSummary;
  readonly colors: ThemeColors;
  readonly now: Date;
  readonly onLog: () => void;
  readonly onHistory: () => void;
  readonly onSettings: () => void;
  readonly onDelete: () => void;
}

function SupplementCard({
  supplement: s,
  colors,
  now,
  onLog,
  onHistory,
  onSettings,
  onDelete,
}: SupplementCardProps) {
  const styles = useMemo(() => cardStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(false);
  const multiDose = s.dosesPerDay > 1;
  const done = allDosesTaken(s);
  const nextDose = nextDoseAt(s, now);
  const intervalNote = s.doseIntervalMinutes
    ? `, every ${formatInterval(s.doseIntervalMinutes)}`
    : "";
  const doseSummary = multiDose
    ? `${s.defaultAmount} ${s.unit} × ${s.dosesPerDay}/day${intervalNote}`
    : `${s.defaultAmount} ${s.unit}`;
  let doneLabel = s.takenToday ? ", taken today" : "";
  if (multiDose) doneLabel = `, ${s.dosesToday} of ${s.dosesPerDay} doses taken today`;

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.mainRow}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.8}
        accessibilityRole='button'
        accessibilityLabel={`${s.name}, ${doseSummary}${doneLabel}`}
        accessibilityHint='Shows this supplement’s actions'
        accessibilityState={{ expanded }}
      >
        <View
          style={[
            styles.iconCircle,
            { backgroundColor: s.color ? `${s.color}22` : colors.accentLight },
          ]}
        >
          <Text style={styles.iconText}>{s.icon || "💊"}</Text>
        </View>

        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {s.name}
          </Text>
          <Text style={styles.meta} numberOfLines={2}>
            {doseSummary}
            {s.streak > 0 ? ` · 🔥 ${s.streak} day streak` : ""}
            {s.reminderEnabled ? " · ⏰ reminder on" : ""}
          </Text>
          {multiDose && (
            <View style={styles.doseRow}>
              <View style={styles.doseDots}>
                {Array.from({ length: s.dosesPerDay }, (_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.doseDot,
                      i < s.dosesToday && {
                        backgroundColor: s.color ?? colors.accent,
                      },
                    ]}
                  />
                ))}
              </View>
              <Text style={styles.doseText}>
                {s.dosesToday}/{s.dosesPerDay}
                {nextDose
                  ? ` · next in ${formatCountdown(nextDose.getTime() - now.getTime())}`
                  : ""}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.rightSide}>
          {done ? (
            <View style={styles.takenBadge}>
              <Text style={styles.takenText}>✓ Done</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.logBtn, nextDose && styles.logBtnWaiting]}
              onPress={onLog}
              accessibilityRole='button'
              accessibilityLabel={
                nextDose
                  ? `Log ${s.name} early, next dose due in ${formatCountdown(nextDose.getTime() - now.getTime())}`
                  : `Log ${s.name}`
              }
            >
              <Text
                style={[styles.logBtnText, nextDose && styles.logBtnTextWaiting]}
              >
                Log
              </Text>
            </TouchableOpacity>
          )}
          <Text style={styles.chevron} accessibilityElementsHidden>
            {expanded ? "▲" : "▼"}
          </Text>
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.actions}>
          {done && (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={onLog}
              accessibilityRole='button'
              accessibilityLabel={`Log another dose of ${s.name}`}
            >
              <Text style={styles.actionIcon}>📝</Text>
              <Text style={styles.actionLabel}>Log Again</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={onHistory}
            accessibilityRole='button'
            accessibilityLabel={`${s.name} history`}
          >
            <Text style={styles.actionIcon}>📋</Text>
            <Text style={styles.actionLabel}>History</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={onSettings}
            accessibilityRole='button'
            accessibilityLabel={`${s.name} reminder settings`}
          >
            <Text style={styles.actionIcon}>⚙️</Text>
            <Text style={styles.actionLabel}>Settings</Text>
          </TouchableOpacity>
          {/* Separated from Settings, which sits next to it and is the most
              used action: an irreversible delete a thumb-width away. */}
          <View style={styles.actionSpacer} />
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={onDelete}
            accessibilityRole='button'
            accessibilityLabel={`Delete ${s.name}`}
          >
            <Text style={styles.actionIcon}>🗑</Text>
            <Text style={[styles.actionLabel, { color: colors.error }]}>
              Delete
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const cardStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      marginBottom: 12,
      overflow: "hidden",
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
    mainRow: {
      flexDirection: "row",
      alignItems: "center",
      padding: 16,
      gap: 14,
    },
    iconCircle: {
      width: 50,
      height: 50,
      borderRadius: 25,
      alignItems: "center",
      justifyContent: "center",
    },
    iconText: { fontSize: 26 },
    info: { flex: 1 },
    name: {
      fontSize: 17,
      fontWeight: "700",
      color: colors.textPrimary,
      marginBottom: 3,
    },
    meta: { fontSize: 13, color: colors.textMuted },
    rightSide: { alignItems: "flex-end", gap: 6 },
    takenBadge: {
      backgroundColor: colors.successLight,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
    },
    takenText: { fontSize: 12, fontWeight: "700", color: colors.success },
    logBtn: {
      backgroundColor: colors.accent,
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 20,
    },
    logBtnText: { fontSize: 13, fontWeight: "700", color: colors.surface },
    logBtnWaiting: {
      backgroundColor: colors.inputBackground,
      borderWidth: 1,
      borderColor: colors.accent,
    },
    logBtnTextWaiting: { color: colors.accent },
    doseRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 6,
    },
    doseDots: { flexDirection: "row", gap: 4 },
    doseDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.separator,
    },
    doseText: { fontSize: 12, fontWeight: "600", color: colors.textSecondary },
    chevron: { fontSize: 11, color: colors.textMuted },
    actions: {
      flexDirection: "row",
      borderTopWidth: 1,
      borderTopColor: colors.separator,
    },
    actionBtn: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 12,
      gap: 4,
    },
    actionSpacer: { width: 20 },
    actionIcon: { fontSize: 18 },
    actionLabel: {
      fontSize: 11,
      color: colors.textSecondary,
      fontWeight: "600",
    },
  });

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { flex: 1 },
    scrollContent: SCREEN_PADDING,
    loadingContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 16,
    },
    loadingText: { fontSize: 16, color: colors.textMuted },

    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16,
    },

    addButton: {
      backgroundColor: colors.accent,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 22,
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 6,
    },
    addButtonText: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.surface,
    },

    emptyState: {
      alignItems: "center",
      paddingHorizontal: 40,
      paddingVertical: 60,
    },
    emptyIcon: { fontSize: 64, marginBottom: 16 },
    emptyTitle: {
      fontSize: 22,
      fontWeight: "700",
      color: colors.textPrimary,
      marginBottom: 8,
    },
    emptySubtitle: {
      fontSize: 15,
      color: colors.textMuted,
      textAlign: "center",
      lineHeight: 22,
      marginBottom: 28,
    },
    emptyButton: {
      backgroundColor: colors.accent,
      paddingHorizontal: 24,
      paddingVertical: 14,
      borderRadius: 14,
    },
    emptyButtonText: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.surface,
    },

    sheetTitle: {
      fontSize: 22,
      fontWeight: "800",
      color: colors.textPrimary,
      marginBottom: 4,
    },
    sheetSubtitle: {
      fontSize: 14,
      color: colors.textMuted,
      marginBottom: 20,
    },

    templateRow: {
      flexDirection: "row",
      alignItems: "center",
      padding: 14,
      borderRadius: 14,
      backgroundColor: colors.inputBackground,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.inputBorder,
    },
    templateRowAdded: {
      opacity: 0.5,
    },
    templateIcon: { fontSize: 30, marginRight: 14 },
    templateInfo: { flex: 1 },
    templateName: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.textPrimary,
      marginBottom: 2,
    },
    templateNameAdded: { color: colors.textMuted },
    templateDesc: { fontSize: 13, color: colors.textSecondary },
    templateAmount: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    templateAddedBadge: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.success,
    },
    templateAddIcon: {
      fontSize: 24,
      fontWeight: "700",
      color: colors.accent,
    },

    customButton: {
      marginTop: 14,
      backgroundColor: colors.inputBackground,
      padding: 16,
      borderRadius: 14,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.inputBorder,
    },
    customButtonText: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.textPrimary,
    },

    formLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textSecondary,
      marginBottom: 6,
    },
    formRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      marginBottom: 14,
    },
    formInput: {
      backgroundColor: colors.inputBackground,
      borderRadius: 12,
      padding: 14,
      fontSize: 16,
      color: colors.textPrimary,
      borderWidth: 1,
      borderColor: colors.inputBorder,
    },

    sheetButtons: {
      flexDirection: "row",
      gap: 12,
      marginTop: 8,
    },
    cancelBtn: {
      flex: 1,
      backgroundColor: colors.separator,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: "center",
    },
    cancelBtnText: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.textSecondary,
    },
    saveBtn: {
      flex: 2,
      backgroundColor: colors.accent,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: "center",
    },
    saveBtnText: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.surface,
    },

    historyEmpty: {
      alignItems: "center",
      paddingVertical: 40,
    },
    historyEmptyIcon: { fontSize: 40, marginBottom: 10, opacity: 0.3 },
    historyEmptyText: { fontSize: 15, color: colors.textMuted },
    historyRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.separator,
    },
    historyInfo: { flex: 1 },
    historyAmount: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    historyNote: {
      fontSize: 13,
      color: colors.textSecondary,
      fontStyle: "italic",
      marginTop: 2,
    },
    historyDate: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
    historyDelete: { padding: 8 },
    historyDeleteText: { fontSize: 18 },
  });
