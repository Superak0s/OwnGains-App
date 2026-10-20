import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import ModalSheet from "@shared/components/ModalSheet";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";
import { captureException } from "@shared/services/crashReporting";
import { friendsApi } from "@features/friends/services";
import type { UserSearchResult } from "@features/friends/types";
import { MIN_USER_SEARCH_LENGTH } from "@features/friends/utils";
import { parseFriendQrPayload } from "@features/friends/services/qrFriendCode";

interface AddClientSheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onPick: (user: UserSearchResult) => void;
  /** User ids that are already clients or already have a pending request. */
  readonly takenIds: ReadonlySet<string>;
}

export default function AddClientSheet({
  visible,
  onClose,
  onPick,
  takenIds,
}: AddClientSheetProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const [searched, setSearched] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  useEffect(() => {
    if (visible) return;
    setScanning(false);
    setScanError(null);
    setQuery("");
    setResults([]);
    setFailed(false);
    setSearched(false);
  }, [visible]);

  const canSearch = query.trim().length >= MIN_USER_SEARCH_LENGTH;

  const search = async () => {
    if (!canSearch) return;
    setSearching(true);
    setFailed(false);
    try {
      setResults(await friendsApi.searchUsers(query.trim(), 20));
      setSearched(true);
    } catch (error) {
      captureException(error, { stage: "trainerSearchUsers" });
      setFailed(true);
    } finally {
      setSearching(false);
    }
  };

  const startScan = async () => {
    setScanError(null);
    if (!cameraPermission?.granted && !(await requestCameraPermission()).granted) {
      setScanError("Camera access is needed to scan a QR code. You can enable it in your device settings.");
      return;
    }
    setScanning(true);
  };

  const onScanned = ({ data }: BarcodeScanningResult) => {
    const payload = parseFriendQrPayload(data);
    if (!payload) {
      setScanError("That isn't an OwnGains QR code. Ask your client to open My QR Code in Friends.");
      return;
    }
    if (takenIds.has(String(payload.id))) {
      setScanError(`${payload.username} is already added.`);
      return;
    }
    setScanning(false);
    onPick({ id: payload.id, username: payload.username });
  };

  if (scanning)
    return (
      <ModalSheet visible={visible} onClose={() => setScanning(false)} title="Scan client's QR code" fullHeight>
        <View style={styles.scanner}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={scanError ? undefined : onScanned}
          />
          <Text style={styles.scannerHint}>
            {scanError ?? "Point your camera at the QR code under My QR Code in their Friends tab"}
          </Text>
        </View>
        {scanError && (
          <TouchableOpacity
            style={styles.searchButton}
            onPress={() => setScanError(null)}
            accessibilityRole="button"
            accessibilityLabel="Scan again"
          >
            <Text style={styles.searchButtonText}>Scan again</Text>
          </TouchableOpacity>
        )}
      </ModalSheet>
    );

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Add client"
      subtitle="The request asks them to make you their trainer. Accepting also makes you friends."
    >
      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            setResults([]);
            setSearched(false);
          }}
          onSubmitEditing={() => void search()}
          placeholder="Username"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Client username"
        />
        <TouchableOpacity
          style={[styles.searchButton, !canSearch && styles.disabled]}
          disabled={!canSearch}
          onPress={() => void search()}
          accessibilityRole="button"
          accessibilityLabel="Search users"
        >
          <Text style={styles.searchButtonText}>Search</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.scanButton}
          onPress={() => void startScan()}
          accessibilityRole="button"
          accessibilityLabel="Scan a client's QR code"
        >
          <Text style={styles.scanIcon}>📷</Text>
        </TouchableOpacity>
      </View>
      {scanError && <Text style={styles.hint}>{scanError}</Text>}
      {searching && <ActivityIndicator color={colors.accent} />}
      {failed && <Text style={styles.hint}>Search failed. Try again.</Text>}
      {searched && !searching && results.length === 0 && (
        <Text style={styles.hint}>No users found.</Text>
      )}
      {results.map((user) => {
        const taken = takenIds.has(String(user.id));
        return (
          <TouchableOpacity
            key={String(user.id)}
            style={styles.result}
            onPress={() => onPick(user)}
            disabled={taken}
            accessibilityRole="button"
            accessibilityState={{ disabled: taken }}
            accessibilityLabel={
              taken ? `${user.username}, already added` : `Send ${user.username} a trainer request`
            }
          >
            <Text style={styles.resultName}>{user.username}</Text>
            <Text style={taken ? styles.resultTaken : styles.resultAction}>
              {taken ? "Already added" : "Send request"}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ModalSheet>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    searchRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
    input: {
      flex: 1,
      minHeight: 48,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      backgroundColor: colors.inputBackground,
      color: colors.textPrimary,
    },
    searchButton: {
      minHeight: 48,
      paddingHorizontal: 16,
      justifyContent: "center",
      borderRadius: 10,
      backgroundColor: colors.accent,
    },
    searchButtonText: { color: colors.textOnAccent, fontWeight: "600", textAlign: "center" },
    scanButton: {
      minHeight: 48,
      minWidth: 48,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.inputBorder,
    },
    scanIcon: { fontSize: 20 },
    scanner: {
      flex: 1,
      minHeight: 420,
      marginBottom: 12,
      borderRadius: 16,
      overflow: "hidden",
      backgroundColor: "#000",
      justifyContent: "flex-end",
    },
    scannerHint: { color: "#fff", fontSize: 14, fontWeight: "600", textAlign: "center", padding: 24 },
    disabled: { opacity: 0.5 },
    hint: { color: colors.textMuted, marginVertical: 8 },
    result: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.separator,
    },
    resultName: { color: colors.textPrimary, fontSize: 16 },
    resultAction: { color: colors.accent, fontWeight: "600" },
    resultTaken: { color: colors.textMuted },
  });
