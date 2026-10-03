import React from "react";
import { View, Text, Pressable } from "react-native";
import { useTheme } from "@shared/context/ThemeContext";
import { useAlert } from "@shared/components/CustomAlert";
import type { Watcher } from "@shared/context/hooks/useJointSession";
import { makeTrainerBannerStyles } from "./TrainerBanner";

interface WatchersBannerProps {
  readonly watchers: Watcher[];
  readonly onBlock: (watcherId: string) => Promise<void>;
}

export function WatchersBanner({
  watchers,
  onBlock,
}: WatchersBannerProps): React.JSX.Element {
  const { colors } = useTheme();
  const { alert, AlertComponent } = useAlert();
  const styles = makeTrainerBannerStyles(colors);

  return (
    <>
      {watchers.map((w) => (
        <View key={w.id} style={styles.container}>
          <View style={styles.liveDot} />
          <Text style={styles.label} numberOfLines={1}>
            <Text style={styles.name}>{w.username}</Text>
            {"  "}
            <Text style={styles.status}>is watching this workout</Text>
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Stop ${w.username} watching`}
            hitSlop={8}
            onPress={() =>
              onBlock(w.id).catch(() =>
                alert(
                  "Couldn't stop watching",
                  "Check your connection and try again.",
                  undefined,
                  "error",
                ),
              )
            }
          >
            <Text style={[styles.name, { color: colors.error }]}>Stop</Text>
          </Pressable>
        </View>
      ))}
      {AlertComponent}
    </>
  );
}
