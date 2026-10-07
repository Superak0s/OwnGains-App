import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import ScreenTitle from "@shared/components/ScreenTitle";
import {
  useFocusEffect,
  useNavigation,
  useRoute,
} from "@react-navigation/native";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@shared/context/AuthContext";
import { onLocalOnlyFeaturesChange } from "@shared/services/localOnlyFeatures";
import { useTheme } from "@shared/context/ThemeContext";
import ModalSheet from "@shared/components/ModalSheet";
import ScrollTabBar from "@shared/components/ScrollTabBar";
import LocalOnlyNotice from "@shared/components/LocalOnlyNotice";
import { useAlert } from "@shared/components/CustomAlert";
import {
  bodyTrackingApi,
  macrosTrackingApi,
  bodyFatApi,
  hydrationApi,
  sorenessApi,
  bodyMeasurementsApi,
} from "./services";
import { LogCycleModal } from "./tabs/MenstrualTab";
import { LogSorenessModal } from "./tabs/SorenessTab";
import { LogHydrationModal } from "./tabs/HydrationTab";
import {
  renderWeightWidget,
  renderBodyFatWidget,
  renderHydrationWidget,
  renderMeasurementWidget,
  renderMacrosWidget,
  renderSorenessWidget,
  renderMenstrualWidget,
  renderPhotosWidget,
} from "./widgets";
import { useWidgets, useWidgetBoard } from "@shared/context/hooks/useWidgets";
import type {
  WidgetInstance,
  WidgetDefinition,
  WeightEntry,
} from "@shared/types";
import { toDefaultWidgets } from "@shared/types";
import HealthWidget from "@features/healthConnect/HealthWidget";
import {
  HEALTH_WIDGET_REGISTRY,
  type HealthWidgetType,
} from "@features/healthConnect/widgets";
import WidgetGallery from "@shared/components/widgets/WidgetGallery";
import WidgetEditButton from "@shared/components/widgets/WidgetEditButton";
import {
  WidgetPullHint,
  WidgetEditHeader,
} from "@shared/components/widgets/WidgetBoardChrome";
import WidgetsPanel from "@shared/components/widgets/WidgetsPanel";
import { embedInstance } from "@shared/components/widgets/embedWidget";
import { TRACKING_TABS } from "./tabs";
import {
  WEIGHT_WIDGET_REGISTRY,
  DEFAULT_WEIGHT_WIDGETS,
  type WeightWidgetType,
} from "./tabs/WeightTab";
import {
  PHOTOS_WIDGET_REGISTRY,
  DEFAULT_PHOTOS_WIDGETS,
  type PhotosWidgetType,
} from "./tabs/PhotosTab";
import {
  MACROS_WIDGET_REGISTRY,
  DEFAULT_MACROS_WIDGETS,
  type MacrosWidgetType,
} from "./tabs/MacrosTab";
import {
  BODYFAT_WIDGET_REGISTRY,
  DEFAULT_BODYFAT_WIDGETS,
  type BodyFatWidgetType,
} from "./tabs/BodyFatTab";
import {
  MEASUREMENTS_WIDGET_REGISTRY,
  DEFAULT_MEASUREMENTS_WIDGETS,
  type MeasurementsWidgetType,
} from "./tabs/MeasurementsTab";
import {
  HYDRATION_WIDGET_REGISTRY,
  DEFAULT_HYDRATION_WIDGETS,
  type HydrationWidgetType,
} from "./tabs/HydrationTab";
import {
  SORENESS_WIDGET_REGISTRY,
  DEFAULT_SORENESS_WIDGETS,
  type SorenessWidgetType,
} from "./tabs/SorenessTab";
import {
  MENSTRUAL_WIDGET_REGISTRY,
  DEFAULT_MENSTRUAL_WIDGETS,
  type MenstrualWidgetType,
} from "./tabs/MenstrualTab";
import type {
  DayModalState,
  TrackingEntry,
  MacrosEntryWithFields,
  BodyFatEntryWithFields,
} from "./types";
import type {
  HydrationEntry,
  MenstrualEntry,
  MeasurementEntry,
  SorenessEntry,
} from "./services/types";
import { useWeightTab } from "./hooks/useWeightTab";
import { useMacrosTab } from "./hooks/useMacrosTab";
import { useBodyFatTab } from "./hooks/useBodyFatTab";
import { useMeasurementsTab } from "./hooks/useMeasurementsTab";
import { useHydrationTab } from "./hooks/useHydrationTab";
import { useSorenessTab } from "./hooks/useSorenessTab";
import { useMenstrualTab } from "./hooks/useMenstrualTab";
import {
  buildLocalISOForDate,
  isoToLocalDateStr,
  getCycleDuration,
  formatDateLabel,
  hasTapeMeasurements,
} from "./utils";
import { toDateString, formatDate } from "@utils/format";
import { getUserKey, STORAGE_KEYS } from "@shared/services/storage";
import makeStyles from "./styles";
import {
  BodyFatCalcModal,
  HeightModal,
  MacrosGoalModal,
  MacrosLogModal,
  MeasurementLogModal,
  WeightLogModal,
} from "./components/BodyLogModals";
import { Button, IconButton, Note, Placeholder, Row, SectionLabel } from "./ui";
import {
  captureException,
  metric,
  trackScreenView,
  reportAndReturn,
} from "@shared/services/crashReporting";

type TrackingWidgetType =
  | WeightWidgetType
  | PhotosWidgetType
  | MacrosWidgetType
  | BodyFatWidgetType
  | MeasurementsWidgetType
  | HydrationWidgetType
  | SorenessWidgetType
  | MenstrualWidgetType
  | HealthWidgetType;

