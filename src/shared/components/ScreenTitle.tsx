import { useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useTheme, type ThemeColors } from "../context/ThemeContext";

interface ScreenTitleProps {
  readonly title: string;
  readonly subtitle?: string | null;
  readonly style?: StyleProp<ViewStyle>;
}

export default function ScreenTitle({
  title,
  subtitle,
  style,
}: ScreenTitleProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.title} accessibilityRole='header'>
        {title}
      </Text>
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
    subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  });
