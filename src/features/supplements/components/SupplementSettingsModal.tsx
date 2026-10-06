import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Platform,
  ActivityIndicator,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  getStorageItem,
  setStorageItem,
  removeStorageItem,
} from "@shared/services/sqliteStorage";

import { supplementsApi } from "../services";
import {
  scheduleTimeReminder,
  cancelTimeReminder,
  cancelNextDoseReminder,
  saveSupplementReminderConfig,
  initializeSupplementNotifications,
} from "@shared/services/supplementReminders";
import type { SupplementSummary } from "../types";
import { MAX_DOSES_PER_DAY, formatInterval, parseTimeOfDay } from "../utils";
import { parseDecimal } from "@utils/format";
import ModalSheet from "@shared/components/ModalSheet";
import { useAlert } from "@shared/components/CustomAlert";
import { promptForExactAlarms } from "@shared/services/notifications";
import { useTheme } from "@shared/context/ThemeContext";
import { useAuth } from "@shared/context/AuthContext";
import type { ThemeColors } from "@shared/context/ThemeContext";
import { captureException, metric } from "@shared/services/crashReporting";
import { userFacingError } from "@shared/services/apiError";

type SupplementSettingsModalProps = {
  readonly visible: boolean;
  readonly supplement: SupplementSummary;
  readonly onClose: () => void;
  /** The message is shown by the parent screen: this component unmounts on save. */
  readonly onSaved?: (message?: string) => void;
};

type ValidationResult =
  | { valid: true; amount: number; intervalMinutes: number | null }
  | { valid: false };

