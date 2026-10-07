import React from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import type { ThemeColors } from "@shared/context/ThemeContext";
import type { WorkoutData } from "@shared/types";
import { useJointSessionContext } from "@shared/context/JointSessionContext";
import type { WatchTarget } from "@shared/context/hooks/useJointSession";
import type {
  Friend,
  FriendId,
  GrantedPermission,
  PermissionType,
} from "../services";
import type { makeStyles, makeWatchStyles, makeJointStyles } from "../FriendsScreen";
import { FriendGrantedPermissions, FriendReceivedPermissions } from "./FriendPermissions";

interface LiveSessionActionProps {
  readonly selectedFriend: Friend | null;
  readonly friendSessionStatuses: Record<string | number, boolean>;
  readonly isWatching: boolean;
  readonly watchTarget: WatchTarget | null;
  readonly checkingActiveSession: boolean;
  readonly onWatch: (friend: Friend) => void;
  readonly onStopWatching: () => void;
  readonly styles: ReturnType<typeof makeStyles>;
  readonly watchStyles: ReturnType<typeof makeWatchStyles>;
  readonly colors: ThemeColors;
}

function LiveSessionAction({
  selectedFriend,
  friendSessionStatuses,
  isWatching,
  watchTarget,
  checkingActiveSession,
  onWatch,
  onStopWatching,
  styles,
  watchStyles,
  colors,
}: LiveSessionActionProps): React.JSX.Element {
  const friendActive =
    !!friendSessionStatuses[selectedFriend?.id as number | string];
  const alreadyWatchingThis =
    isWatching && watchTarget?.friendId === String(selectedFriend?.id);

  let row: React.JSX.Element;
  if (alreadyWatchingThis) {
    row = (
      <View style={[styles.actionRow, watchStyles.activeRow]}>
        <Text style={styles.actionRowIcon}>👀</Text>
        <View style={styles.actionRowText}>
          <Text style={[styles.actionRowTitle, { color: colors.info }]}>
            Watching Now
          </Text>
          <Text style={styles.actionRowSub}>
            Switch to the Workout tab to see {selectedFriend?.username}'s live
            session.
          </Text>
        </View>
        <TouchableOpacity style={watchStyles.stopBtn} onPress={onStopWatching}>
          <Text style={watchStyles.stopBtnText}>Stop</Text>
        </TouchableOpacity>
      </View>
    );
  } else if (friendActive) {
    row = (
      <TouchableOpacity
        style={[
          styles.actionRow,
          watchStyles.availableRow,
          checkingActiveSession && { opacity: 0.7 },
        ]}
        onPress={() => selectedFriend && onWatch(selectedFriend)}
        disabled={checkingActiveSession}
        activeOpacity={0.7}
      >
        <Text style={styles.actionRowIcon}>👀</Text>
        <View style={styles.actionRowText}>
          <Text style={[styles.actionRowTitle, { color: colors.info }]}>
            View Current Session
          </Text>
          <Text style={styles.actionRowSub}>
            {selectedFriend?.username} is working out now. Watch their
            session live.
          </Text>
        </View>
        {checkingActiveSession ? (
          <ActivityIndicator size='small' color={colors.info} />
        ) : (
          <Text style={[styles.actionRowArrow, { color: colors.info }]}>
            ›
          </Text>
        )}
      </TouchableOpacity>
    );
  } else {
    row = (
      <View style={[styles.actionRow, { opacity: 0.55 }]}>
        <Text style={styles.actionRowIcon}>👀</Text>
        <View style={styles.actionRowText}>
          <Text style={styles.actionRowTitle}>View Current Session</Text>
          <Text style={styles.actionRowSub}>
            {selectedFriend?.username} isn't working out right now.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <>
      <Text style={[styles.actionsTabSectionTitle, { marginTop: 28 }]}>
        Live Session
      </Text>
      {row}
    </>
  );
}

interface LiftTogetherActionProps {
  readonly selectedFriend: Friend | null;
  readonly friendSessionStatuses: Record<string | number, boolean>;
  readonly isInJointSession: boolean;
  readonly getInviteStatusForFriend: (friendId: number | string) => string;
  readonly onLeaveJointSession: () => void;
  readonly onSendInvite: (friend: Friend) => void;
  readonly styles: ReturnType<typeof makeStyles>;
  readonly jointStyles: ReturnType<typeof makeJointStyles>;
  readonly colors: ThemeColors;
}

function LiftTogetherAction({
  selectedFriend,
  friendSessionStatuses,
  isInJointSession,
  getInviteStatusForFriend,
  onLeaveJointSession,
  onSendInvite,
  styles,
  jointStyles,
  colors,
}: LiftTogetherActionProps): React.JSX.Element {
  const friendActive =
    !!friendSessionStatuses[selectedFriend?.id as number | string];
  const cs = getInviteStatusForFriend(selectedFriend?.id as number | string);
  const jointActive = isInJointSession && cs === "active";
  const jointElsewhere = isInJointSession && !jointActive;
  const busy = cs === "sending" || cs === "waiting";

  let row: React.JSX.Element;
  if (jointActive) {
    row = (
      <View style={[styles.actionRow, jointStyles.activeRow]}>
        <View style={jointStyles.liveDot} />
        <View style={styles.actionRowText}>
          <Text style={[styles.actionRowTitle, { color: colors.success }]}>
            Joint session active 🎉
          </Text>
          <Text style={styles.actionRowSub}>
            Your sets are synced. Open the Workout tab.
          </Text>
        </View>
        <TouchableOpacity
          style={jointStyles.leaveBtn}
          onPress={onLeaveJointSession}
          accessibilityRole="button"
          accessibilityLabel="Leave joint session"
        >
          <Text style={jointStyles.leaveBtnText}>Leave</Text>
        </TouchableOpacity>
      </View>
    );
  } else if (jointElsewhere) {
    row = (
      <View style={[styles.actionRow, { opacity: 0.6 }]}>
        <Text style={styles.actionRowIcon}>🏋️</Text>
        <View style={styles.actionRowText}>
          <Text style={styles.actionRowTitle}>Lift Together</Text>
          <Text style={styles.actionRowSub}>
            You're already in a joint session with someone else.
          </Text>
        </View>
      </View>
    );
  } else if (friendActive) {
    row = (
      <TouchableOpacity
        style={[
          styles.actionRow,
          jointStyles.inviteRow,
          cs === "waiting" && { opacity: 0.7 },
        ]}
        onPress={() => selectedFriend && onSendInvite(selectedFriend)}
        disabled={busy}
        activeOpacity={0.7}
      >
        <Text style={styles.actionRowIcon}>🏋️</Text>
        <View style={styles.actionRowText}>
          <Text style={[styles.actionRowTitle, { color: colors.accentDark }]}>
            {cs === "waiting"
              ? "Waiting for response…"
              : "Invite to Lift Together"}
          </Text>
          <Text style={styles.actionRowSub}>
            {selectedFriend?.username} is working out. Sync up!
          </Text>
        </View>
        {busy ? (
          <ActivityIndicator size='small' color={colors.accentDark} />
        ) : (
          <Text style={[styles.actionRowArrow, { color: colors.accentDark }]}>
            ›
          </Text>
        )}
      </TouchableOpacity>
    );
  } else {
    row = (
      <View style={[styles.actionRow, { opacity: 0.6 }]}>
        <Text style={styles.actionRowIcon}>🏋️</Text>
        <View style={styles.actionRowText}>
          <Text style={styles.actionRowTitle}>Lift Together</Text>
          <Text style={styles.actionRowSub}>
            {selectedFriend?.username} is not currently in a workout session.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <>
      <Text style={[styles.actionsTabSectionTitle, { marginTop: 28 }]}>
        Lift Together
      </Text>
      {row}
    </>
  );
}

interface TrainerActionProps {
  readonly selectedFriend: Friend | null;
  readonly isActive: boolean;
  readonly onStart: (friend: Friend) => void;
  readonly onStop: () => void;
  readonly styles: ReturnType<typeof makeStyles>;
  readonly jointStyles: ReturnType<typeof makeJointStyles>;
  readonly colors: ThemeColors;
}

function TrainerAction({
  selectedFriend,
  isActive,
  onStart,
  onStop,
  styles,
  jointStyles,
  colors,
}: TrainerActionProps): React.JSX.Element {
  let row: React.JSX.Element;
  if (isActive) {
    row = (
      <View style={[styles.actionRow, jointStyles.activeRow]}>
        <View style={jointStyles.liveDot} />
        <View style={styles.actionRowText}>
          <Text style={[styles.actionRowTitle, { color: colors.success }]}>
            Logging their sets
          </Text>
          <Text style={styles.actionRowSub}>
            You're logging {selectedFriend?.username}'s session. Open the
            Workout tab.
          </Text>
        </View>
        <TouchableOpacity
          style={jointStyles.leaveBtn}
          onPress={onStop}
          accessibilityRole="button"
          accessibilityLabel="Stop trainer session"
        >
          <Text style={jointStyles.leaveBtnText}>Stop</Text>
        </TouchableOpacity>
      </View>
    );
  } else {
    row = (
      <TouchableOpacity
        style={[styles.actionRow, jointStyles.inviteRow]}
        onPress={() => selectedFriend && onStart(selectedFriend)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Start trainer session for ${
          selectedFriend?.username ?? "friend"
        }`}
      >
        <Text style={styles.actionRowIcon}>🧑‍🏫</Text>
        <View style={styles.actionRowText}>
          <Text style={[styles.actionRowTitle, { color: colors.accentDark }]}>
            Start Trainer Session
          </Text>
          <Text style={styles.actionRowSub}>
            Log {selectedFriend?.username}'s sets for them from the Workout
            tab.
          </Text>
        </View>
        <Text style={[styles.actionRowArrow, { color: colors.accentDark }]}>
          ›
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <>
      <Text style={styles.actionsTabSectionTitle}>Trainer</Text>
      {row}
    </>
  );
}

interface FriendActionsTabProps {
  readonly selectedFriend: Friend | null;
  readonly hasTrainerAccess: boolean;
  readonly activeTraineeUserId: string | null;
  readonly styles: ReturnType<typeof makeStyles>;
  readonly watchStyles: ReturnType<typeof makeWatchStyles>;
  readonly jointStyles: ReturnType<typeof makeJointStyles>;
  readonly colors: ThemeColors;
  readonly workoutData: WorkoutData | null;
  readonly getGrantedPermission: (
    friendId: FriendId,
    type: PermissionType,
  ) => GrantedPermission | undefined;
  readonly isPermLoading: (
    friendId: FriendId,
    type: PermissionType,
  ) => boolean;
  readonly hasReceivedPermission: (
    friendId: FriendId,
    type: PermissionType,
  ) => boolean;
  readonly onGrantPermission: (friend: Friend, type: PermissionType) => void;
  readonly onRevokePermission: (friend: Friend, type: PermissionType) => void;
  readonly onGrantProgramPermission: (friend: Friend) => void;
  readonly friendSessionStatuses: Record<string | number, boolean>;
  readonly checkingActiveSession: boolean;
  readonly onWatchSession: (friend: Friend) => void;
  readonly hasOwnActiveSession: boolean;
  readonly getInviteStatusForFriend: (friendId: number | string) => string;
  readonly onSendInvite: (friend: Friend) => void;
  readonly onStartTrainer: (friend: Friend) => void;
  readonly onStopTrainer: () => void;
  readonly onRemoveFriend: (friend: Friend) => void;
  readonly onBlockFriend: (friend: Friend) => void;
  readonly onReportFriend: (friend: Friend) => void;
  readonly onLeaveJointSession: () => void;
}

export function FriendActionsTab({
  selectedFriend,
  hasTrainerAccess,
  activeTraineeUserId,
  styles,
  watchStyles,
  jointStyles,
  colors,
  workoutData,
  getGrantedPermission,
  isPermLoading,
  hasReceivedPermission,
  onGrantPermission,
  onRevokePermission,
  onGrantProgramPermission,
  friendSessionStatuses,
  checkingActiveSession,
  onWatchSession,
  hasOwnActiveSession,
  getInviteStatusForFriend,
  onSendInvite,
  onStartTrainer,
  onStopTrainer,
  onRemoveFriend,
  onBlockFriend,
  onReportFriend,
  onLeaveJointSession,
}: FriendActionsTabProps): React.JSX.Element {
  const {
    isWatching,
    watchTarget,
    stopWatching,
    isInJointSession,
  } = useJointSessionContext();
  const showLiveSession = hasReceivedPermission(
    selectedFriend?.id,
    "watch_session",
  );
  const showLiftTogether =
    hasOwnActiveSession &&
    hasReceivedPermission(selectedFriend?.id, "joint_session");
  const username = selectedFriend?.username ?? "";
  const dangerActions = [
    {
      verb: "Remove",
      icon: "🚫",
      title: "Remove Friend",
      sub: `Remove ${username} from your friends list`,
      onPress: onRemoveFriend,
    },
    {
      verb: "Block",
      icon: "⛔",
      title: "Block",
      sub: `Stop ${username} contacting you or seeing anything you share`,
      onPress: onBlockFriend,
    },
    {
      verb: "Report",
      icon: "🚩",
      title: "Report",
      sub: `Flag ${username} to whoever runs this server`,
      onPress: onReportFriend,
    },
  ];

  return (
    <ScrollView style={styles.modalScroll}>
      <View style={styles.actionsTabContent}>
        {hasTrainerAccess && (
          <TrainerAction
            selectedFriend={selectedFriend}
            isActive={
              activeTraineeUserId === String(selectedFriend?.id ?? "")
            }
            onStart={onStartTrainer}
            onStop={onStopTrainer}
            styles={styles}
            jointStyles={jointStyles}
            colors={colors}
          />
        )}

        <FriendGrantedPermissions
          selectedFriend={selectedFriend}
          workoutData={workoutData}
          styles={styles}
          getGrantedPermission={getGrantedPermission}
          isPermLoading={isPermLoading}
          onGrantPermission={onGrantPermission}
          onGrantProgramPermission={onGrantProgramPermission}
          onRevokePermission={onRevokePermission}
        />

        <FriendReceivedPermissions
          selectedFriend={selectedFriend}
          styles={styles}
          hasReceivedPermission={hasReceivedPermission}
        />

        {showLiveSession && (
          <LiveSessionAction
            selectedFriend={selectedFriend}
            friendSessionStatuses={friendSessionStatuses}
            isWatching={isWatching}
            watchTarget={watchTarget}
            checkingActiveSession={checkingActiveSession}
            onWatch={onWatchSession}
            onStopWatching={stopWatching}
            styles={styles}
            watchStyles={watchStyles}
            colors={colors}
          />
        )}

        {showLiftTogether && (
          <LiftTogetherAction
            selectedFriend={selectedFriend}
            friendSessionStatuses={friendSessionStatuses}
            isInJointSession={isInJointSession}
            getInviteStatusForFriend={getInviteStatusForFriend}
            onLeaveJointSession={onLeaveJointSession}
            onSendInvite={onSendInvite}
            styles={styles}
            jointStyles={jointStyles}
            colors={colors}
          />
        )}

        <Text style={[styles.actionsTabSectionTitle, { marginTop: 28 }]}>
          Danger Zone
        </Text>
        {dangerActions.map((action) => (
          <TouchableOpacity
            key={action.verb}
            style={[styles.actionRow, styles.actionRowDanger]}
            onPress={() => selectedFriend && action.onPress(selectedFriend)}
            activeOpacity={0.7}
            accessibilityRole='button'
            accessibilityLabel={`${action.verb} ${
              selectedFriend?.username ?? "user"
            }`}
          >
            <Text style={styles.actionRowIcon}>{action.icon}</Text>
            <View style={styles.actionRowText}>
              <Text style={[styles.actionRowTitle, { color: colors.error }]}>
                {action.title}
              </Text>
              <Text style={styles.actionRowSub}>{action.sub}</Text>
            </View>
            <Text style={[styles.actionRowArrow, { color: colors.error }]}>
              ›
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}
