import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Modal, Platform } from "react-native";
import { NavigationBar } from "expo-navigation-bar";
import { useAuth } from "@shared/context/AuthContext";
import { useJointSessionContextOptional } from "@shared/context/JointSessionContext";
import { ApiError } from "@shared/services/apiError";
import { getAppModeSync, onAppModeChange } from "@shared/services/appMode";
import {
  getDisabledFeatures,
  onDisabledFeaturesChange,
  refreshLocalOnlyFeatures,
} from "@shared/services/localOnlyFeatures";
import { getNotifications } from "@shared/services/notifications";
import { captureUnreported, reportAndReturn } from "@shared/services/crashReporting";
import { demoDataChanged } from "@features/settings/utils/demoData";
import { messagesApi } from "./services";
import { applyToConversations, markConversationRead, totalUnread } from "./utils/conversation";
import MessagesListScreen from "./MessagesListScreen";
import ConversationScreen from "./ConversationScreen";
import {
  MESSAGES_CHANNEL,
  askNotificationPermission,
  ensureMessagesChannel,
  messageSender,
  registerPushToken,
  serverPushesMessages,
} from "./push";
import { threadEvents } from "./threadEvents";
import type { Conversation, IncomingMessage, Message, Peer } from "./types";

export type { Peer } from "./types";

interface MessagesContextValue {
  /** False in offline mode or when the server switched messaging off, so entry points hide. */
  available: boolean;
  unreadCount: number;
  openInbox: () => void;
  openConversation: (peer: Peer) => void;
}

const MessagesContext = createContext<MessagesContextValue>({
  available: false,
  unreadCount: 0,
  openInbox: () => {},
  openConversation: () => {},
});

export const useMessages = (): MessagesContextValue => useContext(MessagesContext);

// Covers servers without FCM while the socket is still open in the background.
async function notifyInBackground(incoming: IncomingMessage): Promise<void> {
  const Notifications = await getNotifications();
  if (!Notifications) return;
  await ensureMessagesChannel(Notifications);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `@${incoming.fromUsername}`,
      body: incoming.message.body,
      data: { type: "message", fromUuid: incoming.fromUuid },
    },
    trigger: Platform.OS === "android" ? { channelId: MESSAGES_CHANNEL } : null,
  });
}