const DEFAULT_HEALTH_WIDGETS = toDefaultWidgets(HEALTH_WIDGET_REGISTRY, [
  "health_steps",
  "health_heart_rate",
  "health_sleep",
  "health_steps_trend",
  "health_heart_rate_trend",
  "health_sleep_trend",
]);

type TrackingBoard = ReturnType<typeof useWidgets<TrackingWidgetType>>;

// Each tab's board is generic over its own widget-type union, so the boards
// only share a type once `addWidget` is widened back to the full union.
function toTrackingBoard<T extends TrackingWidgetType>(
  board: ReturnType<typeof useWidgets<T>>,
): TrackingBoard {
  return { ...board, addWidget: (type) => board.addWidget(type as T) };
}

const registryMap: Record<
  string,
  Record<string, WidgetDefinition<TrackingWidgetType>>
> = {
  weight: WEIGHT_WIDGET_REGISTRY,
  photos: PHOTOS_WIDGET_REGISTRY,
  macros: MACROS_WIDGET_REGISTRY,
  bodyfat: BODYFAT_WIDGET_REGISTRY,
  measurements: MEASUREMENTS_WIDGET_REGISTRY,
  hydration: HYDRATION_WIDGET_REGISTRY,
  soreness: SORENESS_WIDGET_REGISTRY,
  menstrual: MENSTRUAL_WIDGET_REGISTRY,
  health: HEALTH_WIDGET_REGISTRY,
};

function tabForWidget(type: TrackingWidgetType): string {
  return (
    Object.keys(registryMap).find((tab) => type in registryMap[tab]) ?? "weight"
  );
}

function useTrackingBoards(userId: string | null, activeTab: string) {
  const weightBoard = useWidgets<WeightWidgetType>(userId, {
    registry: WEIGHT_WIDGET_REGISTRY,
    defaults: DEFAULT_WEIGHT_WIDGETS,
    storageKey: STORAGE_KEYS.WEIGHT_TAB_WIDGETS,
    enabled: activeTab === "weight",
  });
  const photosBoard = useWidgets<PhotosWidgetType>(userId, {
    registry: PHOTOS_WIDGET_REGISTRY,
    defaults: DEFAULT_PHOTOS_WIDGETS,
    storageKey: STORAGE_KEYS.PHOTOS_TAB_WIDGETS,
    enabled: activeTab === "photos",
  });
  const macrosBoard = useWidgets<MacrosWidgetType>(userId, {
    registry: MACROS_WIDGET_REGISTRY,
    defaults: DEFAULT_MACROS_WIDGETS,
    storageKey: STORAGE_KEYS.MACROS_TAB_WIDGETS,
    enabled: activeTab === "macros",
  });
  const bodyFatBoard = useWidgets<BodyFatWidgetType>(userId, {
    registry: BODYFAT_WIDGET_REGISTRY,
    defaults: DEFAULT_BODYFAT_WIDGETS,
    storageKey: STORAGE_KEYS.BODYFAT_TAB_WIDGETS,
    enabled: activeTab === "bodyfat",
  });
  const measurementsBoard = useWidgets<MeasurementsWidgetType>(userId, {
    registry: MEASUREMENTS_WIDGET_REGISTRY,
    defaults: DEFAULT_MEASUREMENTS_WIDGETS,
    storageKey: STORAGE_KEYS.MEASUREMENTS_TAB_WIDGETS,
    enabled: activeTab === "measurements",
  });
  const hydrationBoard = useWidgets<HydrationWidgetType>(userId, {
    registry: HYDRATION_WIDGET_REGISTRY,
    defaults: DEFAULT_HYDRATION_WIDGETS,
    storageKey: STORAGE_KEYS.HYDRATION_TAB_WIDGETS,
    enabled: activeTab === "hydration",
  });
  const sorenessBoard = useWidgets<SorenessWidgetType>(userId, {
    registry: SORENESS_WIDGET_REGISTRY,
    defaults: DEFAULT_SORENESS_WIDGETS,
    storageKey: STORAGE_KEYS.SORENESS_TAB_WIDGETS,
    enabled: activeTab === "soreness",
  });
  const menstrualBoard = useWidgets<MenstrualWidgetType>(userId, {
    registry: MENSTRUAL_WIDGET_REGISTRY,
    defaults: DEFAULT_MENSTRUAL_WIDGETS,
    storageKey: STORAGE_KEYS.MENSTRUAL_TAB_WIDGETS,
    enabled: activeTab === "menstrual",
  });
  const healthBoard = useWidgets<HealthWidgetType>(userId, {
    registry: HEALTH_WIDGET_REGISTRY,
    defaults: DEFAULT_HEALTH_WIDGETS,
    storageKey: STORAGE_KEYS.HEALTH_TAB_WIDGETS,
    enabled: activeTab === "health",
  });
  const boardMap: Record<string, TrackingBoard> = {
    weight: toTrackingBoard(weightBoard),
    photos: toTrackingBoard(photosBoard),
    macros: toTrackingBoard(macrosBoard),
    bodyfat: toTrackingBoard(bodyFatBoard),
    measurements: toTrackingBoard(measurementsBoard),
    hydration: toTrackingBoard(hydrationBoard),
    soreness: toTrackingBoard(sorenessBoard),
    menstrual: toTrackingBoard(menstrualBoard),
    health: toTrackingBoard(healthBoard),
  };
  return {
    activeBoard: boardMap[activeTab] ?? boardMap.weight,
    activeRegistry: registryMap[activeTab] ?? registryMap.weight,
  };
}

interface DayTabMeta {
  icon: string;
  title: string;
  actionLabel: string;
}

