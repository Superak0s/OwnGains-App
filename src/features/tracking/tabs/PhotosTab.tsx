import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
} from "react-native";
import PagerView from "react-native-pager-view";
import { useTheme } from "@shared/context/ThemeContext";
import { useAuthToken } from "@shared/context/AuthContext";
import { progressPhotoApi } from "../services";
import {
  ProgressPhotoMuscle,
  MUSCLE_GROUP_LABELS,
  MuscleGroup,
} from "../types/muscleRecovery";
import { LogProgressPhotoModal } from "../components/LogProgressPhotoModal";
import { ProgressPhotoThumb } from "../components/ProgressPhotoThumb";
import ModalSheet from "@shared/components/ModalSheet";
import { useAlert } from "@shared/components/CustomAlert";
import ZoomableImage from "@shared/components/ZoomableImage";
import type { WidgetDefinition } from "@shared/types";
import { toDefaultWidgets } from "@shared/types";
import { formatDate, toDateString } from "@utils/format";
import { withConfirm } from "../helpers";
import { usePhotoPages } from "../hooks/usePhotoPages";
import makeTrackingStyles from "../styles";
import {
  Button,
  Chip,
  Note,
  Placeholder,
  Row,
  SectionLabel,
  radius,
  space,
} from "../ui";
import { userFacingError } from "@shared/services/apiError";

export type PhotosWidgetType =
  | "photos_calendar"
  | "photos_gallery"
  | "photos_comparison";

export const PHOTOS_WIDGET_REGISTRY: Record<
  PhotosWidgetType,
  WidgetDefinition<PhotosWidgetType>
> = {
  photos_calendar: {
    type: "photos_calendar",
    title: "Photos Calendar",
    description: "Calendar view of days you've taken progress photos",
    availableSizes: ["medium", "large"],
    defaultSize: "large",
  },
  photos_gallery: {
    type: "photos_gallery",
    title: "Progress Photos",
    description: "Recent progress photos grouped by day, with quick capture",
    availableSizes: ["medium", "large"],
    defaultSize: "large",
  },
  photos_comparison: {
    type: "photos_comparison",
    title: "Side-by-Side Comparison",
    description: "Compare two progress photos from different dates",
    availableSizes: ["medium", "large"],
    defaultSize: "large",
  },
};

export const DEFAULT_PHOTOS_WIDGETS = toDefaultWidgets(PHOTOS_WIDGET_REGISTRY, [
  "photos_calendar",
  "photos_gallery",
  "photos_comparison",
]);

function getAngleLabel(photo: ProgressPhotoMuscle): string {
  if (photo.angle === "custom" && photo.customSideName?.trim())
    return photo.customSideName;
  return photo.angle ?? "";
}

function photoTakenAt(photo: ProgressPhotoMuscle): string | undefined {
  return photo.takenAt ?? photo.createdAt;
}

function photoDateKey(photo: ProgressPhotoMuscle): string {
  return toDateString(photoTakenAt(photo) ?? new Date());
}

function newestFirst(a: ProgressPhotoMuscle, b: ProgressPhotoMuscle): number {
  return (
    new Date(photoTakenAt(b) ?? 0).getTime() -
    new Date(photoTakenAt(a) ?? 0).getTime()
  );
}

function groupByDate(list: ProgressPhotoMuscle[]) {
  const map = new Map<string, ProgressPhotoMuscle[]>();
  for (const photo of list) {
    const dateKey = photoDateKey(photo);
    const group = map.get(dateKey) ?? [];
    group.push(photo);
    map.set(dateKey, group);
  }
  return map;
}

function shortMuscleLabel(muscle: MuscleGroup): string {
  return MUSCLE_GROUP_LABELS[muscle]?.split(" ")[0] ?? muscle;
}

