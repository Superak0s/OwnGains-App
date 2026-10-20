import React, { useMemo } from "react";
import { StyleSheet, Text } from "react-native";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";

type TrainerLoggedBadgeProps = {
  readonly loggedByTrainerId?: string | null;
  readonly loggedByTrainerUsername?: string | null;
  readonly verb?: string;
};

export const trainerLoggedLabel = ({
  loggedByTrainerId,
  loggedByTrainerUsername,
  verb = "Logged",
}: TrainerLoggedBadgeProps): string | null =>
  loggedByTrainerId && loggedByTrainerUsername ? `${verb} by @${loggedByTrainerUsername}` : null;

export function TrainerLoggedBadge(props: TrainerLoggedBadgeProps): React.JSX.Element | null {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const label = trainerLoggedLabel(props);
  if (!label) return null;
  return (
    <Text style={styles.badge} accessibilityLabel={label}>
      🧑‍🏫 {label}
    </Text>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    badge: {
      alignSelf: "flex-start",
      marginTop: 4,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
      overflow: "hidden",
      fontSize: 13,
      fontWeight: "600",
      color: colors.info,
      backgroundColor: colors.infoLight,
    },
  });
