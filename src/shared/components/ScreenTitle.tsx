import { useMemo } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useTheme, type ThemeColors } from "../context/ThemeContext";

interface ScreenTitleProps {
  readonly title: string;
  readonly subtitle?: string | null;
  readonly style?: StyleProp<ViewStyle>;
  /** Turns the title into a dropdown trigger with a chevron. */
  readonly onPress?: () => void;
  readonly accessibilityHint?: string;
}

export default function ScreenTitle({
  title,
  subtitle,
  style,
  onPress,
  accessibilityHint,
}: ScreenTitleProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const heading = (
    <Text style={styles.title} accessibilityRole='header' numberOfLines={1}>
        {title}
      {onPress ? <Text style={styles.chevron}>{"  ▾"}</Text> : null}
      </Text>
  );
  return (
    <View style={[styles.container, style]}>
      {onPress ? (
        <TouchableOpacity
          onPress={onPress}
          style={styles.trigger}
          accessibilityRole='button'
          accessibilityLabel={title}
          accessibilityHint={accessibilityHint}
        >
          {heading}
        </TouchableOpacity>
      ) : (
        heading
      )}
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { marginBottom: 16 },
    title: {
      fontSize: 28,
      fontWeight: "800",
      letterSpacing: -0.5,
      color: colors.textPrimary,
    },
    trigger: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center" },
    chevron: { fontSize: 20, color: colors.accent },
    subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  });
