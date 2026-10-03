import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import type { Friend, PermissionType } from "../services";
import type { ReceivedProgram } from "../types";
import { friendTabLocks } from "../utils";
import type { makeStyles } from "../FriendsScreen";

interface FriendTabDescriptor {
  key: string;
  icon: string;
  label: string;
  locked: boolean;
}

interface FriendTabsBarProps {
  readonly selectedFriend: Friend | null;
  readonly activeFriendTab: string;
  readonly receivedPrograms: ReceivedProgram[];
  readonly hasReceivedPermission: (
    friendId: number | string | undefined,
    type: PermissionType,
  ) => boolean;
  readonly onSelectTab: (tabKey: string) => void;
  readonly onLockedTab: (tabKey: string) => void;
  readonly styles: ReturnType<typeof makeStyles>;
}

export function FriendTabsBar({
  selectedFriend,
  activeFriendTab,
  receivedPrograms,
  hasReceivedPermission,
  onSelectTab,
  onLockedTab,
  styles,
}: FriendTabsBarProps): React.JSX.Element {
  const locks = friendTabLocks(
    selectedFriend?.id,
    receivedPrograms,
    hasReceivedPermission,
  );

  const tabs: FriendTabDescriptor[] = [
    { key: "history", icon: "📅", label: "History", locked: locks.history },
    { key: "analytics", icon: "📊", label: "Analytics", locked: locks.analytics },
    { key: "program", icon: "📋", label: "Program", locked: locks.program },
    { key: "live", icon: "🔴", label: "Live", locked: locks.live },
    { key: "actions", icon: "⚙️", label: "Actions", locked: locks.actions },
  ];

  return (
    <View style={styles.friendTabContainer}>
      {tabs.map((tab) => {
        const isActive = activeFriendTab === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            accessibilityRole='tab'
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={tab.locked ? `${tab.label}, locked` : tab.label}
            style={[
              styles.friendTab,
              isActive && styles.friendTabActive,
              tab.locked && { opacity: 0.35 },
            ]}
            onPress={() =>
              tab.locked ? onLockedTab(tab.key) : onSelectTab(tab.key)
            }
          >
            <Text
              style={[
                styles.friendTabText,
                isActive && styles.friendTabTextActive,
              ]}
              numberOfLines={1}
            >
              {tab.icon} {tab.label}
              {tab.locked ? " 🔒" : ""}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
