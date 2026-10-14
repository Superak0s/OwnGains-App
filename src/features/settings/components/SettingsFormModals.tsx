import { useState, type ComponentProps } from "react";
import { Text, TextInput, type TextStyle } from "react-native";
import { useTheme } from "@shared/context/ThemeContext";
import ModalSheet from "@shared/components/ModalSheet";
import {
  PASSWORD_RULE_TEXT,
  passwordPolicyError,
} from "@features/auth/utils/passwordPolicy";

// An export file is offline and brute-forceable at the attacker's own pace, so
// the passphrase is the only thing setting its strength.
export const MIN_EXPORT_PASSPHRASE = 12;

interface FormSheetStyles {
  readonly input: TextStyle;
  readonly modalDescription: TextStyle;
  readonly fieldLabel: TextStyle;
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

function LabeledInput({
  label,
  hint,
  styles,
  ...input
}: ComponentProps<typeof TextInput> & {
  readonly label: string;
  readonly hint?: string | null;
  readonly styles: FormSheetStyles;
}) {
  const { colors } = useTheme();
  return (
    <>
      <Text style={styles.fieldLabel} importantForAccessibility="no">
        {label}
      </Text>
      <TextInput
        style={styles.input}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={label}
        accessibilityHint={hint ?? undefined}
        {...input}
      />
      {hint ? (
        <Text
          style={{ color: colors.error, fontSize: 13, marginTop: -6, marginBottom: 10 }}
          accessibilityLiveRegion="polite"
        >
          {hint}
        </Text>
      ) : null}
    </>
  );
}

export interface PasswordChangeInput {
  current: string;
  next: string;
  confirm: string;
}

export function passwordChangeHints(form: PasswordChangeInput): {
  next: string | null;
  confirm: string | null;
} {
  return {
    next: form.next ? passwordPolicyError(form.next) : null,
    confirm:
      form.confirm && form.confirm !== form.next
        ? "The passwords do not match"
        : null,
  };
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
  const [form, field] = useSheetForm<PasswordChangeInput>(visible, {
    current: "",
    next: "",
    confirm: "",
  });
  const hints = passwordChangeHints(form);
  const secureProps = {
    styles,
    secureTextEntry: true,
    autoCapitalize: "none" as const,
  };
  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Change Password"
      dirty={!!(form.current || form.next || form.confirm)}
      onConfirm={() => onSubmit(form)}
      confirmText={busy ? "Saving..." : "Change Password"}
      confirmDisabled={busy || !!hints.next || !!hints.confirm}
    >
      <Text style={styles.modalDescription}>
        Your new password must have {PASSWORD_RULE_TEXT}. Every other
        signed-in device will be signed out.
      </Text>
      <LabeledInput
        {...secureProps}
        label="Current password"
        value={form.current}
        onChangeText={field("current")}
      />
      <LabeledInput
        {...secureProps}
        label="New password"
        hint={hints.next}
        value={form.next}
        onChangeText={field("next")}
      />
      <LabeledInput
        {...secureProps}
        label="Confirm new password"
        hint={hints.confirm}
        value={form.confirm}
        onChangeText={field("confirm")}
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
  googleOnly,
  styles,
}: SheetProps & {
  readonly onSubmit: (input: DeleteAccountInput) => void;
  readonly isOffline: boolean;
  /** The account has no password, so a fresh Google sign-in confirms instead. */
  readonly googleOnly: boolean;
}) {
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
        busy ||
        (isOffline
          ? !isDeleteConfirmed(form.confirmText)
          : !googleOnly && !form.password)
      }
    >
      <Text style={styles.modalDescription}>
        {isOffline
          ? "This permanently deletes your local profile and every workout, photo, and reminder stored on this device. It cannot be undone, and there is no server copy to restore from."
          : "This permanently deletes your account on the server along with every workout, photo, reminder, and friend connection. It cannot be undone."}
      </Text>
      {isOffline ? (
        // An offline profile has no password, so typing the word is the only
        // deliberate step available for the most destructive action in the app.
        <LabeledInput
          styles={styles}
          label="Type DELETE to confirm"
          value={form.confirmText}
          onChangeText={field("confirmText")}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="DELETE"
          accessibilityLabel="Type DELETE to confirm account deletion"
        />
      ) : googleOnly ? (
        <Text style={styles.modalDescription}>
          You will be asked to sign in with Google to confirm.
        </Text>
      ) : (
        <LabeledInput
          styles={styles}
          label="Current password"
          value={form.password}
          onChangeText={field("password")}
          secureTextEntry
          autoCapitalize="none"
          accessibilityLabel="Current password to confirm account deletion"
        />
      )}
    </ModalSheet>
  );
}

