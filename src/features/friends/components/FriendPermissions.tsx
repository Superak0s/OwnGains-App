import React from "react";
import { Text } from "react-native";
import { PermissionRow } from "./PermissionRow";
import type { WorkoutData } from "@shared/types";
import type {
  Friend,
  FriendId,
  GrantedPermission,
  PermissionType,
} from "../services";
import type { makeStyles } from "../FriendsScreen";

function getShareProgramDescription(
  username: string | undefined,
  workoutData: WorkoutData | null,
): string {
  if (!workoutData)
    return "No program loaded. Load a workout program first to share it.";
  const wd = workoutData as WorkoutData & { people?: string[] };
  const split = wd.split ?? wd.people;
  return `Share your current program (${split?.join("/")}, ${wd.totalDays} days) with ${username}.`;
}

export const PERMISSION_TYPES: Array<{
  type: PermissionType;
  icon: string;
  title: string;
  /** Title for the "what they granted you" list, where it reads differently. */
  receivedTitle?: string;
  describe: (
    username: string | undefined,
    workoutData: WorkoutData | null,
  ) => string;
}> = [
  {
    type: "history",
    icon: "📅",
    title: "History Access",
    describe: (username) =>
      `Let ${username} view your workout history calendar and session details.`,
  },
  {
    type: "analytics",
    icon: "📊",
    title: "Analytics Access",
    describe: (username) =>
      `Let ${username} view your workout analytics and progress charts. Needs History Access too.`,
  },
  {
    type: "program",
    icon: "📋",
    title: "Share My Program",
    receivedTitle: "Shared Program",
    describe: getShareProgramDescription,
  },
  {
    type: "joint_session",
    icon: "🏋️",
    title: "Joint Session",
    describe: (username) =>
      `Let ${username} invite you to lift together when you're both working out.`,
  },
  {
    type: "watch_session",
    icon: "👀",
    title: "Watch Session",
    describe: (username) =>
      `Let ${username} watch your active workout session live.`,
  },
  {
    type: "trainer",
    icon: "🧑‍🏫",
    title: "Trainer Access",
    describe: (username) =>
      `Let ${username} log workouts for you, edit your program, and see your workout history, analytics and notes.`,
  },
];

export const trainerGrantConfirmation = (username: string) => ({
  title: `Make ${username} your trainer?`,
  message: `${username} will be able to start and log workouts as you, change sets in your sessions, edit your program, watch your workouts live, and see your full workout history, analytics and notes. They can't access your account settings or delete anything. You can revoke this at any time.`,
});

interface FriendGrantedPermissionsProps {
  readonly selectedFriend: Friend | null;
  readonly workoutData: WorkoutData | null;
  readonly styles: ReturnType<typeof makeStyles>;
  readonly getGrantedPermission: (
    friendId: FriendId,
    type: PermissionType,
  ) => GrantedPermission | undefined;
  readonly isPermLoading: (
    friendId: FriendId,
    type: PermissionType,
  ) => boolean;
  readonly onGrantPermission: (friend: Friend, type: PermissionType) => void;
  readonly onGrantProgramPermission: (friend: Friend) => void;
  readonly onRevokePermission: (friend: Friend, type: PermissionType) => void;
}

export function FriendGrantedPermissions({
  selectedFriend,
  workoutData,
  styles,
  getGrantedPermission,
  isPermLoading,
  onGrantPermission,
  onGrantProgramPermission,
  onRevokePermission,
}: FriendGrantedPermissionsProps): React.JSX.Element {
  const friendId = selectedFriend?.id;
  return (
    <>
      <Text style={styles.actionsTabSectionTitle}>
        Permissions for {selectedFriend?.username}
      </Text>
      <Text style={styles.actionsTabSectionHint}>
        Control what {selectedFriend?.username} is allowed to see and do.
      </Text>

      {PERMISSION_TYPES.map(({ type, icon, title, describe }) => (
        <PermissionRow
          key={type}
          icon={icon}
          title={title}
          description={describe(selectedFriend?.username, workoutData)}
          friendName={selectedFriend?.username}
          granted={!!getGrantedPermission(friendId, type)}
          loading={isPermLoading(friendId, type)}
          onGrant={() => {
            if (!selectedFriend) return;
            if (type === "program") onGrantProgramPermission(selectedFriend);
            else onGrantPermission(selectedFriend, type);
          }}
          onRevoke={() => {
            if (selectedFriend) onRevokePermission(selectedFriend, type);
          }}
        />
      ))}
    </>
  );
}

interface FriendReceivedPermissionsProps {
  readonly selectedFriend: Friend | null;
  readonly styles: ReturnType<typeof makeStyles>;
  readonly hasReceivedPermission: (
    friendId: FriendId,
    type: PermissionType,
  ) => boolean;
}

export function FriendReceivedPermissions({
  selectedFriend,
  styles,
  hasReceivedPermission,
}: FriendReceivedPermissionsProps): React.JSX.Element {
  return (
    <>
      <Text style={[styles.actionsTabSectionTitle, { marginTop: 28 }]}>
        {selectedFriend?.username}'s Permissions for You
      </Text>
      <Text style={styles.actionsTabSectionHint}>
        What {selectedFriend?.username} has allowed you to do.
      </Text>

      {PERMISSION_TYPES.map(({ type, icon, title, receivedTitle }) => {
        const has = hasReceivedPermission(selectedFriend?.id, type);
        return (
          <PermissionRow
            key={type}
            icon={icon}
            title={receivedTitle ?? title}
            description={
              has
                ? `${selectedFriend?.username} has granted you this.`
                : `${selectedFriend?.username} hasn't granted this yet.`
            }
            granted={has}
            readOnly
          />
        );
      })}
    </>
  );
}