export default function SupplementSettingsModal({
  visible,
  supplement,
  onClose,
  onSaved,
}: SupplementSettingsModalProps): React.JSX.Element | null {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { alert, AlertComponent } = useAlert();
  const { user } = useAuth();

  const [timeBasedEnabled, setTimeBasedEnabled] = useState(
    supplement.reminderEnabled,
  );
  const [reminderTime, setReminderTime] = useState(() =>
    parseTimeOfDay(supplement.reminderTime),
  );
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [defaultAmount, setDefaultAmount] = useState(
    String(supplement.defaultAmount),
  );
  const [dosesPerDay, setDosesPerDay] = useState(supplement.dosesPerDay);
  const [intervalHours, setIntervalHours] = useState(
    supplement.doseIntervalMinutes
      ? String(Math.round((supplement.doseIntervalMinutes / 60) * 100) / 100)
      : "",
  );
  const [notificationType, setNotificationType] = useState("notification");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible) return;
    void loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the modal opens for a supplement
  }, [visible, supplement.id]);

  const settingsKey = (uid: string | number) =>
    `supplementSettings_${supplement.id}_user_${uid}`;

  const applyStoredSettings = (raw: string) => {
    const stored = JSON.parse(raw) as {
      reminderTime?: string;
      notificationType?: string;
    };
    setNotificationType(stored.notificationType || "notification");
    if (!supplement.reminderTime && stored.reminderTime) {
      setReminderTime(parseTimeOfDay(stored.reminderTime));
    }
  };

  const loadLocalSettings = async () => {
    if (!user?.id) return;
    const raw = await getStorageItem(settingsKey(user.id));
    if (raw) applyStoredSettings(raw);
  };

  const loadSettings = async () => {
    setLoading(true);
    try {
      await loadLocalSettings();
    } catch (err) {
      console.error("Error loading supplement settings:", err);
      metric.count("supplements.settings_load_failed");
      captureException(err, { stage: "loadSupplementSettings" });
    } finally {
      setLoading(false);
    }
  };

  const validateForm = (): ValidationResult => {
    const amt = parseDecimal(defaultAmount);
    if (Number.isNaN(amt) || amt <= 0) {
      alert(
        "Invalid Amount",
        "Please enter a valid default amount.",
        [{ text: "OK" }],
        "error",
      );
      return { valid: false };
    }

    if (dosesPerDay <= 1 || !intervalHours.trim()) {
      return { valid: true, amount: amt, intervalMinutes: null };
    }
    const hours = parseDecimal(intervalHours);
    if (Number.isNaN(hours) || hours <= 0 || hours > 24) {
      alert(
        "Invalid Interval",
        "Time between doses must be between 0 and 24 hours, or left empty.",
        [{ text: "OK" }],
        "error",
      );
      return { valid: false };
    }
    return { valid: true, amount: amt, intervalMinutes: Math.round(hours * 60) };
  };

  const ensureNotificationPermission = async (): Promise<boolean> => {
    const notifReady = await initializeSupplementNotifications();
    if (!notifReady) {
      alert(
        "Notifications Required",
        "Please enable notifications for reminders to work.",
        [{ text: "OK" }],
        "warning",
      );
    } else {
      promptForExactAlarms(alert, "supplement reminders");
    }
    return notifReady;
  };

  const formatTimeStr = (date: Date) =>
    `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;

  const persistSettings = async (
    amt: number,
    intervalMinutes: number | null,
    timeStr: string,
    remindersOn: boolean,
  ) => {
    await supplementsApi.update(supplement.id, {
      defaultAmount: amt,
      dosesPerDay,
      doseIntervalMinutes: intervalMinutes,
      reminderEnabled: remindersOn,
      reminderTime: remindersOn ? timeStr : null,
    });
  };

  const persistLocalCache = async (
    userId: string,
    amt: number,
    timeStr: string,
    remindersOn: boolean,
  ) => {
    const stored = {
      timeBasedEnabled: remindersOn,
      reminderTime: timeStr,
      defaultAmount: amt,
      notificationType,
    };
    await setStorageItem(settingsKey(userId), JSON.stringify(stored));

    await saveSupplementReminderConfig(userId, {
      supplementId: supplement.id,
      name: supplement.name,
      unit: supplement.unit,
      defaultAmount: amt,
      timeBasedEnabled: remindersOn,
      reminderTime: timeStr,
      enabled: remindersOn,
      notificationType,
    });
  };

  const scheduleReminders = async (
    userId: string,
    amt: number,
    timeStr: string,
  ): Promise<boolean> => {
    const identifier = await scheduleTimeReminder(
      userId,
      supplement.id,
      supplement.name,
      amt,
      supplement.unit,
      timeStr,
      notificationType,
    );
    return identifier !== null;
  };

  const buildSuccessMessage = (timeStr: string, remindersOn: boolean): string =>
    remindersOn
      ? `${supplement.name} reminder settings saved! You'll be reminded daily at ${timeStr}.`
      : `${supplement.name} settings saved. Daily reminder is off.`;

  // `saving` is state, so `disabled` is not yet applied on a second tap while
  // the permission dialog is still resolving.
  const isSavingRef = useRef(false);

  const handleSave = async () => {
    if (isSavingRef.current) return;
    const validation = validateForm();
    if (!validation.valid) return;

    // Without a user id nothing would be persisted or scheduled, and the
    // success alert would say the opposite.
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

    // A refused notification permission must not throw away an unrelated dose
    // change: save what does not need notifications, and say what was skipped.
    const remindersOn =
      timeBasedEnabled && (await ensureNotificationPermission());
    // The dose timer is scheduled from the log button, which never prompts, so
    // the permission has to be asked for here.
    if (!timeBasedEnabled && validation.intervalMinutes !== null) {
      await initializeSupplementNotifications();
    }

    isSavingRef.current = true;
    setSaving(true);
    try {
      const timeStr = formatTimeStr(reminderTime);

      await persistSettings(
        validation.amount,
        validation.intervalMinutes,
        timeStr,
        remindersOn,
      );
      if (validation.intervalMinutes === null) {
        await cancelNextDoseReminder(userId, supplement.id);
      }
      await persistLocalCache(userId, validation.amount, timeStr, remindersOn);
      let scheduled = true;
      if (remindersOn) {
        scheduled = await scheduleReminders(userId, validation.amount, timeStr);
      } else {
        await cancelTimeReminder(userId, supplement.id);
      }

      if (!scheduled) {
        alert(
          "Warning",
          "Settings were saved, but the notification could not be scheduled. Please try again.",
          [{ text: "OK" }],
          "warning",
        );
        setSaving(false);
        return;
      }

      setTimeBasedEnabled(remindersOn);
      onSaved?.(buildSuccessMessage(timeStr, remindersOn));
    } catch (err) {
      alert(
        "Error",
        userFacingError(err, "Failed to save settings"),
        [{ text: "OK" }],
        "error",
      );
      setSaving(false);
    } finally {
      isSavingRef.current = false;
    }
  };

  const clearSupplementReminders = async (userId: string) => {
    // Cancelled first: if the update fails the OS-level reminder is already
    // off, rather than firing daily while the app believes it is disabled.
    await cancelTimeReminder(userId, supplement.id);
    await supplementsApi.update(supplement.id, {
      reminderEnabled: false,
      reminderTime: null,
    });
  };

  const clearLocalDisableState = async (userId: string) => {
    await removeStorageItem(settingsKey(userId));
    await saveSupplementReminderConfig(userId, {
      supplementId: supplement.id,
      name: supplement.name,
      unit: supplement.unit,
      defaultAmount:
        Number.parseFloat(defaultAmount) || supplement.defaultAmount,
      timeBasedEnabled: false,
      reminderTime: formatTimeStr(reminderTime),
      enabled: false,
    });
  };

  const performDisable = async () => {
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
    try {
      await clearSupplementReminders(userId);
      await clearLocalDisableState(userId);
      setTimeBasedEnabled(false);
      onSaved?.(`Reminders for ${supplement.name} have been turned off.`);
    } catch (err) {
      alert(
        "Error",
        userFacingError(err, "Failed"),
        [{ text: "OK" }],
        "error",
      );
    }
  };

  const handleDisable = () => {
    alert(
      "Disable Reminders",
      `Turn off all reminders for ${supplement.name}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disable",
          style: "destructive",
          onPress: () => void performDisable(),
        },
      ],
      "warning",
    );
  };

  const handleTimeChange = (_event: unknown, selectedDate: Date) => {
    setShowTimePicker(Platform.OS === "ios");
    setReminderTime(selectedDate);
  };

  if (!visible) return null;

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      fullHeight={true}
      showCancelButton={false}
      showConfirmButton={false}
      title={`${supplement.icon || "💊"} ${supplement.name}`}
    >
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size='large' color={colors.accent} />
          </View>
        ) : (
          <>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.heroBanner}>
                <Text style={styles.heroIcon}>{supplement.icon || "💊"}</Text>
                <Text style={styles.heroTitle}>Reminder Settings</Text>
                <Text style={styles.heroSubtitle}>
                  Set up a daily reminder so you never miss a dose of{" "}
                  {supplement.name}.
                </Text>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  {dosesPerDay > 1 ? "Amount per Dose" : "Default Amount"}
                </Text>
                <View style={styles.amountRow}>
                  <TextInput
                    style={styles.amountInput}
                    value={defaultAmount}
                    onChangeText={setDefaultAmount}
                    keyboardType='decimal-pad'
                    placeholder={String(supplement.defaultAmount)}
                    placeholderTextColor={colors.textMuted}
                  />
                  <View style={styles.amountUnit}>
                    <Text style={styles.amountUnitText}>{supplement.unit}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionHeaderLeft}>
                    <Text style={styles.sectionIcon}>🔁</Text>
                    <View>
                      <Text style={styles.sectionTitle}>Doses per Day</Text>
                      <Text style={styles.sectionSubtitle}>
                        Split the daily intake into several doses
                      </Text>
                    </View>
                  </View>
                  <View style={styles.stepper}>
                    <TouchableOpacity
                      style={styles.stepperBtn}
                      hitSlop={6}
                      onPress={() => setDosesPerDay((n) => Math.max(1, n - 1))}
                      disabled={dosesPerDay <= 1}
                      accessibilityRole='button'
                      accessibilityLabel='Fewer doses per day'
                    >
                      <Text style={styles.stepperBtnText}>−</Text>
                    </TouchableOpacity>
                    <Text
                      style={styles.stepperValue}
                      accessibilityLabel={`${dosesPerDay} doses per day`}
                    >
                      {dosesPerDay}
                    </Text>
                    <TouchableOpacity
                      style={styles.stepperBtn}
                      hitSlop={6}
                      onPress={() =>
                        setDosesPerDay((n) => Math.min(MAX_DOSES_PER_DAY, n + 1))
                      }
                      disabled={dosesPerDay >= MAX_DOSES_PER_DAY}
                      accessibilityRole='button'
                      accessibilityLabel='More doses per day'
                    >
                      <Text style={styles.stepperBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {dosesPerDay > 1 && (
                  <View style={styles.sectionBody}>
                    <Text style={styles.sectionSubtitle}>
                      Time between doses (hours)
                    </Text>
                    <View style={styles.amountRow}>
                      <TextInput
                        style={styles.amountInput}
                        value={intervalHours}
                        onChangeText={setIntervalHours}
                        keyboardType='decimal-pad'
                        placeholder='No timer'
                        placeholderTextColor={colors.textMuted}
                        accessibilityLabel='Hours between doses'
                      />
                      <View style={styles.amountUnit}>
                        <Text style={styles.amountUnitText}>h</Text>
                      </View>
                    </View>
                    <Text style={styles.sectionSubtitle}>
                      {(() => {
                        const hours = parseDecimal(intervalHours);
                        const total = (
                          dosesPerDay * (parseDecimal(defaultAmount) || 0)
                        ).toLocaleString();
                        return hours > 0
                          ? `${total} ${supplement.unit} a day. After each dose you'll get a notification when the next is due in ${formatInterval(Math.round(hours * 60))}.`
                          : `${total} ${supplement.unit} a day. Leave empty to take doses whenever you like.`;
                      })()}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionHeaderLeft}>
                    <Text style={styles.sectionIcon}>🕐</Text>
                    <View>
                      <Text style={styles.sectionTitle}>
                        Time-Based Reminder
                      </Text>
                      <Text style={styles.sectionSubtitle}>
                        Remind daily at a specific time
                      </Text>
                    </View>
                  </View>
                  <Switch
                    value={timeBasedEnabled}
                    onValueChange={setTimeBasedEnabled}
                    trackColor={{
                      false: colors.surfaceBorder,
                      true: colors.accent,
                    }}
                    thumbColor='#fff'
                  />
                </View>

                {timeBasedEnabled && (
                  <View style={styles.sectionBody}>
                    <TouchableOpacity
                      style={styles.timeBtn}
                      onPress={() => setShowTimePicker(true)}
                    >
                      <Text style={styles.timeBtnLabel}>Reminder Time</Text>
                      <Text style={styles.timeBtnValue}>
                        {reminderTime.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Text>
                    </TouchableOpacity>
                    {showTimePicker && (
                      <DateTimePicker
                        value={reminderTime}
                        mode='time'
                        is24Hour
                        display='default'
                        onValueChange={handleTimeChange}
                        onDismiss={() => setShowTimePicker(false)}
                      />
                    )}
                  </View>
                )}
              </View>

              {timeBasedEnabled && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Notification Type</Text>
                  <View style={styles.notifRow}>
                    {[
                      {
                        key: "notification",
                        icon: "🔔",
                        label: "Notification",
                        desc: "Standard alert",
                      },
                      {
                        key: "alarm",
                        icon: "⏰",
                        label: "Alarm",
                        desc: "Louder alert",
                      },
                    ].map((opt) => (
                      <TouchableOpacity
                        key={opt.key}
                        style={[
                          styles.notifOption,
                          notificationType === opt.key &&
                            styles.notifOptionActive,
                        ]}
                        onPress={() => setNotificationType(opt.key)}
                      >
                        <Text style={styles.notifIcon}>{opt.icon}</Text>
                        <Text
                          style={[
                            styles.notifLabel,
                            notificationType === opt.key &&
                              styles.notifLabelActive,
                          ]}
                        >
                          {opt.label}
                        </Text>
                        <Text style={styles.notifDesc}>{opt.desc}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {timeBasedEnabled && (
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryTitle}>📋 Summary</Text>
                  <Text style={styles.summaryText}>
                    You'll be reminded to take {dosesPerDay > 1 && "the first dose of "}{supplement.name} daily at{" "}
                    {reminderTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.
                  </Text>
                </View>
              )}

              {supplement.reminderEnabled && (
                <TouchableOpacity
                  style={styles.disableBtn}
                  onPress={handleDisable}
                >
                  <Text style={styles.disableBtnText}>
                    Turn off all reminders
                  </Text>
                </TouchableOpacity>
              )}
            </ScrollView>

            <View style={styles.footer}>
              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color='#fff' />
                ) : (
                  <Text style={styles.saveBtnText}>✓ Save Settings</Text>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}

        {AlertComponent}
      </View>
    </ModalSheet>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    loadingContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },

    content: { padding: 10, paddingBottom: 20 },

    heroBanner: {
      backgroundColor: colors.infoLight,
      borderRadius: 16,
      padding: 20,
      alignItems: "center",
      marginBottom: 24,
    },
    heroIcon: { fontSize: 48, marginBottom: 10 },
    heroTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.textPrimary,
      marginBottom: 6,
    },
    heroSubtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: "center",
      lineHeight: 20,
    },

    section: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      marginBottom: 14,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    sectionHeaderLeft: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      gap: 12,
    },
    sectionIcon: { fontSize: 24 },
    sectionTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    sectionSubtitle: {
      fontSize: 13,
      color: colors.textMuted,
      marginTop: 2,
    },
    sectionBody: { marginTop: 16, gap: 12 },

    amountRow: {
      flexDirection: "row",
      marginTop: 10,
      gap: 10,
      alignItems: "center",
    },
    amountInput: {
      flex: 1,
      backgroundColor: colors.inputBackground,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 20,
      fontWeight: "700",
      color: colors.textPrimary,
      borderWidth: 1,
      borderColor: colors.inputBorder,
    },
    amountUnit: {
      backgroundColor: colors.inputBackground,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: colors.inputBorder,
    },
    amountUnitText: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.textMuted,
    },

    stepper: { flexDirection: "row", alignItems: "center", gap: 10 },
    stepperBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.inputBackground,
      borderWidth: 1,
      borderColor: colors.inputBorder,
    },
    stepperBtnText: { fontSize: 20, fontWeight: "700", color: colors.accent },
    stepperValue: {
      minWidth: 22,
      textAlign: "center",
      fontSize: 18,
      fontWeight: "700",
      color: colors.textPrimary,
    },

    timeBtn: {
      backgroundColor: colors.inputBackground,
      borderRadius: 12,
      padding: 16,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      borderWidth: 2,
      borderColor: colors.accent,
    },
    timeBtnLabel: {
      fontSize: 14,
      color: colors.textSecondary,
      fontWeight: "600",
    },
    timeBtnValue: {
      fontSize: 24,
      fontWeight: "700",
      color: colors.accent,
    },

    notifRow: {
      flexDirection: "row",
      gap: 12,
      marginTop: 10,
    },
    notifOption: {
      flex: 1,
      backgroundColor: colors.inputBackground,
      borderRadius: 12,
      padding: 14,
      alignItems: "center",
      borderWidth: 2,
      borderColor: colors.inputBorder,
    },
    notifOptionActive: {
      backgroundColor: colors.infoLight,
      borderColor: colors.accent,
    },
    notifIcon: { fontSize: 28, marginBottom: 6 },
    notifLabel: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.textSecondary,
      marginBottom: 3,
    },
    notifLabelActive: { color: colors.accent },
    notifDesc: {
      fontSize: 11,
      color: colors.textMuted,
      textAlign: "center",
    },

    summaryCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 2,
      borderColor: colors.accent,
      marginBottom: 14,
    },
    summaryTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.textPrimary,
      marginBottom: 8,
    },
    summaryText: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
    },

    disableBtn: {
      padding: 16,
      alignItems: "center",
      marginBottom: 8,
    },
    disableBtnText: {
      fontSize: 15,
      color: colors.error,
      fontWeight: "600",
    },

    footer: {
      padding: 20,
      paddingBottom: Platform.OS === "ios" ? 34 : 20,
      borderTopWidth: 1,
      borderTopColor: colors.inputBorder,
      backgroundColor: colors.surface,
    },
    saveBtn: {
      backgroundColor: colors.accent,
      paddingVertical: 16,
      borderRadius: 14,
      alignItems: "center",
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 6,
    },
    saveBtnText: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.surface,
    },
  });