export function UnlinkGoogleModal({
  visible,
  onClose,
  onSubmit,
  busy,
  styles,
}: SheetProps & {
  readonly onSubmit: (password: string) => void;
}) {
  const [form, field] = useSheetForm(visible, { password: "" });
  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Unlink Google"
      onConfirm={() => onSubmit(form.password)}
      confirmText={busy ? "Unlinking…" : "Unlink"}
      confirmDisabled={busy || !form.password}
    >
      <Text style={styles.modalDescription}>
        You will sign in with your password only. Signing in with Google again later asks for this password to link it back.
      </Text>
      <LabeledInput
        styles={styles}
        label="Current password"
        value={form.password}
        onChangeText={field("password")}
        secureTextEntry
        autoCapitalize="none"
        accessibilityLabel="Current password to confirm unlinking Google"
      />
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
      <LabeledInput
        styles={styles}
        label="Current password"
        value={form.password}
        onChangeText={field("password")}
        secureTextEntry
        autoCapitalize="none"
        accessibilityLabel="Current password to confirm clearing all data"
      />
    </ModalSheet>
  );
}

export function exportPassphraseHints(
  passphrase: string,
  confirm: string,
): { passphrase: string | null; confirm: string | null } {
  return {
    passphrase:
      passphrase && passphrase.length < MIN_EXPORT_PASSPHRASE
        ? `Use at least ${MIN_EXPORT_PASSPHRASE} characters`
        : null,
    confirm:
      confirm && confirm !== passphrase ? "The passphrases do not match" : null,
  };
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
  const [form, field] = useSheetForm(visible, { passphrase: "", confirm: "" });
  const hints = exportPassphraseHints(form.passphrase, form.confirm);
  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Export My Data"
      dirty={!!(form.passphrase || form.confirm)}
      onConfirm={() => onSubmit(form.passphrase, form.confirm)}
      confirmText={busy ? "Exporting…" : "Export"}
      confirmDisabled={busy || !!hints.passphrase || !!hints.confirm}
    >
      <Text style={styles.modalDescription}>
        The export holds your email, workout history, measurements and progress
        photos. Choose a passphrase of at least {MIN_EXPORT_PASSPHRASE}{" "}
        characters to encrypt it, or leave both fields empty to export without
        encryption (not recommended). A forgotten passphrase cannot be
        recovered and the backup would be unreadable.
      </Text>
      <LabeledInput
        styles={styles}
        label="Passphrase"
        hint={hints.passphrase}
        value={form.passphrase}
        onChangeText={field("passphrase")}
        secureTextEntry
        autoCapitalize="none"
        accessibilityLabel="Export passphrase"
      />
      <LabeledInput
        styles={styles}
        label="Confirm passphrase"
        hint={hints.confirm}
        value={form.confirm}
        onChangeText={field("confirm")}
        secureTextEntry
        autoCapitalize="none"
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
      <LabeledInput
        styles={styles}
        label="Passphrase"
        value={form.passphrase}
        onChangeText={field("passphrase")}
        secureTextEntry
        autoCapitalize="none"
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
        Seconds from finishing one set to finishing the next, rest included. 1
        to 600.
      </Text>
      <LabeledInput
        styles={styles}
        label="Seconds between sets"
        hint={form.seconds && parsed === null ? "Enter 1 to 600 seconds" : null}
        value={form.seconds}
        onChangeText={field("seconds")}
        keyboardType="number-pad"
        maxLength={3}
        placeholder="120"
      />
    </ModalSheet>
  );
}