function Loading() {
  const { colors } = useTheme();
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

function PhotosLoadFailed({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <Placeholder
      text="Couldn't load your photos. Check your connection and try again."
      action={{ label: "Retry", onPress: onRetry }}
    />
  );
}

function PhotoTile({
  photo,
  authToken,
  showNote,
  onLongPress,
}: {
  readonly photo: ProgressPhotoMuscle;
  readonly authToken: string;
  readonly showNote?: boolean;
  readonly onLongPress?: () => void;
}) {
  const { colors } = useTheme();
  const body = (
    <>
      <ProgressPhotoThumb
        photo={photo}
        authToken={authToken}
        style={styles.photoImage}
      />
      <Text style={[styles.photoCaption, { color: colors.textPrimary }]}>
        {getAngleLabel(photo)}
      </Text>
      {photo.muscleGroups && photo.muscleGroups.length > 0 && (
        <Text style={[styles.photoMeta, { color: colors.textSecondary }]}>
          {photo.muscleGroups.map(shortMuscleLabel).slice(0, 3).join(", ")}
        </Text>
      )}
      {showNote && photo.note && photo.note.trim().length > 0 && (
        <Text style={[styles.photoMeta, { color: colors.textMuted }]}>
          {photo.note}
        </Text>
      )}
    </>
  );

  if (!onLongPress) return <View style={styles.photoTile}>{body}</View>;

  return (
    <TouchableOpacity
      style={styles.photoTile}
      accessibilityRole='button'
      accessibilityLabel={`Progress photo, ${getAngleLabel(photo)}. Long press to delete.`}
      onLongPress={onLongPress}
      delayLongPress={400}
    >
      {body}
    </TouchableOpacity>
  );
}

const DATE_PAGE_SIZE = 14;

export function PhotosCalendarWidget() {
  const authToken = useAuthToken();
  const { photos, loading, loadingMore, hasMore, loadFailed, refresh, loadMore } =
    usePhotoPages();
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [visibleDays, setVisibleDays] = useState(DATE_PAGE_SIZE);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const allDates = useMemo(
    () => Array.from(groupByDate([...photos].sort(newestFirst))),
    [photos],
  );
  const photoDates = useMemo(
    () => allDates.slice(0, visibleDays),
    [allDates, visibleDays],
  );

  useEffect(() => {
    if (!loading && hasMore && allDates.length <= visibleDays) loadMore();
  }, [loading, hasMore, allDates.length, visibleDays, loadMore]);

  if (loading) return <Loading />;

  if (allDates.length === 0 && loadFailed) {
    return <PhotosLoadFailed onRetry={refresh} />;
  }

  if (allDates.length === 0) {
    return (
      <Placeholder text='No photos yet. The days you shoot one will show up here.' />
    );
  }

  return (
    <View>
      {photoDates.map(([date, dayPhotos], index) => {
        const isExpanded = expandedDate === date;
        return (
          <View key={date}>
            <Row
              title={formatDate(date, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
              meta={`${dayPhotos.length} photo${dayPhotos.length > 1 ? "s" : ""}`}
              onPress={() => setExpandedDate(isExpanded ? null : date)}
              right={<Chevron open={isExpanded} />}
              last={isExpanded || index === photoDates.length - 1}
            />
            {isExpanded && (
              <View style={styles.photoGrid}>
                {dayPhotos.map((photo) => (
                  <PhotoTile
                    key={photo.id}
                    photo={photo}
                    authToken={authToken}
                    showNote
                  />
                ))}
              </View>
            )}
          </View>
        );
      })}
      {(visibleDays < allDates.length || hasMore) && (
        <View style={styles.centerAction}>
          <Button
            label={loadingMore ? "Loading…" : "Show more"}
            variant='quiet'
            size='sm'
            disabled={loadingMore}
            onPress={() => setVisibleDays((count) => count + DATE_PAGE_SIZE)}
          />
        </View>
      )}
    </View>
  );
}

function Chevron({ open }: { readonly open: boolean }) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.chevron, { color: colors.textMuted }]}>
      {open ? "⌄" : "›"}
    </Text>
  );
}

// Neither transport reports byte progress mid-transfer, so the bar is
// indeterminate while uploading. Only the finished average speed is real.
interface UploadProgressState {
  status: "uploading" | "success" | "error";
  speedMBps: number;
}

