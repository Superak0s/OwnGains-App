import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import ScreenTitle from "@shared/components/ScreenTitle";
import { WorkoutProvider } from "@shared/context/WorkoutContext";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";
import { reportAndReturn } from "@shared/services/crashReporting";
import AnalyticsScreen from "@features/analytics/AnalyticsScreen";
import { TrackingViewProvider } from "@features/tracking/TrackingApisContext";
import ClientPickerSheet from "./components/ClientPickerSheet";
import { trainerApi, type ClientSummary } from "./services";
import { toDateKey, weekStart } from "./utils/roster";
import { clientTrackingApis } from "./utils/trackingView";

/** A client's Progress, switched from a searchable sheet opened by tapping the title. */
export default function TrainerAnalyticsScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [clients, setClients] = useState<ClientSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      trainerApi
        .getClients(toDateKey(weekStart(new Date())))
        .then((roster) => {
          if (active) setClients(roster);
        })
        .catch(reportAndReturn(undefined, { stage: "trainerAnalytics" }));
      return () => {
        active = false;
      };
    }, []),
  );

  const shown = clients?.find((c) => c.userId === selectedId) ?? clients?.[0];
  // Body weight comes from the client's last sent tracking copy, never the trainer's own.
  const view = useMemo(
    () => shown && { apis: clientTrackingApis(shown.userId), readOnly: null },
    [shown],
  );
  const choose = (id: string | null) => {
    if (id) setSelectedId(id);
    setPicking(false);
  };

  return (
    <>
      {shown && view ? (
        <WorkoutProvider key={shown.userId} actAs={shown}>
          <TrackingViewProvider value={view}>
            <AnalyticsScreen title={`${shown.username}'s progress`} onTitlePress={() => setPicking(true)} />
          </TrackingViewProvider>
        </WorkoutProvider>
      ) : (
        <SafeAreaView style={styles.empty} edges={["top"]}>
          <ScreenTitle title="Progress" />
          {clients && <Text style={styles.detail}>{"A client shows up here once they accept your trainer request."}</Text>}
        </SafeAreaView>
      )}
      <ClientPickerSheet
        visible={picking}
        onClose={() => setPicking(false)}
        title="Show progress for"
        clients={clients ?? []}
        selectedId={shown?.userId ?? null}
        onChoose={choose}
        emptyText="A client shows up here once they accept your trainer request."
      />
    </>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    empty: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 20, paddingTop: 12 },
    detail: { color: colors.textSecondary, fontSize: 13 },
  });
