import React, { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { reportAndReturn } from "@shared/services/crashReporting";
import { formatDateTime, toDateString } from "@utils/format";
import TrackingScreen from "@features/tracking/TrackingScreen";
import { TrackingViewProvider, type TrackingView } from "@features/tracking/TrackingApisContext";
import ClientPickerSheet from "./components/ClientPickerSheet";
import { trainerApi } from "./services";
import { weekStart } from "@utils/dayCompletion";
import { loadTrackingCopy, syncTrackingInbox, unpackTrackingCopy } from "./utils/trackingInbox";
import { clientTrackingApis } from "./utils/trackingView";

interface ClientChoice {
  readonly userId: string;
  readonly username: string;
  /** Null until the client's phone has sent their tracking. */
  readonly view: TrackingView | null;
}

/** The trainer's own Tracking, or a client's, switched from a searchable sheet opened by tapping the title. */
export default function TrainerTrackingScreen(): React.JSX.Element {
  const [clients, setClients] = useState<ClientChoice[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        const roster = (await trainerApi.getClients(toDateString(weekStart()))).filter(
          (c) => c.hasTrackingAccess,
        );
        await syncTrackingInbox().catch(reportAndReturn([], { stage: "trackingInbox" }));
        const choices: ClientChoice[] = [];
        for (const c of roster) {
          const copy = await loadTrackingCopy(c.userId);
          if (copy) await unpackTrackingCopy(c.userId, copy);
          choices.push({
            userId: c.userId,
            username: c.username,
            view: copy && {
              apis: clientTrackingApis(c.userId),
              readOnly: { title: `${c.username}'s tracking`, subtitle: `Sent ${formatDateTime(copy.snapshot.sentAt)}` },
            },
          });
        }
        if (active) setClients(choices);
      })().catch(reportAndReturn(undefined, { stage: "trainerTracking" }));
      return () => {
        active = false;
      };
    }, []),
  );

  const shown = clients.find((c) => c.userId === selectedId && c.view);
  const openPicker = () => setPicking(true);
  const choose = (id: string | null) => {
    setSelectedId(id);
    setPicking(false);
  };

  return (
    <>
      {shown?.view ? (
        <TrackingViewProvider key={shown.userId} value={shown.view}>
          <TrackingScreen onTitlePress={openPicker} />
        </TrackingViewProvider>
      ) : (
        <TrackingScreen onTitlePress={openPicker} />
        )}
      <ClientPickerSheet
        visible={picking}
        onClose={() => setPicking(false)}
        title="Show tracking for"
        ownLabel="My tracking"
        clients={clients.map((c) => ({
          userId: c.userId,
          username: c.username,
          unavailable: c.view ? undefined : "Waiting for their phone to send it",
        }))}
        selectedId={shown?.userId ?? null}
        onChoose={choose}
        emptyText="A client shows up here once they grant you Tracking Access in Friends."
          />
    </>
  );
}
