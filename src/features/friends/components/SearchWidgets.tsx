import React from "react";
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator } from "react-native";
import type { ThemeColors } from "@shared/context/ThemeContext";
import type {
  Friend,
  PendingFriendRequest,
  SentFriendRequest,
} from "../services";
import type { UserSearchResult, UserRef } from "../types";
import type { makeStyles } from "../FriendsScreen";
import { Avatar } from "./Avatar";
import { MIN_USER_SEARCH_LENGTH } from "../utils";

interface SearchUsersWidgetProps {
  readonly styles: ReturnType<typeof makeStyles>;
  readonly colors: ThemeColors;
  readonly searchQuery: string;
  readonly onChangeQuery: (text: string) => void;
  readonly searching: boolean;
  readonly searchResults: UserSearchResult[];
  readonly friends: Friend[];
  readonly sentRequests: SentFriendRequest[];
  readonly pendingRequests: PendingFriendRequest[];
  readonly currentUserId: number | string | undefined;
  readonly onGoToRequests: () => void;
  readonly onAddFriend: (username: string) => void;
  readonly sendingRequestTo: number | string | null;
  readonly onMoreActions: (user: UserRef) => void;
  readonly onScanQr: () => void;
  readonly inputRef?: React.Ref<TextInput>;
}

type SearchUserResultRowProps = Omit<
  SearchUsersWidgetProps,
  | "searchQuery"
  | "onChangeQuery"
  | "searching"
  | "searchResults"
  | "onScanQr"
  | "inputRef"
> & { readonly result: UserSearchResult };

function SearchUserResultRow({
  result,
  friends,
  sentRequests,
  pendingRequests,
  currentUserId,
  styles,
  colors,
  onGoToRequests,
  onAddFriend,
  sendingRequestTo,
  onMoreActions,
}: SearchUserResultRowProps): React.JSX.Element {
  const isFriend = friends.some((f) => f.id === result.id);
  const hasSent = sentRequests.some((r) => r.receiverId === result.id);
  const hasPending = pendingRequests.some((r) => r.senderId === result.id);

  let action: React.ReactNode;
  if (result.id === currentUserId) {
    action = (
      <View style={styles.statusBadge}>
        <Text style={styles.statusBadgeText}>You</Text>
      </View>
    );
  } else if (isFriend) {
    action = (
      <View style={[styles.statusBadge, styles.statusBadgeFriend]}>
        <Text style={styles.statusBadgeText}>✓ Friends</Text>
      </View>
    );
  } else if (hasSent) {
    action = (
      <View style={styles.statusBadge}>
        <Text style={styles.statusBadgeText}>Pending</Text>
      </View>
    );
  } else if (hasPending) {
    action = (
      <TouchableOpacity style={styles.respondButton} onPress={onGoToRequests}>
        <Text style={styles.respondButtonText}>Respond</Text>
      </TouchableOpacity>
    );
  } else {
    action = (
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => onAddFriend(result.username)}
        disabled={sendingRequestTo === result.username}
      >
        {sendingRequestTo === result.username ? (
          <ActivityIndicator size='small' color={colors.textOnAccent} />
        ) : (
          <Text style={styles.addButtonText}>+ Add Friend</Text>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.searchResultCard}>
      <View style={styles.friendInfo}>
        <Avatar username={result.username} />
        <View style={styles.friendDetails}>
          <Text style={styles.friendName}>{result.username}</Text>
        </View>
      </View>
      <View style={styles.searchResultActions}>
        {action}
        {result.id !== currentUserId && (
          <TouchableOpacity
            style={[styles.rejectButton, { marginLeft: 8 }]}
            onPress={() => onMoreActions({ id: result.id, username: result.username })}
            accessibilityRole="button"
            accessibilityLabel={`Report or block ${result.username}`}
          >
            <Text style={styles.rejectButtonText}>⋯</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export function SearchUsersWidget({
  styles,
  colors,
  searchQuery,
  onChangeQuery,
  searching,
  searchResults,
  friends,
  sentRequests,
  pendingRequests,
  currentUserId,
  onGoToRequests,
  onAddFriend,
  sendingRequestTo,
  onMoreActions,
  onScanQr,
  inputRef,
}: SearchUsersWidgetProps): React.JSX.Element {
  const query = searchQuery.trim();
  let noResultsText: React.ReactNode = null;
  if (query.length > 0 && query.length < MIN_USER_SEARCH_LENGTH)
    noResultsText = `Type at least ${MIN_USER_SEARCH_LENGTH} letters of a username`;
  else if (query && !searching && searchResults.length === 0)
    noResultsText = "No users found";
  const noResults = noResultsText && (
    <View style={styles.emptyStateSmall}>
      <Text style={styles.emptyTextSmall}>{noResultsText}</Text>
    </View>
  );
  return (
    <View>
      <View style={styles.searchBarRow}>
        <View style={styles.searchContainer}>
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder='Search by username (3+ letters)'
            placeholderTextColor={colors.textMuted}
            accessibilityLabel='Search users by username'
            value={searchQuery}
            onChangeText={onChangeQuery}
            autoCapitalize='none'
            autoCorrect={false}
          />
          {searching && (
            <ActivityIndicator
              style={styles.searchLoader}
              size='small'
              color={colors.accent}
            />
          )}
        </View>
        <TouchableOpacity
          style={styles.scanButton}
          onPress={onScanQr}
          accessibilityRole='button'
          accessibilityLabel="Scan a friend's QR code"
        >
          <Text style={styles.scanButtonIcon}>📷</Text>
        </TouchableOpacity>
      </View>
      {searchResults.length > 0 ? (
        <View style={styles.listContainer}>
          {searchResults.map((result) => (
            <SearchUserResultRow
              key={String(result.id)}
              result={result}
              friends={friends}
              sentRequests={sentRequests}
              pendingRequests={pendingRequests}
              currentUserId={currentUserId}
              styles={styles}
              colors={colors}
              onGoToRequests={onGoToRequests}
              onAddFriend={onAddFriend}
              sendingRequestTo={sendingRequestTo}
              onMoreActions={onMoreActions}
            />
          ))}
        </View>
      ) : (
        noResults
      )}
    </View>
  );
}