const DAY_TAB_META: Record<string, DayTabMeta> = {
  weight: { icon: "⚖️", title: "Weight", actionLabel: "Log Weight" },
  macros: { icon: "🥗", title: "Macros", actionLabel: "Log Macros" },
  photos: { icon: "📸", title: "Photos", actionLabel: "Add Photo" },
  bodyfat: {
    icon: "📐",
    title: "Body Fat",
    actionLabel: "Calculate Body Fat",
  },
  measurements: {
    icon: "📏",
    title: "Measurements",
    actionLabel: "Log Measurements",
  },
  hydration: { icon: "💧", title: "Hydration", actionLabel: "Log Water" },
  soreness: { icon: "💪", title: "Soreness", actionLabel: "Log Soreness" },
  menstrual: { icon: "🌸", title: "Cycle", actionLabel: "Log Cycle" },
};
const DAY_TAB_FALLBACK: DayTabMeta = {
  icon: "📐",
  title: "Entry",
  actionLabel: "Add Entry",
};

export default function TrackingScreen({
  embedWidget,
}: {
  readonly embedWidget?: TrackingWidgetType;
} = {}) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { alert, AlertComponent } = useAlert();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [sorenessModalOpen, setSorenessModalOpen] = useState(false);
  const [hydrationModalOpen, setHydrationModalOpen] = useState(false);
  const [cycleModalOpen, setCycleModalOpen] = useState(false);

  const [activeTab, setActiveTab] = useState(() =>
    embedWidget ? tabForWidget(embedWidget) : TRACKING_TABS[0].key,
  );
  const [refreshing, setRefreshing] = useState(false);
  const navigation = useNavigation();
  const requestedTab = (useRoute().params as { tab?: string } | undefined)?.tab;
  useEffect(() => {
    if (!requestedTab || embedWidget) return;
    setActiveTab(requestedTab);
    // Cleared so the next request for the same tab still switches to it.
    navigation.setParams({ tab: undefined } as never);
  }, [requestedTab, embedWidget, navigation]);
  const [dayModal, setDayModal] = useState<DayModalState | null>(null);
  const [selectedLogDate, setSelectedLogDate] = useState<Date | null>(null);
  const loadDataRef = useRef<() => Promise<void>>(async () => {});

  const _weight = useWeightTab({
    alert,
    loadData: loadDataRef.current,
    setDayModal,
    selectedLogDate,
    setSelectedLogDate,
    buildLocalISOForDate,
    user,
  });
  const _macros = useMacrosTab({
    alert,
    loadData: loadDataRef.current,
    setDayModal,
    selectedLogDate,
    setSelectedLogDate,
  });
  const { setShowHeightModal } = _weight;
  const openHeightModal = useCallback(
    () => setShowHeightModal(true),
    [setShowHeightModal],
  );
  const _bodyFat = useBodyFatTab({
    alert,
    loadData: loadDataRef.current,
    setDayModal,
    selectedLogDate,
    setSelectedLogDate,
    height: _weight.height,
    getUserKey,
    savedFormulaSex: user?.bfFormulaSex,
    openHeightModal,
  });
  const _measurements = useMeasurementsTab({
    alert,
    loadTabData: loadDataRef.current,
    setDayModal,
    selectedLogDate,
    setSelectedLogDate,
    buildLocalISOForDate,
  });
  const _hydration = useHydrationTab({
    alert,
    loadTabData: loadDataRef.current,
    setDayModal,
    selectedLogDate,
    setSelectedLogDate,
    buildLocalISOForDate,
  });
  const _soreness = useSorenessTab({ alert, setDayModal });
  const _menstrual = useMenstrualTab({ alert, user, setDayModal });

  const { getWeightTrend, getWeightChartData } = _weight;
  const weightTrend = useMemo(() => getWeightTrend(), [getWeightTrend]);
  const weightChartData = useMemo(
    () => getWeightChartData(),
    [getWeightChartData],
  );
  const { getDailyMacrosStats } = _macros;
  const todayKey = toDateString(new Date());
  const todayMacrosStats = useMemo(
    () => getDailyMacrosStats(new Date(`${todayKey}T00:00:00`)),
    [getDailyMacrosStats, todayKey],
  );

  const weight = {
    history: _weight.weightHistory,
    weightUnit: _weight.weightUnit,
    showWeightModal: _weight.showWeightModal,
    openWeightModal: _weight.openWeightModal,
    closeWeightModal: () => _weight.setShowWeightModal(false),
    entriesShown: _weight.weightEntriesShown,
    trendAverageDays: _weight.trendAverageDays,
    setTrendAverageDays: _weight.setTrendAverageDays,
    trend: weightTrend,
    chartData: weightChartData,
    loadMoreEntries: _weight.loadMoreWeightEntries,
    deleteWeightEntry: _weight.deleteWeightEntry,
    addWeight: _weight.addWeight,
    hasDataOnDate: _weight.hasWeightData,
  };

  const macros = {
    entries: _macros.macrosEntries,
    goals: _macros.dailyMacrosGoals,
    showMacrosModal: _macros.showMacrosModal,
    openMacrosModal: _macros.openMacrosModal,
    closeMacrosModal: () => _macros.setShowMacrosModal(false),
    showMacrosGoalModal: _macros.showMacrosGoalModal,
    openGoalModal: () => _macros.setShowMacrosGoalModal(true),
    closeGoalModal: () => _macros.setShowMacrosGoalModal(false),
    deleteMacroEntry: _macros.deleteMacroEntry,
    addMacrosEntry: _macros.addMacrosEntry,
    updateMacrosGoals: _macros.updateMacrosGoals,
    dailyStats: todayMacrosStats,
    hasDataOnDate: _macros.hasMacrosData,
    savedFoods: _macros.savedFoods,
    quickLogSavedFood: _macros.quickLogSavedFood,
    removeSavedFood: _macros.removeSavedFood,
  };

  const bodyFat = {
    history: _bodyFat.bodyFatHistory,
    height: _weight.height,
    heightUnit: _weight.heightUnit,
    setHeightUnit: _weight.setHeightUnit,
    showHeightModal: _weight.showHeightModal,
    openHeightModal: () => _weight.setShowHeightModal(true),
    closeHeightModal: () => _weight.setShowHeightModal(false),
    showBodyFatModal: _bodyFat.showBodyFatModal,
    openBodyFatModal: _bodyFat.openBodyFatModal,
    closeBodyFatModal: () => _bodyFat.setShowBodyFatModal(false),
    gender: _bodyFat.gender,
    setGenderPersist: _bodyFat.setGenderPersist,
    measurementUnit: _bodyFat.measurementUnit,
    setMeasurementUnit: _bodyFat.setMeasurementUnit,
    deleteBodyFatEntry: _bodyFat.deleteBodyFatEntry,
    calculateBodyFat: _bodyFat.calculateBodyFat,
    saveHeight: _weight.saveHeight,
    hasDataOnDate: _bodyFat.hasBodyFatData,
  };

  const measurements = {
    history: _measurements.measurementHistory,
    showMeasurementModal: _measurements.showMeasurementModal,
    openMeasurementModal: () => _measurements.setShowMeasurementModal(true),
    closeMeasurementModal: () => _measurements.setShowMeasurementModal(false),
    deleteMeasurementEntry: _measurements.deleteMeasurementEntry,
    handleLogMeasurement: _measurements.handleLogMeasurement,
    hasDataOnDate: _measurements.hasMeasurementsData,
  };

  const hydration = {
    entries: _hydration.hydrationEntries,
    goal: _hydration.hydrationGoal,
    setGoal: _hydration.setHydrationGoal,
    openHydrationModal: () => setHydrationModalOpen(true),
    deleteHydrationEntry: _hydration.deleteHydrationEntry,
    hasDataOnDate: _hydration.hasHydrationData,
  };

  const soreness = {
    entries: _soreness.sorenessEntries,
    openSorenessModal: () => setSorenessModalOpen(true),
    deleteSorenessEntry: _soreness.deleteSorenessEntry,
    hasDataOnDate: _soreness.hasSorenessData,
  };

  const menstrual = {
    entries: _menstrual.cycleEntries,
    prefs: _menstrual.menstrualPrefs,
    setPrefs: _menstrual.setMenstrualPrefs,
    actualDays: _menstrual.cycleActualDays,
    predictedDays: _menstrual.cyclePredictedDays,
    setPredictedDays: _menstrual.setCyclePredictedDays,
    openCycleModal: () => setCycleModalOpen(true),
    hasDataOnDate: _menstrual.hasCycleData,
    isOnPeriod: _menstrual.isOnPeriod,
    markPeriodOver: _menstrual.markPeriodOver,
    deleteCycleEntry: _menstrual.deleteCycleEntry,
  };

  const userId = user?.id ?? null;
  const { activeBoard, activeRegistry } = useTrackingBoards(userId, activeTab);

  const widgetBoard = useWidgetBoard<TrackingWidgetType>(activeBoard.addWidget);
  const { editWidgets } = widgetBoard;

  // Each tab's history is fetched only once its tab is actually visited,
  // not all eight at once on mount, to avoid hammering SQLite for tabs the
  // user may never open this session.
  const tabLoaders: Record<string, () => Promise<void>> = {
    weight: async () => {
      const w = await bodyTrackingApi.getWeightHistory(200);
      _weight.setWeightHistory(w?.entries ?? []);
    },
    macros: async () => {
      const m = await macrosTrackingApi.getMacrosHistory(90);
      _macros.setMacrosEntries(m?.entries ?? []);
    },
    bodyfat: async () => {
      const b = await bodyFatApi.getBodyFatHistory(200);
      _bodyFat.setBodyFatHistory(b?.entries ?? []);
    },
    measurements: async () => {
      const me = await bodyMeasurementsApi.getMeasurementHistory(200);
      _measurements.setMeasurementHistory(me?.data ?? []);
    },
    hydration: async () => {
      const [h, settings] = await Promise.all([
        hydrationApi.getHydrationHistory(200),
        hydrationApi
          .getSettings()
          .catch(reportAndReturn(null, { stage: "loadHydrationSettings" })),
      ]);
      _hydration.setHydrationEntries(h?.data ?? []);
      if (settings?.data?.goalMl) {
        _hydration.setHydrationGoal(settings.data.goalMl);
      }
    },
    soreness: async () => {
      const s = await sorenessApi.getSorenessHistory(200);
      _soreness.setSorenessEntries(s?.data ?? []);
    },
    menstrual: async () => {
      await _menstrual.loadMenstrualData();
    },
  };
  const tabLoadersRef = useRef(tabLoaders);
  tabLoadersRef.current = tabLoaders;
  const loadedTabsRef = useRef<Set<string>>(new Set());
  const [tabLoadError, setTabLoadError] = useState<string | null>(null);
  const [loadingTab, setLoadingTab] = useState<string | null>(null);

  const loadTab = useCallback(async (tab: string, force = false) => {
    const isRefresh = loadedTabsRef.current.has(tab);
    if (!force && isRefresh) return;
    // Refreshes keep the current entries on screen instead of a loading banner.
    if (!isRefresh) setLoadingTab(tab);
    try {
      await tabLoadersRef.current[tab]?.();
      loadedTabsRef.current.add(tab);
      setTabLoadError(null);
    } catch (error) {
      console.error(`Failed to load ${tab} tab data:`, error);
      metric.count("tracking.tab_load_failed", 1, { attributes: { tab } });
      captureException(error, { stage: "loadTabData", tab });
      setTabLoadError(tab);
    } finally {
      setLoadingTab((current) => (current === tab ? null : current));
    }
  }, []);

  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  // Stable identity (empty deps): tab hooks depend on this in their own
  // effects, so a new function every render would re-trigger them forever.
  const loadActiveTab = useCallback(
    (force = false) => loadTab(activeTabRef.current, force),
    [loadTab],
  );
  const forceReloadActiveTab = useCallback(
    () => loadActiveTab(true),
    [loadActiveTab],
  );

  // Tab screens stay mounted, so entries logged on another screen (or the
  // Home board embedding this one) would otherwise never appear here.
  useFocusEffect(
    useCallback(() => {
      if (loadedTabsRef.current.has(activeTabRef.current)) {
        void loadActiveTab(true);
      }
    }, [loadActiveTab]),
  );

  // The server can start or stop storing this feature's data while the app
  // stays online. Tabs already loaded would then keep showing the other
  // store's rows until a refresh, so the flip re-arms every tab and reloads
  // the active one.
  useEffect(() => {
    return onLocalOnlyFeaturesChange((change) => {
      if (
        !change.nowLocal.includes("tracking") &&
        !change.nowOnServer.includes("tracking")
      )
        return;
      loadedTabsRef.current.clear();
      void loadActiveTab(true);
    });
  }, [loadActiveTab]);

  const isTabLoading = loadingTab === activeTab;

  loadDataRef.current = forceReloadActiveTab;
  useEffect(() => {
    loadTab(activeTab);
  }, [activeTab, loadTab]);
  useEffect(() => {
    trackScreenView(`Tracking/${activeTab}`);
  }, [activeTab]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadActiveTab(true);
    setRefreshing(false);
  }, [loadActiveTab]);

  const handleCalendarDatePress = useCallback(
    (date: Date, type: string) => {
      const dateStr = toDateString(date);
      const onDate = (iso: string | null | undefined) =>
        isoToLocalDateStr(iso) === dateStr;
      let existingEntries: TrackingEntry[] = [];
      switch (type) {
        case "weight":
          existingEntries = weight.history.filter((e) => onDate(e.recordedAt));
          break;
        case "macros":
          existingEntries = macros.entries.filter((e) =>
            onDate(e.date ?? e.loggedAt),
          );
          break;
        case "bodyfat":
          existingEntries = bodyFat.history.filter((e) =>
            onDate(e.date ?? e.recordedAt ?? e.calculatedAt),
          );
          break;
        case "measurements":
          existingEntries = measurements.history.filter((e) =>
            onDate(e.measuredAt),
          );
          break;
        case "hydration":
          existingEntries = hydration.entries.filter((e) => onDate(e.loggedAt));
          break;
        case "soreness":
          existingEntries = soreness.entries.filter((e) => onDate(e.loggedAt));
          break;
        case "menstrual":
          existingEntries = menstrual.entries.filter((e) => {
            const start = new Date(e.cycleStart);
            if (Number.isNaN(start.getTime())) return false;
            const days = getCycleDuration(e, menstrual.prefs.periodLengthDays);
            for (let d = 0; d < days; d++) {
              const day = new Date(start);
              day.setDate(day.getDate() + d);
              if (onDate(day.toISOString())) return true;
            }
            return false;
          });
          break;
        default:
          existingEntries = [];
      }
      setSelectedLogDate(date);
      setDayModal({
        date,
        tab: type,
        existingEntries,
        isToday: dateStr === toDateString(new Date()),
      });
    },
    [
      weight.history,
      macros.entries,
      bodyFat.history,
      measurements.history,
      hydration.entries,
      soreness.entries,
      menstrual.entries,
      menstrual.prefs,
    ],
  );

  const openLogModalForTab = (tab: string) => {
    switch (tab) {
      case "weight":
        weight.openWeightModal();
        break;
      case "macros":
        macros.openMacrosModal();
        break;
      case "bodyfat":
        bodyFat.openBodyFatModal();
        break;
      case "measurements":
        measurements.openMeasurementModal();
        break;
      case "hydration":
        hydration.openHydrationModal();
        break;
      case "soreness":
        setSorenessModalOpen(true);
        break;
      case "menstrual":
        setCycleModalOpen(true);
        break;
      default:
        weight.openWeightModal();
    }
  };

  // A tab tops out at six widgets. Past that the gallery sends the user to
  // edit mode to remove one instead of silently refusing the add.
  const handleAddWidget = useCallback(
    (widgetType: TrackingWidgetType) => {
      if (activeBoard.widgets.length < 6) {
        activeBoard.addWidget(widgetType);
      } else {
        editWidgets();
      }
    },
    [activeBoard, editWidgets],
  );

  const renderDayModalExistingEntries = () => {
    const existingEntries = dayModal?.existingEntries;
    if (!existingEntries || existingEntries.length === 0) return null;
    const { tab } = dayModal;

    const timeOf = (iso: string) =>
      new Date(iso).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

    let heading = "Logged entries";
    let rows: {
      key: string | number;
      title: string;
      meta?: string;
      value?: string;
      deleteLabel: string;
      onDelete?: () => void;
    }[] = [];

    if (tab === "weight") {
      rows = (existingEntries as WeightEntry[]).map((entry, i) => {
        const wkg = Number(entry.weightKg);
        return {
          key: entry.id ?? i,
          title:
            weight.weightUnit === "kg"
              ? `${wkg.toFixed(1)} kg`
              : `${(wkg * 2.20462).toFixed(1)} lbs`,
          meta: timeOf(entry.recordedAt),
          deleteLabel: "Delete weight entry",
          onDelete: () => weight.deleteWeightEntry(entry),
        };
      });
    } else if (tab === "macros") {
      rows = (existingEntries as MacrosEntryWithFields[]).map((entry, i) => ({
        key: entry.id ?? i,
        title: entry.name || "Meal",
        meta: [
          entry.time,
          entry.calories == null
            ? null
            : `${Number(entry.calories).toFixed(0)} kcal`,
          entry.protein == null
            ? null
            : `P ${Number(entry.protein).toFixed(0)}g`,
          entry.carbs == null ? null : `C ${Number(entry.carbs).toFixed(0)}g`,
          entry.fat == null ? null : `F ${Number(entry.fat).toFixed(0)}g`,
        ]
          .filter(Boolean)
          .join(" · "),
        deleteLabel: "Delete meal entry",
        onDelete: () => macros.deleteMacroEntry(entry),
      }));
    } else if (tab === "bodyfat") {
      heading = "Logged measurement";
      rows = (existingEntries as BodyFatEntryWithFields[]).map((entry, i) => {
        const m = entry.measurements;
        return {
          key: entry.id ?? i,
          title: `${Number(entry.percentage).toFixed(1)}%`,
          meta: hasTapeMeasurements(entry)
            ? [
                `Waist ${m?.waist == null ? "—" : Number(m.waist).toFixed(1)} cm`,
                `Neck ${m?.neck == null ? "—" : Number(m.neck).toFixed(1)} cm`,
                m?.hip != null && m.hip !== 0
                  ? `Hip ${Number(m.hip).toFixed(1)} cm`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")
            : "Health Connect",
          deleteLabel: "Delete body fat entry",
          onDelete: () => bodyFat.deleteBodyFatEntry(entry),
        };
      });
    } else if (tab === "measurements") {
      heading = "Logged measurements";
      rows = (existingEntries as MeasurementEntry[]).map((entry, i) => ({
        key: entry.id ?? i,
        title:
          [
            entry.waistCm == null ? null : `Waist ${entry.waistCm} cm`,
            entry.chestCm == null ? null : `Chest ${entry.chestCm} cm`,
            entry.armLeftCm == null ? null : `L arm ${entry.armLeftCm} cm`,
            entry.armRightCm == null ? null : `R arm ${entry.armRightCm} cm`,
          ]
            .filter(Boolean)
            .join(" · ") || "Measurement",
        meta: timeOf(entry.measuredAt),
        deleteLabel: "Delete measurement entry",
        onDelete: () => measurements.deleteMeasurementEntry(entry),
      }));
    } else if (tab === "hydration") {
      rows = (existingEntries as HydrationEntry[]).map((entry, i) => ({
        key: entry.id ?? i,
        title: `${Number(entry.amountMl).toFixed(0)} ml`,
        meta: timeOf(entry.loggedAt),
        deleteLabel: "Delete water entry",
        onDelete: () => hydration.deleteHydrationEntry(entry),
      }));
    } else if (tab === "soreness") {
      rows = (existingEntries as SorenessEntry[]).map((entry, i) => ({
        key: entry.id ?? i,
        title: entry.muscleGroup ?? "—",
        meta: `Intensity ${entry.intensity ?? 0}/10`,
        deleteLabel: "Delete soreness entry",
        onDelete: () => soreness.deleteSorenessEntry(entry),
      }));
    } else if (tab === "menstrual") {
      heading = "Period logged";
      rows = (existingEntries as MenstrualEntry[]).map((entry, i) => ({
        key: entry.id ?? i,
        title: `Period started ${formatDateLabel(entry.cycleStart)}`,
        meta: entry.symptoms?.length ? entry.symptoms.join(", ") : undefined,
        deleteLabel: "Delete period entry",
        onDelete:
          entry.id == null
            ? undefined
            : () => menstrual.deleteCycleEntry(entry),
      }));
    } else {
      return null;
    }

    return (
      <View style={styles.loggedBlock}>
        <SectionLabel>{heading}</SectionLabel>
        {rows.map((row, i) => (
          <Row
            key={row.key}
            title={row.title}
            meta={row.meta}
            value={row.value}
            last={i === rows.length - 1}
            right={
              row.onDelete ? (
                <IconButton
                  glyph='🗑'
                  label={row.deleteLabel}
                  tone='danger'
                  onPress={row.onDelete}
                />
              ) : undefined
            }
          />
        ))}
      </View>
    );
  };

  const renderWidgetContent = (
    instance: WidgetInstance<string>,
  ): React.ReactNode => {
    const tab = instance.type.split("_")[0];

    if (tab === "weight") {
      return renderWeightWidget(instance.type, {
        history: weight.history,
        weightUnit: weight.weightUnit,
        entriesShown: weight.entriesShown,
        trendAverageDays: weight.trendAverageDays,
        setTrendAverageDays: weight.setTrendAverageDays,
        trend: weight.trend,
        chartData: weight.chartData,
        loadMoreEntries: weight.loadMoreEntries,
        deleteWeightEntry: weight.deleteWeightEntry,
        openWeightModal: () => weight.openWeightModal(),
        setSelectedLogDate,
        hasDataOnDate: weight.hasDataOnDate,
        colors,
        styles,
        handleCalendarDatePress,
      });
    }

    if (tab === "bodyfat") {
      return renderBodyFatWidget(instance.type, {
        history: bodyFat.history,
        height: bodyFat.height,
        heightUnit: bodyFat.heightUnit,
        openHeightModal: () => bodyFat.openHeightModal(),
        openBodyFatModal: () => bodyFat.openBodyFatModal(),
        setSelectedLogDate,
        deleteBodyFatEntry: bodyFat.deleteBodyFatEntry,
        hasDataOnDate: bodyFat.hasDataOnDate,
        colors,
        styles,
        handleCalendarDatePress,
      });
    }

    if (tab === "hydration") {
      return renderHydrationWidget(instance.type, {
        entries: hydration.entries,
        goal: hydration.goal,
        setGoal: hydration.setGoal,
        openHydrationModal: () => hydration.openHydrationModal(),
        setSelectedLogDate,
        deleteHydrationEntry: hydration.deleteHydrationEntry,
        hasDataOnDate: hydration.hasDataOnDate,
        colors,
        styles,
        handleCalendarDatePress,
      });
    }

    if (tab === "measurements") {
      return renderMeasurementWidget(instance.type, {
        history: measurements.history,
        openMeasurementModal: () => measurements.openMeasurementModal(),
        setSelectedLogDate,
        deleteMeasurementEntry: measurements.deleteMeasurementEntry,
        hasDataOnDate: measurements.hasDataOnDate,
        colors,
        styles,
        handleCalendarDatePress,
      });
    }

    if (tab === "macros") {
      return renderMacrosWidget(instance.type, {
        entries: macros.entries,
        deleteMacroEntry: macros.deleteMacroEntry,
        goals: macros.goals,
        openMacrosModal: () => macros.openMacrosModal(),
        openGoalModal: macros.openGoalModal,
        setSelectedLogDate,
        dailyStats: macros.dailyStats,
        hasDataOnDate: macros.hasDataOnDate,
        colors,
        styles,
        handleCalendarDatePress,
      });
    }

    if (instance.type in SORENESS_WIDGET_REGISTRY) {
      return renderSorenessWidget(instance.type, {
        entries: soreness.entries,
        openSorenessModal: () => soreness.openSorenessModal(),
        setSelectedLogDate,
        deleteSorenessEntry: soreness.deleteSorenessEntry,
        hasDataOnDate: soreness.hasDataOnDate,
        colors,
        styles,
        handleCalendarDatePress,
        onLogged: forceReloadActiveTab,
      });
    }

    if (tab === "menstrual") {
      return renderMenstrualWidget(instance.type, {
        entries: menstrual.entries,
        prefs: menstrual.prefs,
        setPrefs: menstrual.setPrefs,
        actualDays: menstrual.actualDays,
        predictedDays: menstrual.predictedDays,
        setPredictedDays: menstrual.setPredictedDays,
        openCycleModal: () => menstrual.openCycleModal(),
        setSelectedLogDate,
        hasDataOnDate: menstrual.hasDataOnDate,
        isOnPeriod: menstrual.isOnPeriod,
        markPeriodOver: menstrual.markPeriodOver,
        colors,
        styles,
        handleCalendarDatePress,
      });
    }

    if (tab === "photos") {
      return renderPhotosWidget(instance.type);
    }

    if (tab === "health") {
      return (
        <HealthWidget
          type={instance.type as HealthWidgetType}
          onOpenSettings={() => navigation.navigate("Settings" as never)}
        />
      );
    }

    return <Note>Coming soon</Note>;
  };

  const modals = (
    <>
      <WeightLogModal
        visible={weight.showWeightModal}
        onClose={() => {
          weight.closeWeightModal();
          setSelectedLogDate(null);
        }}
        onSave={weight.addWeight}
        weightUnit={weight.weightUnit}
        styles={styles}
      />

      <HeightModal
        visible={bodyFat.showHeightModal}
        onClose={() => bodyFat.closeHeightModal()}
        onSave={bodyFat.saveHeight}
        currentHeightCm={bodyFat.height?.heightCm}
        heightUnit={bodyFat.heightUnit}
        setHeightUnit={bodyFat.setHeightUnit}
        styles={styles}
      />

      <LogCycleModal
        visible={cycleModalOpen}
        onClose={() => setCycleModalOpen(false)}
        prefillDate={selectedLogDate ?? undefined}
        onSuccess={forceReloadActiveTab}
      />

      <LogHydrationModal
        visible={hydrationModalOpen}
        onClose={() => {
          setHydrationModalOpen(false);
          setSelectedLogDate(null);
        }}
        prefillDate={selectedLogDate ?? undefined}
        onSuccess={forceReloadActiveTab}
      />

      <LogSorenessModal
        visible={sorenessModalOpen}
        onClose={() => {
          setSorenessModalOpen(false);
          setSelectedLogDate(null);
        }}
        prefillDate={selectedLogDate ?? undefined}
        onSuccess={forceReloadActiveTab}
      />

      <MacrosLogModal
        visible={macros.showMacrosModal}
        onClose={() => {
          macros.closeMacrosModal();
          setSelectedLogDate(null);
        }}
        onSave={macros.addMacrosEntry}
        savedFoods={macros.savedFoods}
        quickLogSavedFood={macros.quickLogSavedFood}
        removeSavedFood={macros.removeSavedFood}
        styles={styles}
      />

      <MacrosGoalModal
        visible={macros.showMacrosGoalModal}
        onClose={() => macros.closeGoalModal()}
        onSave={macros.updateMacrosGoals}
        styles={styles}
      />

      <BodyFatCalcModal
        visible={bodyFat.showBodyFatModal}
        onClose={() => {
          bodyFat.closeBodyFatModal();
          setSelectedLogDate(null);
        }}
        onSave={bodyFat.calculateBodyFat}
        gender={bodyFat.gender}
        setGenderPersist={bodyFat.setGenderPersist}
        measurementUnit={bodyFat.measurementUnit}
        setMeasurementUnit={bodyFat.setMeasurementUnit}
        styles={styles}
      />

      <MeasurementLogModal
        visible={measurements.showMeasurementModal}
        onClose={() => {
          measurements.closeMeasurementModal();
          setSelectedLogDate(null);
        }}
        onSave={measurements.handleLogMeasurement}
        styles={styles}
      />

      <DayModal
        dayModal={dayModal}
        activeTab={activeTab}
        openLogModalForTab={openLogModalForTab}
        existingEntriesContent={renderDayModalExistingEntries()}
        onClose={() => {
          setDayModal(null);
          setSelectedLogDate(null);
        }}
        styles={styles}
      />
      {AlertComponent}
    </>
  );

  if (embedWidget) {
    return (
      <SafeAreaView>
        {renderWidgetContent(embedInstance(embedWidget))}
        {modals}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{ flex: 1 }}
      edges={["top"]}
      {...widgetBoard.panHandlers}
    >
      {widgetBoard.isPulling && (
        <WidgetPullHint armed={widgetBoard.pullArmed} />
      )}
      <ScrollView
        style={styles.container}
        scrollEnabled={!widgetBoard.isPulling}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.accent]}
            tintColor={colors.accent}
          />
        }
      >
        <View style={styles.content}>
          <ScreenTitle title='Tracking' />

          <ScrollTabBar
            tabs={TRACKING_TABS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            storageKey='trackingScreen_tabConfig'
          />

          <LocalOnlyNotice
            feature='tracking'
            style={{ marginHorizontal: 0 }}
            detail='Your entries are stored on this phone only. Back them up from Settings.'
          />

          {tabLoadError === activeTab && (
            <Placeholder
              icon='⚠️'
              text="Couldn't load this tab's data."
              action={{
                label: "Try again",
                onPress: () => loadTab(activeTab, true),
              }}
            />
          )}

          {activeBoard.isLoaded && activeBoard.widgets.length > 0 && (
            <WidgetEditHeader
              editMode={widgetBoard.editMode}
              onDone={() => widgetBoard.setEditMode(false)}
            />
          )}

          {isTabLoading && (
            <View
              style={styles.loadingBlock}
              accessibilityRole='progressbar'
              accessibilityLabel='Loading entries'
            >
              <ActivityIndicator color={colors.accent} />
              <Note>Loading your entries…</Note>
            </View>
          )}

          {!isTabLoading &&
            activeBoard.isLoaded &&
            activeBoard.widgets.length === 0 && (
              <Placeholder
                icon='🧩'
                text='This tab is empty. Pick the widgets you want to see.'
                action={{
                  label: "Add a widget",
                  onPress: widgetBoard.openGallery,
                }}
              />
            )}

          <WidgetsPanel
            key={activeTab}
            widgets={activeBoard.widgets}
            editMode={widgetBoard.editMode}
            onCycleSize={activeBoard.cycleWidgetSize}
            onRemove={activeBoard.removeWidget}
            onReorder={activeBoard.reorderWidgets}
            renderContent={renderWidgetContent}
            registry={activeRegistry}
          />

          {activeBoard.isLoaded && activeBoard.widgets.length > 0 && (
            <WidgetEditButton onPress={widgetBoard.openGallery} />
          )}
        </View>
      </ScrollView>

      <WidgetGallery
        visible={widgetBoard.galleryVisible}
        onClose={widgetBoard.closeGallery}
        availableWidgets={activeBoard.availableToAdd}
        onAddWidget={handleAddWidget}
        hasPlacedWidgets={activeBoard.widgets.length > 0}
        onEditWidgets={widgetBoard.editWidgets}
      />

      {modals}
    </SafeAreaView>
  );
}

