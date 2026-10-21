import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { formatDate } from "@utils/format";
import type { PendingFriendRequest, SentFriendRequest } from "../services";
import type { UserRef } from "../types";
import type { TrainerRequest } from "@features/trainer/services";
import type { makeStyles } from "../FriendsScreen";
import { Avatar } from "@shared/components/Avatar";

interface RequestsPendingWidgetProps {
  readonly pendingRequests: PendingFriendRequest[];
  readonly trainerRequests: TrainerRequest[];
  readonly styles: ReturnType<typeof makeStyles>;
  readonly onAccept: (friendshipId: number | string) => void;
  readonly onReject: (friendshipId: number | string, username: string) => void;
  readonly onAcceptTrainer: (request: TrainerRequest) => void;
  readonly onDeclineTrainer: (request: TrainerRequest) => void;
  /** True when the sender already has Trainer Access, so their request only asks for tracking. */
  readonly isMyTrainer: (userId: string) => boolean;
  readonly onMoreActions: (user: UserRef) => void;
}

export function RequestsPendingWidget({
  pendingRequests,
  trainerRequests,
  styles,
  onAccept,
  onReject,
  onAcceptTrainer,
  onDeclineTrainer,
  isMyTrainer,
  onMoreActions,
}: RequestsPendingWidgetProps): React.JSX.Element {
  return (
    <View>
      <Text style={styles.subsectionTitle}>
        Pending Requests ({pendingRequests.length + trainerRequests.length})
      </Text>
      {trainerRequests.map((request) => (
        <View key={`trainer-${request.id}`} style={styles.requestCard}>
          <View style={styles.friendInfo}>
            <Avatar name={request.fromUsername} size={48} />
            <View style={styles.friendDetails}>
              <Text style={styles.friendName}>
                {isMyTrainer(request.fromUserId)
                  ? `${request.fromUsername} asks for Tracking Access`
                  : `${request.fromUsername} wants to be your trainer`}
              </Text>
              <Text style={styles.friendMeta}>
                Sent {formatDate(request.createdAt)}
              </Text>
            </View>
          </View>
          <View style={styles.requestActions}>
            <TouchableOpacity
              style={styles.acceptButton}
              onPress={() => onAcceptTrainer(request)}
              accessibilityRole="button"
              accessibilityLabel={`Accept trainer request from ${request.fromUsername}`}
            >
              <Text style={styles.acceptButtonText}>✓</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.rejectButton}
              onPress={() => onDeclineTrainer(request)}
              accessibilityRole="button"
              accessibilityLabel={`Decline trainer request from ${request.fromUsername}`}
            >
              <Text style={styles.rejectButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
      {pendingRequests.length === 0 && trainerRequests.length === 0 ? (
        <View style={styles.emptyStateSmall}>
          <Text style={styles.emptyTextSmall}>No pending friend requests</Text>
        </View>
      ) : (
        <View style={styles.listContainer}>
          {pendingRequests.map((request) => (
            <View key={String(request.id)} style={styles.requestCard}>
              <View style={styles.friendInfo}>
                <Avatar name={request.senderUsername} size={48} />
                <View style={styles.friendDetails}>
                  <Text style={styles.friendName}>
                    {request.senderUsername}
                  </Text>
                  <Text style={styles.friendMeta}>
                    Sent {formatDate(request.createdAt)}
                  </Text>
                </View>
              </View>
              <View style={styles.requestActions}>
                <TouchableOpacity
                  style={styles.acceptButton}
                  onPress={() => onAccept(request.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Accept friend request from ${request.senderUsername}`}
                >
                  <Text style={styles.acceptButtonText}>✓</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.rejectButton}
                  onPress={() => onReject(request.id, request.senderUsername)}
                  accessibilityRole="button"
                  accessibilityLabel={`Reject friend request from ${request.senderUsername}`}
                >
                  <Text style={styles.rejectButtonText}>✕</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.rejectButton}
                  onPress={() =>
                    onMoreActions({
                      id: request.senderId,
                      username: request.senderUsername,
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Report or block ${request.senderUsername}`}
                >
                  <Text style={styles.rejectButtonText}>⋯</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

interface RequestsSentWidgetProps {
  readonly sentRequests: SentFriendRequest[];
  readonly styles: ReturnType<typeof makeStyles>;
  readonly onCancel: (friendshipId: number | string, username: string) => void;
}

export function RequestsSentWidget({
  sentRequests,
  styles,
  onCancel,
}: RequestsSentWidgetProps): React.JSX.Element {
  return (
    <View>
      <Text style={styles.subsectionTitle}>
        Sent Requests ({sentRequests.length})
      </Text>
      {sentRequests.length === 0 ? (
        <View style={styles.emptyStateSmall}>
          <Text style={styles.emptyTextSmall}>No sent friend requests</Text>
        </View>
      ) : (
        <View style={styles.listContainer}>
          {sentRequests.map((request) => (
            <View key={String(request.id)} style={styles.sentRequestCard}>
              <View style={styles.friendInfo}>
                <Avatar name={request.receiverUsername} size={48} />
                <View style={styles.friendDetails}>
                  <Text style={styles.friendName}>
                    {request.receiverUsername}
                  </Text>
                  <Text style={styles.friendMeta}>
                    Sent {formatDate(request.createdAt)}
                  </Text>
                </View>
              </View>
              <View style={styles.requestActions}>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusBadgeText}>Pending</Text>
                </View>
                <TouchableOpacity
                  style={styles.rejectButton}
                  onPress={() => onCancel(request.id, request.receiverUsername)}
                  accessibilityRole="button"
                  accessibilityLabel={`Cancel friend request to ${request.receiverUsername}`}
                >
                  <Text style={styles.rejectButtonText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