function UploadProgressBar({ state }: { readonly state: UploadProgressState }) {
  const { colors } = useTheme();
  const speed = state.speedMBps > 0 ? `${state.speedMBps.toFixed(1)} MB/s` : "";
  let text = "Upload failed";
  if (state.status === "uploading") text = "Uploading…";
  else if (state.status === "success")
    text = speed ? `Uploaded at ${speed}` : "Uploaded";

  return (
    <View style={styles.uploadBar}>
      {state.status === "uploading" && (
        <ActivityIndicator size='small' color={colors.accent} />
      )}
      <Text
        style={[
          styles.uploadText,
          { color: state.status === "error" ? colors.error : colors.textSecondary },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

const HOLD_AFTER_DONE_MS = 5000;

export function PhotosGalleryWidget() {
  const { colors } = useTheme();
  const authToken = useAuthToken();
  const { alert, AlertComponent } = useAlert();
  const {
    photos,
    setPhotos,
    loading,
    loadingMore,
    hasMore,
    loadFailed,
    refresh,
    loadMore,
  } = usePhotoPages();
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadState, setUploadState] = useState<UploadProgressState | null>(
    null,
  );
  const [visibleCount, setVisibleCount] = useState(4);
  const uploadStartRef = useRef({ startedAt: 0, totalBytes: 0 });
  const uploadHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleUploadStart = useCallback((totalBytes: number) => {
    if (uploadHideRef.current) clearTimeout(uploadHideRef.current);
    uploadStartRef.current = { startedAt: Date.now(), totalBytes };
    setUploadState({ status: "uploading", speedMBps: 0 });
  }, []);

  const handleUploadEnd = useCallback((success: boolean) => {
    const { startedAt, totalBytes } = uploadStartRef.current;
    const elapsedSec = Math.max((Date.now() - startedAt) / 1000, 0.05);
    setUploadState({
      status: success ? "success" : "error",
      speedMBps: totalBytes / (1024 * 1024) / elapsedSec,
    });
    uploadHideRef.current = setTimeout(
      () => setUploadState(null),
      HOLD_AFTER_DONE_MS,
    );
  }, []);

  useEffect(() => {
    return () => {
      if (uploadHideRef.current) clearTimeout(uploadHideRef.current);
    };
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const sortedPhotos = useMemo(() => [...photos].sort(newestFirst), [photos]);

  useEffect(() => {
    if (!loading && hasMore && photos.length <= visibleCount) loadMore();
  }, [loading, hasMore, photos.length, visibleCount, loadMore]);

  const photosByDate = useMemo(
    () => groupByDate(sortedPhotos.slice(0, visibleCount)),
    [sortedPhotos, visibleCount],
  );

  const confirmDeletePhoto = withConfirm<ProgressPhotoMuscle>(
    alert,
    () => "Delete this progress photo? This cannot be undone.",
    async (photo) => {
      try {
        await progressPhotoApi.deletePhoto(photo.id);
        setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
      } catch (error) {
        alert(
          "Error",
          userFacingError(error, "Could not delete the photo."),
          [{ text: "OK" }],
          "error",
        );
      }
    },
    "Delete Photo",
  );

  if (loading) return <Loading />;

  return (
    <View>
      <View style={styles.headerAction}>
        <Button
          label='Add photo'
          size='sm'
          onPress={() => setShowUploadModal(true)}
        />
      </View>

      {uploadState && <UploadProgressBar state={uploadState} />}

      {photosByDate.size === 0 &&
        (loadFailed ? (
          <PhotosLoadFailed onRetry={refresh} />
        ) : (
          <Placeholder text='No photos yet. Add one to start tracking how you change.' />
        ))}

      {Array.from(photosByDate.entries()).map(([date, dayPhotos]) => (
        <View key={date} style={styles.photoGroup}>
          <Text style={[styles.groupDate, { color: colors.textSecondary }]}>
            {formatDate(date, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </Text>
          <View style={styles.photoGrid}>
            {dayPhotos.map((photo) => (
              <PhotoTile
                key={photo.id}
                photo={photo}
                authToken={authToken}
                onLongPress={() => confirmDeletePhoto(photo)}
              />
            ))}
          </View>
        </View>
      ))}

      {photosByDate.size > 0 && <Note>Long-press a photo to delete it.</Note>}

      {(visibleCount < sortedPhotos.length || hasMore) && (
        <View style={styles.centerAction}>
          <Button
            label={loadingMore ? "Loading…" : "Show more"}
            variant='quiet'
            size='sm'
            disabled={loadingMore}
            onPress={() => setVisibleCount((c) => c + 4)}
          />
        </View>
      )}

      <LogProgressPhotoModal
        visible={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onSuccess={() => {
          setShowUploadModal(false);
          setVisibleCount(4);
          refresh();
        }}
        onUploadStart={handleUploadStart}
        onUploadEnd={handleUploadEnd}
      />
      {AlertComponent}
    </View>
  );
}

export function PhotosComparisonWidget() {
  const [showModal, setShowModal] = useState(false);

  return (
    <View>
      <Note>Line up two shoots from different dates and see what moved.</Note>
      <View style={styles.headerAction}>
        <Button label='Compare photos' onPress={() => setShowModal(true)} />
      </View>
      <PhotosComparisonModal
        visible={showModal}
        onClose={() => setShowModal(false)}
      />
    </View>
  );
}

function ComparisonColumn({
  label,
  photos,
  authToken,
  onPressPhoto,
}: {
  readonly label: string;
  readonly photos: ProgressPhotoMuscle[];
  readonly authToken: string;
  readonly onPressPhoto: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.comparisonColumn}>
      <Text style={[styles.comparisonDate, { color: colors.textSecondary }]}>
        {label}
      </Text>
      {photos.map((photo) => (
        <TouchableOpacity
          accessibilityRole='button'
          accessibilityLabel={`${label}, ${getAngleLabel(photo)}`}
          key={photo.id}
          style={styles.comparisonItem}
          onPress={onPressPhoto}
        >
          <ProgressPhotoThumb
            photo={photo}
            authToken={authToken}
            style={styles.comparisonImage}
          />
          <Text style={[styles.photoCaption, { color: colors.textPrimary }]}>
            {getAngleLabel(photo)}
          </Text>
          {photo.note && photo.note.trim().length > 0 && (
            <Text style={[styles.photoMeta, { color: colors.textMuted }]}>
              {photo.note}
            </Text>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const RANGE_OPTIONS = [
  { value: "all", label: "All time" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
] as const;

function PhotosComparisonModal({
  visible,
  onClose,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
}) {
  const { colors } = useTheme();
  const authToken = useAuthToken();
  const { photos, loading, loadAll } = usePhotoPages();
  const trackingStyles = useMemo(() => makeTrackingStyles(colors), [colors]);
  const [selectedDate1, setSelectedDate1] = useState<string | null>(null);
  const [selectedDate2, setSelectedDate2] = useState<string | null>(null);
  const [muscleFilter, setMuscleFilter] = useState<MuscleGroup | null>(null);
  const [muscleSearch, setMuscleSearch] = useState("");
  const [rangeFilter, setRangeFilter] = useState<"all" | "7" | "30" | "90">(
    "all",
  );
  const [fullscreenOpen, setFullscreenOpen] = useState(false);

  useEffect(() => {
    if (visible) loadAll();
  }, [visible, loadAll]);

  const availableMuscles = useMemo(() => {
    const set = new Set<MuscleGroup>();
    for (const photo of photos) {
      for (const m of photo.muscleGroups ?? []) set.add(m);
    }
    return Array.from(set);
  }, [photos]);

  const filteredMuscleOptions = useMemo(() => {
    const query = muscleSearch.trim().toLowerCase();
    if (!query) return availableMuscles;
    return availableMuscles.filter((muscle) =>
      (MUSCLE_GROUP_LABELS[muscle] ?? muscle).toLowerCase().includes(query),
    );
  }, [availableMuscles, muscleSearch]);

  const filteredPhotos = useMemo(() => {
    const cutoffMs =
      rangeFilter === "all"
        ? null
        : Date.now() - Number(rangeFilter) * 24 * 60 * 60 * 1000;
    return photos.filter((p) => {
      if (muscleFilter && !p.muscleGroups?.includes(muscleFilter)) return false;
      if (cutoffMs !== null) {
        if (new Date(photoTakenAt(p) ?? 0).getTime() < cutoffMs) return false;
      }
      return true;
    });
  }, [photos, muscleFilter, rangeFilter]);

  const availableDates = useMemo(
    () => Array.from(groupByDate([...filteredPhotos].sort(newestFirst))),
    [filteredPhotos],
  );

  const photosForDate1 = useMemo(
    () => filteredPhotos.filter((p) => photoDateKey(p) === selectedDate1),
    [filteredPhotos, selectedDate1],
  );

  const photosForDate2 = useMemo(
    () => filteredPhotos.filter((p) => photoDateKey(p) === selectedDate2),
    [filteredPhotos, selectedDate2],
  );

  const pickDate = (date: string) => {
    if (selectedDate1 && selectedDate2) {
      setSelectedDate1(date);
      setSelectedDate2(null);
    } else if (selectedDate1) {
      setSelectedDate2(date);
    } else {
      setSelectedDate1(date);
    }
  };

  return (
    <ModalSheet
      visible={visible}
      title='Compare photos'
      onClose={onClose}
      showCancelButton={false}
      showConfirmButton={false}
      scrollable
      fullHeight
    >
      {loading ? (
        <Loading />
      ) : (
        <>
          <SectionLabel>Time range</SectionLabel>
          <View style={styles.chipRow}>
            {RANGE_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={rangeFilter === option.value}
                onPress={() => setRangeFilter(option.value)}
              />
            ))}
          </View>

          {availableMuscles.length > 0 && (
            <>
              <SectionLabel>Muscle groups</SectionLabel>
              <TextInput
                style={trackingStyles.input}
                placeholder='Search muscle groups'
                placeholderTextColor={colors.textMuted}
                value={muscleSearch}
                onChangeText={setMuscleSearch}
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                <Chip
                  label='All muscles'
                  selected={!muscleFilter}
                  onPress={() => setMuscleFilter(null)}
                />
                {filteredMuscleOptions.map((muscle) => (
                  <Chip
                    key={muscle}
                    label={shortMuscleLabel(muscle)}
                    selected={muscleFilter === muscle}
                    onPress={() =>
                      setMuscleFilter(muscleFilter === muscle ? null : muscle)
                    }
                  />
                ))}
              </ScrollView>
            </>
          )}

          <SectionLabel>Dates</SectionLabel>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {availableDates.map(([date]) => (
              <Chip
                key={date}
                label={formatDate(date, { month: "short", day: "numeric" })}
                selected={selectedDate1 === date || selectedDate2 === date}
                onPress={() => pickDate(date)}
              />
            ))}
          </ScrollView>

          {selectedDate1 && selectedDate2 ? (
            <>
              <View style={styles.headerAction}>
                <Button
                  label='Open fullscreen'
                  variant='quiet'
                  size='sm'
                  onPress={() => setFullscreenOpen(true)}
                />
              </View>
              <View style={styles.comparisonRow}>
                <ComparisonColumn
                  label={new Date(selectedDate1).toLocaleDateString()}
                  photos={photosForDate1}
                  authToken={authToken}
                  onPressPhoto={() => setFullscreenOpen(true)}
                />
                <ComparisonColumn
                  label={new Date(selectedDate2).toLocaleDateString()}
                  photos={photosForDate2}
                  authToken={authToken}
                  onPressPhoto={() => setFullscreenOpen(true)}
                />
              </View>
              <FullscreenCompareViewer
                visible={fullscreenOpen}
                onClose={() => setFullscreenOpen(false)}
                photosForDate1={photosForDate1}
                photosForDate2={photosForDate2}
                dateLabel1={new Date(selectedDate1).toLocaleDateString()}
                dateLabel2={new Date(selectedDate2).toLocaleDateString()}
                authToken={authToken}
              />
            </>
          ) : (
            <Note>
              {selectedDate1
                ? "Pick a second date to compare against."
                : "Pick two dates to compare."}
            </Note>
          )}
        </>
      )}
    </ModalSheet>
  );
}

function FullscreenCompareColumn({
  photos,
  label,
  authToken,
}: {
  readonly photos: ProgressPhotoMuscle[];
  readonly label: string;
  readonly authToken: string;
}) {
  const [page, setPage] = useState(0);
  const headers = authToken
    ? { Authorization: `Bearer ${authToken}` }
    : undefined;
  if (photos.length === 0) {
    return (
      <View style={styles.fullscreenColumn}>
        <Text style={styles.fullscreenLabel}>{label}</Text>
      </View>
    );
  }
  return (
    <View style={styles.fullscreenColumn}>
      <Text style={styles.fullscreenLabel}>{label}</Text>
      <PagerView
        style={styles.fullscreenPager}
        initialPage={0}
        onPageSelected={(e) => setPage(e.nativeEvent.position)}
      >
        {photos.map((photo, i) =>
          Math.abs(i - page) <= 1 ? (
            <ZoomableImage
              key={photo.id}
              uri={photo.uri ?? ""}
              style={styles.fullscreenImage}
              headers={headers}
            />
          ) : (
            <View key={photo.id} style={styles.fullscreenImage} />
          ),
        )}
      </PagerView>
      {photos.length > 1 && (
        <View style={styles.fullscreenDots}>
          {photos.map((photo, i) => (
            <View
              key={photo.id}
              style={[
                styles.fullscreenDot,
                i === page && styles.fullscreenDotActive,
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function FullscreenCompareViewer({
  visible,
  onClose,
  photosForDate1,
  photosForDate2,
  dateLabel1,
  dateLabel2,
  authToken,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly photosForDate1: ProgressPhotoMuscle[];
  readonly photosForDate2: ProgressPhotoMuscle[];
  readonly dateLabel1: string;
  readonly dateLabel2: string;
  readonly authToken: string;
}) {
  return (
    <Modal
      visible={visible}
      animationType='fade'
      onRequestClose={onClose}
      transparent={false}
    >
      <View style={styles.fullscreenContainer}>
        <TouchableOpacity
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole='button'
          accessibilityLabel='Close photo'
          style={styles.fullscreenClose}
          onPress={onClose}
        >
          <Text style={styles.fullscreenCloseText}>✕</Text>
        </TouchableOpacity>
        <View style={styles.fullscreenRow}>
          <FullscreenCompareColumn
            photos={photosForDate1}
            label={dateLabel1}
            authToken={authToken}
          />
          <FullscreenCompareColumn
            photos={photosForDate2}
            label={dateLabel2}
            authToken={authToken}
          />
        </View>
        <Text style={styles.fullscreenHint}>
          Pinch to zoom, double-tap to reset, swipe to browse
        </Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: "center", paddingVertical: space.xl },
  chevron: { fontSize: 20 },
  centerAction: { alignItems: "center", marginTop: space.md },
  headerAction: { flexDirection: "row", marginBottom: space.md },

  photoGroup: { marginBottom: space.lg },
  groupDate: { fontSize: 13, fontWeight: "600", marginBottom: space.sm },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    paddingBottom: space.sm,
  },
  photoTile: { width: "48%" },
  photoImage: { width: "100%", height: 130, borderRadius: radius.md },
  photoCaption: { fontSize: 12, fontWeight: "500", marginTop: 6 },
  photoMeta: { fontSize: 11, marginTop: 2 },

  uploadBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginBottom: space.md,
  },
  uploadText: { fontSize: 12 },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },

  comparisonRow: { flexDirection: "row", gap: space.md },
  comparisonColumn: { flex: 1 },
  comparisonDate: { fontSize: 12, fontWeight: "600", marginBottom: space.sm },
  comparisonItem: { marginBottom: space.md },
  comparisonImage: { width: "100%", height: 160, borderRadius: radius.md },

  fullscreenContainer: { flex: 1, backgroundColor: "#000", paddingTop: 48 },
  fullscreenClose: {
    position: "absolute",
    top: 48,
    right: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  fullscreenCloseText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  fullscreenRow: { flex: 1, flexDirection: "row" },
  fullscreenColumn: { flex: 1 },
  fullscreenLabel: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: space.sm,
  },
  fullscreenPager: { flex: 1 },
  fullscreenImage: { flex: 1 },
  fullscreenDots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    paddingVertical: space.sm,
  },
  fullscreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  fullscreenDotActive: { backgroundColor: "#fff" },
  fullscreenHint: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
    textAlign: "center",
    paddingVertical: 10,
  },
});

export const PHOTOS_TAB_CONFIG = {
  key: "photos",
  label: "Photos",
};