function DayModal({
  dayModal,
  activeTab,
  openLogModalForTab,
  existingEntriesContent,
  onClose,
  styles,
}: {
  readonly dayModal: DayModalState | null;
  readonly activeTab: string;
  readonly openLogModalForTab: (tab: string) => void;
  readonly existingEntriesContent: React.ReactNode;
  readonly onClose: () => void;
  readonly styles: ReturnType<typeof makeStyles>;
}) {
  const meta = DAY_TAB_META[dayModal?.tab ?? ""] ?? DAY_TAB_FALLBACK;
  return (
    <ModalSheet
      visible={!!dayModal}
      onClose={onClose}
      showCancelButton={false}
      showConfirmButton={false}
      scrollable={true}
    >
      <View style={styles.dayModalHeader}>
        <View style={styles.dayModalIconCircle}>
          <Text style={styles.dayModalIcon}>{meta.icon}</Text>
        </View>
        <View style={styles.dayModalHeaderText}>
          <Text style={styles.dayModalTitle}>{meta.title}</Text>
          <Text style={styles.dayModalSubtitle}>
            {dayModal?.isToday
              ? "Today"
              : dayModal?.date &&
                formatDate(dayModal.date, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
          </Text>
        </View>
      </View>
      <View style={styles.dayModalDivider} />
      {existingEntriesContent}
      {(!dayModal?.existingEntries ||
        dayModal.existingEntries.length === 0) && (
        <View style={styles.dayModalEmptyState}>
          <Text style={styles.dayModalEmptyIcon}>{meta.icon}</Text>
          <Text style={styles.dayModalEmptyText}>No entries for this day</Text>
        </View>
      )}
      <Button
        label={meta.actionLabel}
        onPress={() => openLogModalForTab(dayModal?.tab ?? activeTab)}
        full
      />
    </ModalSheet>
  );
}
