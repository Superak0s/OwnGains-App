import React, { useState } from "react";
import { Text, TextInput, type TextStyle } from "react-native";
import { useTheme } from "@shared/context/ThemeContext";
import ModalSheet from "@shared/components/ModalSheet";
import { PASSWORD_RULE_TEXT } from "@features/auth/utils/passwordPolicy";

// An export file is offline and brute-forceable at the attacker's own pace, so
// the passphrase is the only thing setting its strength.
export const MIN_EXPORT_PASSPHRASE = 12;

interface FormSheetStyles {
  readonly input: TextStyle;
  readonly modalDescription: TextStyle;
}

interface SheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly busy?: boolean;
  readonly styles: FormSheetStyles;
}

// Resetting on every open/close means the parent closing the sheet after a
// successful submit is enough to clear it, including when an alert confirms later.
function useSheetForm<T extends object>(visible: boolean, initial: T) {
  const [form, setForm] = useState(initial);
  const [shownFor, setShownFor] = useState(visible);
  if (shownFor !== visible) {
    setShownFor(visible);
    setForm(initial);
  }
  const field =
    <K extends keyof T>(key: K) =>
    (value: T[K]) =>
      setForm((current) => ({ ...current, [key]: value }));
  return [form, field] as const;
}

export interface PasswordChangeInput {
  current: string;
  next: string;
  confirm: string;
}

export function ChangePasswordModal({
  visible,
  onClose,
  onSubmit,
  busy,
  styles,
}: SheetProps & {
  readonly onSubmit: (input: PasswordChangeInput) => void;
}) {
  const { colors } = useTheme();
  const [form, field] = useSheetForm<PasswordChangeInput>(visible, {
    current: "",
    next: "",
    confirm: "",
  });
  const secureProps = {
    style: styles.input,
    secureTextEntry: true,
    autoCapitalize: "none" as const,
    placeholderTextColor: colors.textMuted,
  };
  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Change Password"
      dirty={!!(form.current || form.next || form.confirm)}
      onConfirm={() => onSubmit(form)}
      confirmText={busy ? "Saving..." : "Change Password"}
      confirmDisabled={busy}
    >
      <Text style={styles.modalDescription}>
        Your new password must have {PASSWORD_RULE_TEXT}. Every other
        signed-in device will be signed out.
      </Text>
      <TextInput
        {...secureProps}
        value={form.current}
        onChangeText={field("current")}
        placeholder="Current password"
        accessibilityLabel="Current password"
      />
      <TextInput
        {...secureProps}
        value={form.next}
        onChangeText={field("next")}
        placeholder="New password"
        accessibilityLabel="New password"
      />
      <TextInput
        {...secureProps}
        value={form.confirm}
        onChangeText={field("confirm")}
        placeholder="Confirm new password"
        accessibilityLabel="Confirm new password"
      />
    </ModalSheet>
  );
}

export interface DeleteAccountInput {
  password: string;
  confirmText: string;
}

export const isDeleteConfirmed = (confirmText: string): boolean =>
  confirmText.trim().toUpperCase() === "DELETE";

export function DeleteAccountModal({
  visible,
  onClose,
  onSubmit,
  busy,
  isOffline,
  styles,
}: SheetProps & {
  readonly onSubmit: (input: DeleteAccountInput) => void;
  readonly isOffline: boolean;
}) {
  const { colors } = useTheme();
  const [form, field] = useSheetForm<DeleteAccountInput>(visible, {
    password: "",
    confirmText: "",
  });
  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Delete Account"
      onConfirm={() => onSubmit(form)}
      confirmText={busy ? "Deleting…" : "Delete Forever"}
      confirmDisabled={
        busy || (isOffline && !isDeleteConfirmed(form.confirmText))
      }
    >
      <Text style={styles.modalDescription}>
        {isOffline
          ? "This permanently deletes your local profile and every workout, photo, and reminder stored on this device. It cannot be undone, and there is no server copy to restore from."
          : "This permanently deletes your account on the server along with every workout, photo, reminder, and friend connection. It cannot be undone."}
      </Text>
      {isOffline ? (
        <>
          {/* An offline profile has no password, so typing the word is the
              only deliberate step available for the most destructive action
              in the app. */}
          <Text style={styles.modalDescription}>Type DELETE to confirm.</Text>
          <TextInput
            style={styles.input}
            value={form.confirmText}
            onChangeText={field("confirmText")}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="DELETE"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Type DELETE to confirm account deletion"
          />
        </>
      ) : (
        <TextInput
          style={styles.input}
          value={form.password}
          onChangeText={field("password")}
          secureTextEntry
          autoCapitalize="none"
          placeholder="Current password"
          accessibilityLabel="Current password to confirm account deletion"
          placeholderTextColor={colors.textMuted}
        />
      )}
    </ModalSheet>
  );
}

