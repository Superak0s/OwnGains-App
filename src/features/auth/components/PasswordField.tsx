import React, { useMemo, useState, type Ref } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
  type TextInputInstance,
} from "react-native";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";

type Props = Omit<TextInputProps, "style" | "secureTextEntry"> & {
  readonly ref?: Ref<TextInputInstance>;
  readonly style?: StyleProp<ViewStyle>;
  /** What the show/hide button reveals, read out as "Show <toggleLabel>". */
  readonly toggleLabel: string;
};

/** Password input with a button that shows or hides what was typed. */
export default function PasswordField({
  ref,
  style,
  toggleLabel,
  ...input
}: Props): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [shown, setShown] = useState(false);

  return (
    <View style={[styles.container, style]}>
      <TextInput
        ref={ref}
        style={styles.input}
        placeholderTextColor={colors.textMuted}
        autoCapitalize='none'
        {...input}
        secureTextEntry={!shown}
      />
      <TouchableOpacity
        style={styles.eyeButton}
        onPress={() => setShown(!shown)}
        disabled={input.editable === false}
        accessibilityRole='button'
        accessibilityLabel={`${shown ? "Hide" : "Show"} ${toggleLabel}`}
      >
        <Text style={styles.eyeIcon}>{shown ? "🙈" : "👁️"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    input: {
      flex: 1,
      padding: 16,
      fontSize: 16,
      color: colors.textPrimary,
    },
    eyeButton: { padding: 16 },
    eyeIcon: { fontSize: 20 },
  });