export function MessagesProvider({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  const { user } = useAuth();
  const subscribeToSocket = useJointSessionContextOptional()?.subscribeToSocket;
  const [online, setOnline] = useState(() => getAppModeSync() === "online");
  useEffect(() => onAppModeChange.subscribe((mode) => setOnline(mode === "online")), []);
  const [serverAllows, setServerAllows] = useState(false);
  useEffect(() => {
    void getDisabledFeatures().then((off) => setServerAllows(!off.includes("messages")));
    return onDisabledFeaturesChange((off) => setServerAllows(!off.includes("messages")));
  }, []);
  const enabled = online && user?.id != null && serverAllows;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [sheet, setSheet] = useState<"closed" | "inbox" | Peer>("closed");
  const openPeerRef = useRef<string | null>(null);
  openPeerRef.current = typeof sheet === "object" ? sheet.userUuid : null;
  const sheetOpen = sheet !== "closed";

  // The app-wide swipe-up that reveals the nav bar can't reach the Modal's window.
  useEffect(() => {
    if (Platform.OS !== "android" || !sheetOpen) return;
    NavigationBar.setHidden(false);
    return () => NavigationBar.setHidden(true);
  }, [sheetOpen]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      setConversations(await messagesApi.listConversations());
    } catch (error) {
      if (error instanceof ApiError && error.code === "FEATURE_DISABLED") {
        void refreshLocalOnlyFeatures();
        return;
      }
      // A failed refresh keeps the last list. The next foreground or socket reconnect retries.
      captureUnreported(error, { stage: "messagesRefresh" });
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setConversations([]);
      setSheet("closed");
      return;
    }
    void refresh();
    const unsubscribeDemo = demoDataChanged.subscribe(() => void refresh());
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      unsubscribeDemo();
      sub.remove();
    };
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled || !subscribeToSocket) return;
    return subscribeToSocket((msg) => {
      if (msg.type === "auth_success") {
        void refresh();
      } else if (msg.type === "message_new") {
        const incoming = msg as unknown as IncomingMessage;
        const viewing = openPeerRef.current === incoming.fromUuid && AppState.currentState === "active";
        setConversations((list) =>
          applyToConversations(
            list,
            { userUuid: incoming.fromUuid, username: incoming.fromUsername },
            incoming.message,
            viewing,
          ),
        );
        threadEvents.trigger({ type: "new", fromUuid: incoming.fromUuid, message: incoming.message });
        if (AppState.currentState !== "active" && !serverPushesMessages())
          void notifyInBackground(incoming).catch(reportAndReturn(undefined, { stage: "messagesNotify" }));
      } else if (msg.type === "message_edited") {
        threadEvents.trigger({ type: "edited", fromUuid: String(msg.fromUuid), message: msg.message as Message });
        void refresh();
      } else if (msg.type === "message_deleted") {
        threadEvents.trigger({ type: "deleted", fromUuid: String(msg.fromUuid), messageId: Number(msg.messageId) });
        void refresh();
      } else if (msg.type === "message_read") {
        threadEvents.trigger({ type: "read", byUuid: String(msg.byUuid), readAt: String(msg.readAt) });
      }
    });
  }, [enabled, subscribeToSocket, refresh]);

  useEffect(() => {
    if (enabled) void registerPushToken();
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let subscription: { remove: () => void } | undefined;
    const openFromNotification = async (fromUuid: string) => {
      const list = await messagesApi
        .listConversations()
        .catch(reportAndReturn(null, { stage: "messagesOpenFromNotification" }));
      if (!active) return;
      if (list) setConversations(list);
      const conversation = list?.find((c) => c.userUuid === fromUuid);
      setSheet(conversation ? { userUuid: fromUuid, username: conversation.username } : "inbox");
    };
    void getNotifications().then((Notifications) => {
      if (!Notifications || !active) return;
      const last = Notifications.getLastNotificationResponse();
      const lastSender = last && messageSender(last.notification);
      if (lastSender) {
        Notifications.clearLastNotificationResponse();
        void openFromNotification(lastSender);
      }
      subscription = Notifications.addNotificationResponseReceivedListener((response) => {
        const sender = messageSender(response.notification);
        if (sender) void openFromNotification(sender);
      });
    });
    return () => {
      active = false;
      subscription?.remove();
    };
  }, [enabled]);

  const openInbox = useCallback(() => {
    if (!enabled) return;
    setSheet("inbox");
    void refresh();
    void askNotificationPermission();
  }, [enabled, refresh]);
  const openConversation = useCallback(
    (peer: Peer) => {
      if (!enabled) return;
      setSheet(peer);
      void askNotificationPermission();
    },
    [enabled],
  );

  const onThreadRead = useCallback((userUuid: string) => {
    setConversations((list) => markConversationRead(list, userUuid));
  }, []);
  const onSent = useCallback((peer: Peer, message: IncomingMessage["message"]) => {
    setConversations((list) => applyToConversations(list, peer, message, true));
  }, []);

  const value = useMemo(
    () => ({ available: enabled, unreadCount: totalUnread(conversations), openInbox, openConversation }),
    [enabled, conversations, openInbox, openConversation],
  );

  const relationOf = (uuid: string) => conversations.find((c) => c.userUuid === uuid)?.relation ?? null;

  return (
    <MessagesContext.Provider value={value}>
      {children}
      <Modal
        visible={sheet !== "closed"}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setSheet(typeof sheet === "object" ? "inbox" : "closed")}
      >
        {typeof sheet === "object" ? (
          <ConversationScreen
            peer={sheet}
            relation={relationOf(sheet.userUuid)}
            onBack={() => setSheet("inbox")}
            onRead={onThreadRead}
            onSent={onSent}
            onChanged={refresh}
          />
        ) : (
          <MessagesListScreen
            conversations={conversations}
            onOpen={(c) => setSheet({ userUuid: c.userUuid, username: c.username })}
            onClose={() => setSheet("closed")}
            onRefresh={refresh}
          />
        )}
      </Modal>
    </MessagesContext.Provider>
  );
}