export function ClearDataPasswordModal({
  visible,
  onClose,
  onSubmit,
  busy,
  styles,
}: SheetProps & {
  readonly onSubmit: (password: string) => void;
}) {
  const { colors } = useTheme();
  const [form, field] = useSheetForm(visible, { password: "" });
  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Clear All Data"
      onConfirm={() => onSubmit(form.password)}
      confirmText={busy ? "Clearing…" : "Clear Everything"}
      confirmDisabled={busy || !form.password}
    >
      <Text style={styles.modalDescription}>
        Enter your password to delete your data on this device and on the
        server. Your account stays.
      </Text>
      <TextInput
        style={styles.input}
        value={form.password}
        onChangeText={field("password")}
        secureTextEntry
        autoCapitalize="none"
        placeholder="Current password"
        accessibilityLabel="Current password to confirm clearing all data"
        placeholderTextColor={colors.textMuted}
      />
    </ModalSheet>
  );
}

export function ExportPassphraseModal({
  visible,
  onClose,
  onSubmit,
  busy,
  styles,
}: SheetProps & {
  readonly onSubmit: (passphrase: string, confirm: string) => void;
}) {
  const { colors } = useTheme();
  const [form, field] = useSheetForm(visible, { passphrase: "", confirm: "" });
  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Export My Data"
      dirty={!!(form.passphrase || form.confirm)}
      onConfirm={() => onSubmit(form.passphrase, form.confirm)}
      confirmText={busy ? "Exporting…" : "Export"}
      confirmDisabled={busy}
    >
      <Text style={styles.modalDescription}>
        The export holds your email, workout history, measurements and progress
        photos, so it is encrypted with a passphrase you choose. Use at least{" "}
        {MIN_EXPORT_PASSPHRASE} characters. A forgotten passphrase cannot be
        recovered and the backup would be unreadable.
      </Text>
      <TextInput
        style={styles.input}
        value={form.passphrase}
        onChangeText={field("passphrase")}
        secureTextEntry
        autoCapitalize="none"
        placeholder="Passphrase"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Export passphrase"
      />
      <TextInput
        style={styles.input}
        value={form.confirm}
        onChangeText={field("confirm")}
        secureTextEntry
        autoCapitalize="none"
        placeholder="Confirm passphrase"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Confirm export passphrase"
      />
    </ModalSheet>
  );
}

export function RestorePassphraseModal({
  visible,
  onClose,
  onSubmit,
  busy,
  styles,
}: SheetProps & {
  readonly onSubmit: (passphrase: string) => void;
}) {
  const { colors } = useTheme();
  const [form, field] = useSheetForm(visible, { passphrase: "" });
  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Encrypted Backup"
      dirty={!!form.passphrase}
      onConfirm={() => onSubmit(form.passphrase)}
      confirmText={busy ? "Unlocking…" : "Unlock"}
      confirmDisabled={busy}
    >
      <Text style={styles.modalDescription}>
        This backup is encrypted. Enter the passphrase you set when you exported
        it.
      </Text>
      <TextInput
        style={styles.input}
        value={form.passphrase}
        onChangeText={field("passphrase")}
        secureTextEntry
        autoCapitalize="none"
        placeholder="Passphrase"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Backup passphrase"
      />
    </ModalSheet>
  );
}

export const parseTimeBetweenSets = (raw: string): number | null => {
  const value = Number.parseInt(raw, 10);
  return value > 0 && value <= 600 ? value : null;
};

export function TimeBetweenSetsModal({
  visible,
  onClose,
  onSave,
  current,
  styles,
}: SheetProps & {
  readonly onSave: (seconds: number) => void;
  readonly current: number;
}) {
  const { colors } = useTheme();
  const initial = String(current ?? "");
  const [form, field] = useSheetForm(visible, { seconds: initial });
  const parsed = parseTimeBetweenSets(form.seconds);
  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Time Between Sets"
      dirty={form.seconds !== initial}
      onConfirm={() => {
        if (parsed !== null) onSave(parsed);
      }}
      confirmText="Save"
      confirmDisabled={parsed === null}
    >
      <Text style={styles.modalDescription}>
        How many seconds does it typically take from finishing one set to
        finishing the next? (includes rest time + actual exercise time) Anything
        from 1 to 600 seconds.
      </Text>
      <TextInput
        style={styles.input}
        value={form.seconds}
        onChangeText={field("seconds")}
        keyboardType="number-pad"
        maxLength={3}
        placeholder="120"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Seconds between sets"
      />
    </ModalSheet>
  );
}
