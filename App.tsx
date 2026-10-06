import {
  captureException,
  navigationIntegration,
  wrapRoot,
  log,
  metric,
  trackScreenView,
} from "./src/shared/services/crashReporting";
import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  lazy,
  Suspense,
} from "react";
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
  useNavigationContainerRef,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StatusBar } from "expo-status-bar";
import {
  View,
  StyleSheet,
  Platform,
  Text,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  PanResponder,
  ScrollView,
  AppState,
  Dimensions,
  type AppStateStatus,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./src/shared/context/AuthContext";
import { WorkoutProvider } from "./src/shared/context/WorkoutContext";
import { NavigationBar } from "expo-navigation-bar";
import {
  isOnboardingComplete,
  onOnboardingChange,
  getAppModeSync,
  onAppModeChange,
} from "./src/shared/services/appMode";
import {
  DEFAULT_TAB_ORDER,
  loadTabOrder,
  onTabOrderChange,
  TAB_META,
  type TabName,
} from "./src/shared/services/tabOrder";
import { useTabBar, TabBarProvider } from "./src/shared/context/TabBarContext";
import { ThemeProvider, useTheme } from "./src/shared/context/ThemeContext";

// Only the two screens that can be on screen at first paint are imported
// eagerly. Bottom-tabs lazy-*mounts* the rest, but a static import still makes
// Hermes parse and evaluate every screen module (~15k lines plus the charting,
// spreadsheet, QR and camera stacks) before the first frame.
import OnboardingScreen from "./src/features/auth/OnboardingScreen";
import LoginScreen from "./src/features/auth/LoginScreen";
import HomeScreen from "./src/features/homescreen/HomeScreen";
import PrivacyConsentScreen from "./src/features/auth/PrivacyConsentScreen";
import { TutorialProvider, useTutorialGate } from "./src/features/tutorial/TutorialContext";
import { tutorialAnchor } from "./src/features/tutorial/anchors";

function ScreenLoadingFallback(): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={[styles.screenFallback, { backgroundColor: colors.background }]}>
      <ActivityIndicator size='large' color={colors.accent} />
    </View>
  );
}

/**
 * Each screen gets its own Suspense boundary so a chunk still resolving only
 * blanks that screen, leaving the tab bar and the rest of the shell interactive.
 */
function lazyScreen<P extends object>(
  loader: () => Promise<{ default: React.ComponentType<P> }>,
): (props: P) => React.JSX.Element {
  const Lazy = lazy(loader);
  return function LazyScreen(props: P): React.JSX.Element {
    return (
      <Suspense fallback={<ScreenLoadingFallback />}>
        <Lazy {...props} />
      </Suspense>
    );
  };
}

const SignupScreen = lazyScreen(
  () => import("./src/features/auth/SignupScreen"),
);
const PrivacyPolicyScreen = lazyScreen(
  () => import("./src/features/auth/PrivacyPolicyScreen"),
);
const TermsOfServiceScreen = lazyScreen(
  () => import("./src/features/auth/TermsOfServiceScreen"),
);
const WorkoutScreen = lazyScreen(
  () => import("./src/features/workout/WorkoutScreen"),
);
const AnalyticsScreen = lazyScreen(
  () => import("./src/features/analytics/AnalyticsScreen"),
);
const TrackingScreen = lazyScreen(
  () => import("./src/features/tracking/TrackingScreen"),
);
const SupplementsScreen = lazyScreen(
  () => import("./src/features/supplements/SupplementsScreen"),
);
const FriendsScreen = lazyScreen(
  () => import("./src/features/friends/FriendsScreen"),
);
const SettingsScreen = lazyScreen(
  () => import("./src/features/settings/SettingsScreen"),
);
const PlanScreen = lazyScreen(() => import("./src/features/plan/PlanScreen"));

import {
  initializeSupplementNotifications,
  readSupplementReminderConfigs,
  scheduleTimeReminder,
} from "./src/shared/services/supplementReminders";
import { getNotifications } from "./src/shared/services/notifications";
import { sweepStaleExports } from "./src/utils/writeJsonExport";
import { useGitHubUpdateCheck } from "./src/shared/services/githubUpdate";
import { useHealthConnectSync } from "./src/features/healthConnect/importer";
import {
  refreshHydrationNotification,
  useHydrationNotification,
} from "./src/features/tracking/hydrationNotification";
import { HydrationTileModal } from "./src/features/tracking/hydrationTiles";

interface TabIconProps {
  readonly icon: string;
  readonly label: string;
  readonly focused: boolean;
}

interface CustomTabBarProps {
  readonly state: {
    index: number;
    routes: Array<{ key: string; name: string }>;
  };
  readonly descriptors: Record<
    string,
    {
      options: {
        tabBarIcon?: (opts: { focused: boolean }) => React.ReactNode;
      };
    }
  >;
  readonly navigation: {
    emit: (opts: {
      type: string;
      target: string;
      canPreventDefault: boolean;
    }) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
}

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
setTimeout(() => {
  void (async () => {
    try {
      const Notifications = await getNotifications();
      if (Notifications?.setNotificationHandler) {
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
            shouldShowBanner: true,
            shouldShowList: true,
          }),
        });
      }
    } catch (error) {
      console.warn(
        "Notifications not available in Expo Go:",
        (error as Error).message,
      );
      log.warn("notifications.handler_unavailable", {
        reason: (error as Error).message,
      });
    }
    void sweepStaleExports();
  })();
}, 0);

const hideNavBar = async () => {
  if (Platform.OS === "android") {
    try {
      NavigationBar.setHidden(true);
    } catch (error) {
      console.warn("Failed to hide navigation bar:", error);
    }
  }
};

const showNavBarTemporarily = async (ms = 3000) => {
  if (Platform.OS !== "android") return;
  try {
    NavigationBar.setHidden(false);
    setTimeout(() => void hideNavBar(), ms);
  } catch (error) {
    console.warn("Failed to show navigation bar:", error);
  }
};

const TabIcon = ({ icon, label, focused }: TabIconProps) => {
  const { colors } = useTheme();
  return (
    <View style={styles.tabIconContainer}>
      <View
        style={[
          styles.iconWrapper,
          focused && { backgroundColor: colors.accentLight },
        ]}
      >
        <Text style={styles.icon}>{icon}</Text>
      </View>
      <Text
        style={[
          styles.label,
          focused && { color: colors.accent, fontWeight: "700" },
        ]}
      >
        {label}
      </Text>
    </View>
  );
};

const CustomTabBar = ({
  state,
  descriptors,
  navigation,
}: CustomTabBarProps) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const { isTabBarCollapsed, setIsTabBarCollapsed } = useTabBar();

  useEffect(() => {
    const activeIndex = state.index;
    if (scrollViewRef.current) {
      if (activeIndex >= 3) {
        scrollViewRef.current.scrollTo({
          x: (activeIndex - 2) * 80,
          animated: true,
        });
      } else {
        scrollViewRef.current.scrollTo({ x: 0, animated: true });
      }
    }
  }, [state.index]);

  const handleToggle = () => {
    const toValue = isCollapsed ? 0 : 1;
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue,
        useNativeDriver: true,
        tension: 50,
        friction: 8,
      }),
      Animated.spring(rotateAnim, {
        toValue,
        useNativeDriver: true,
        tension: 50,
        friction: 8,
      }),
    ]).start();
    const next = !isCollapsed;
    setIsCollapsed(next);
    setIsTabBarCollapsed(next);
  };

  // The tutorial expands the bar through context before spotlighting a tab.
  useEffect(() => {
    if (isCollapsed && !isTabBarCollapsed) handleToggle();
  }, [isTabBarCollapsed]);

  const tabBarTranslateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -400],
  });
  const arrowTranslateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -330],
  });
  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  return (
    <View pointerEvents='box-none'>
      <Animated.View
        style={[
          styles.customTabBarContainer,
          {
            bottom: insets.bottom,
            shadowColor: colors.accent,
            transform: [{ translateX: tabBarTranslateX }],
          },
        ]}
      >
        <View
          style={[styles.tabBarBackground, { backgroundColor: colors.surface }]}
        >
          <LinearGradient
            colors={[colors.surface, colors.surfaceElevated]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradient}
          />
        </View>

        <ScrollView
          ref={scrollViewRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          style={styles.scrollView}
        >
          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            const isFocused = state.index === index;

            const onPress = () => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!isFocused && !event.defaultPrevented)
                navigation.navigate(route.name);
            };

            const IconComponent = options.tabBarIcon;
            return (
              <TouchableOpacity
                key={route.key}
                ref={tutorialAnchor(`tab.${route.name as TabName}`)}
                onPress={onPress}
                style={styles.tabButton}
                activeOpacity={0.7}
                accessibilityRole='tab'
                accessibilityLabel={route.name}
                accessibilityState={{ selected: isFocused }}
              >
                {IconComponent?.({ focused: isFocused })}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </Animated.View>

      <Animated.View
        style={[
          styles.toggleContainer,
          {
            bottom: insets.bottom + 15,
            transform: [{ translateX: arrowTranslateX }],
          },
        ]}
      >
        <TouchableOpacity
          style={styles.toggleButton}
          ref={tutorialAnchor("tabbar.toggle")}
          onPress={handleToggle}
          activeOpacity={0.7}
          accessibilityRole='button'
          accessibilityLabel={isCollapsed ? "Show tab bar" : "Hide tab bar"}
          accessibilityState={{ expanded: !isCollapsed }}
        >
          <LinearGradient
            colors={[colors.accent, colors.accentDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.toggleGradient}
          >
            <Animated.Text
              style={[
                styles.toggleArrow,
                { transform: [{ rotate: rotation }] },
              ]}
            >
              ◀
            </Animated.Text>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

// Defined once at module scope instead of inline in JSX, so React Navigation
// isn't handed a brand-new component definition on every MainTabs render.

const renderCustomTabBar = (props: Record<string, unknown>) => (
  <CustomTabBar {...(props as unknown as CustomTabBarProps)} />
);

const createTabBarIcon = (icon: string, label: string) => {
  const TabBarIcon = ({ focused }: { readonly focused: boolean }) => (
    <TabIcon icon={icon} label={label} focused={focused} />
  );
  TabBarIcon.displayName = `TabBarIcon(${label})`;
  return TabBarIcon;
};

// A render crash in one tab shows a retry in that tab only, instead of
// replacing the whole app (and an in-progress workout) with the root fallback.
const withTabBoundary = (
  name: TabName,
  Screen: React.ComponentType,
): React.ComponentType => {
  const Bounded = () => (
    <ErrorBoundary name={name}>
      <Screen />
    </ErrorBoundary>
  );
  Bounded.displayName = `TabBoundary(${name})`;
  return Bounded;
};

const TAB_COMPONENTS = Object.fromEntries(
  (
    [
      ["Home", HomeScreen],
      ["Workout", WorkoutScreen],
      ["Plan", PlanScreen],
      ["Analytics", AnalyticsScreen],
      ["Tracking", TrackingScreen],
      ["Supplements", SupplementsScreen],
      ["Friends", FriendsScreen],
      ["Settings", SettingsScreen],
    ] as const
  ).map(([name, Screen]) => [name, withTabBoundary(name, Screen)]),
) as Record<TabName, React.ComponentType>;

const FROZEN_WHEN_BLURRED = new Set<TabName>(["Settings", "Analytics", "Plan"]);

const TAB_ICONS = Object.fromEntries(
  DEFAULT_TAB_ORDER.map((name) => [
    name,
    createTabBarIcon(TAB_META[name].icon, TAB_META[name].label),
  ]),
) as Record<TabName, ReturnType<typeof createTabBarIcon>>;

function MainTabs() {
  const { user } = useAuth();
  const { colors } = useTheme();
  useTutorialGate();
  useHealthConnectSync(user?.id ?? null);
  useHydrationNotification(user?.id ?? null);
  const updateAlert = useGitHubUpdateCheck();
  const [isOffline, setIsOffline] = useState(
    () => getAppModeSync() === "offline",
  );
  useEffect(
    () => onAppModeChange.subscribe((mode) => setIsOffline(mode === "offline")),
    [],
  );
  const [tabOrder, setTabOrder] = useState<TabName[]>([...DEFAULT_TAB_ORDER]);
  useEffect(() => {
    let active = true;
    void loadTabOrder().then((order) => {
      if (active) setTabOrder(order);
    });
    const unsubscribe = onTabOrderChange.subscribe(setTabOrder);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    void hideNavBar();
    const subscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        if (nextState === "active") void hideNavBar();
      },
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const initializeSupplementReminders = async () => {
      if (!user?.id) return;
      try {
        const notificationsReady = await initializeSupplementNotifications(false);
        if (!notificationsReady) return;
        // Daily triggers survive reboots on their own, but a reminder saved
        // before permissions were granted never got scheduled, so re-arm from
        // the stored configs so those aren't lost.
        const configs = await readSupplementReminderConfigs(String(user.id));
        await Promise.all(
          configs
            .filter((config) => config.enabled && config.timeBasedEnabled)
            .map((config) =>
              scheduleTimeReminder(
                user.id,
                config.supplementId,
                config.name,
                config.defaultAmount,
                config.unit,
                config.reminderTime,
                config.notificationType,
              ),
            ),
        );
      } catch (error) {
        console.error("❌ Error initializing supplement reminders:", error);
      }
    };
    void initializeSupplementReminders();
  }, [user?.id]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        const { height } = Dimensions.get("window");
        const touchY = evt.nativeEvent.pageY;
        return touchY > height - 60 && gestureState.dy < -10;
      },
      onPanResponderRelease: (evt, gestureState) => {
        const { height } = Dimensions.get("window");
        const touchY = evt.nativeEvent.pageY;
        if (
          Platform.OS === "android" &&
          touchY > height - 60 &&
          gestureState.dy < -30
        ) {
          void showNavBarTemporarily(3000);
        }
      },
    }),
  ).current;

  return (
    <View
      style={{ flex: 1, backgroundColor: colors.background }}
      {...panResponder.panHandlers}
    >
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarShowLabel: false,
        }}
        tabBar={renderCustomTabBar}
      >
        {tabOrder
          .filter((name) => !(isOffline && name === "Friends"))
          .map((name) => (
            <Tab.Screen
              key={name}
              name={name}
              component={TAB_COMPONENTS[name]}
              options={{
                tabBarIcon: TAB_ICONS[name],
                // The other tabs run effects (rest reminders, live sessions)
                // that must run while the tab is in the background.
                freezeOnBlur: FROZEN_WHEN_BLURRED.has(name),
              }}
            />
          ))}
      </Tab.Navigator>
      {user?.id != null && (
        <HydrationTileModal
          onLogged={() => void refreshHydrationNotification(String(user.id))}
        />
      )}
      {updateAlert}
    </View>
  );
}

class ErrorBoundary extends React.Component<
  {
    children: React.ReactNode;
    /** Tab name for a per-tab boundary, reported as the crash's `screen`. */
    name?: string;
    renderFallback?: (resetError: () => void) => React.ReactNode;
  },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error in component tree:", error, errorInfo);
    metric.count("app.error_boundary.caught");
    let boundary = "navigator";
    if (this.props.renderFallback) boundary = "root";
    else if (this.props.name) boundary = "screen";
    captureException(error, {
      componentStack: errorInfo.componentStack ?? "",
      boundary,
      ...(this.props.name && { screen: this.props.name }),
    });
  }

  render() {
    if (this.state.hasError) {
      const resetError = () => this.setState({ hasError: false });
      return this.props.renderFallback ? (
        this.props.renderFallback(resetError)
      ) : (
        <ErrorFallback resetError={resetError} />
      );
    }
    return this.props.children;
  }
}

// The themed fallback needs ThemeProvider, so it can't render for a crash in
// the providers themselves. That one gets these literal colours.
const ROOT_FALLBACK_COLORS = {
  background: "#ffffff",
  textPrimary: "#1a1a1a",
  accent: "#667eea",
  surface: "#ffffff",
};

function ErrorFallbackView({
  resetError,
  colors,
}: {
  readonly resetError: () => void;
  readonly colors: typeof ROOT_FALLBACK_COLORS;
}) {
  return (
    <View
      style={[styles.loadingContainer, { backgroundColor: colors.background }]}
    >
      <Text style={styles.loadingText}>⚠️</Text>
      <Text style={[styles.errorTitle, { color: colors.textPrimary }]}>
        Something went wrong
      </Text>
      <TouchableOpacity
        style={[styles.errorButton, { backgroundColor: colors.accent }]}
        onPress={resetError}
      >
        <Text style={[styles.errorButtonText, { color: colors.surface }]}>
          Try Again
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function ErrorFallback({ resetError }: { readonly resetError: () => void }) {
  const { colors } = useTheme();
  return <ErrorFallbackView resetError={resetError} colors={colors} />;
}

function AppNavigator() {
  const { isAuthenticated, isLoading, consented, markConsented } = useAuth();
  const { colors } = useTheme();
  const [needsOnboarding, setNeedsOnboarding] = useState(
    () => !isOnboardingComplete(),
  );
  useEffect(
    () => onOnboardingChange.subscribe((done) => setNeedsOnboarding(!done)),
    [],
  );

  if (isLoading) {
    return (
      <View
        style={[
          styles.loadingContainer,
          { backgroundColor: colors.background },
        ]}
      >
        <Text style={styles.loadingText}>💪</Text>
      </View>
    );
  }

  let screens: React.ReactNode;
  if (needsOnboarding) {
    screens = <Stack.Screen name='Onboarding' component={OnboardingScreen} />;
  } else if (isAuthenticated && !consented) {
    screens = (
      <Stack.Screen name='PrivacyConsent'>
        {(props) => (
          <PrivacyConsentScreen
            {...props}
            onDone={markConsented}
          />
        )}
      </Stack.Screen>
    );
  } else if (isAuthenticated) {
    screens = <Stack.Screen name='Main' component={MainTabs} />;
  } else {
    screens = (
      <>
        <Stack.Screen name='Login' component={LoginScreen} />
        <Stack.Screen name='Signup' component={SignupScreen} />
      </>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {screens}
      {/* Registered outside the branches: reachable from onboarding, the login
          screen and Settings alike. */}
      <Stack.Screen name='PrivacyPolicy' component={PrivacyPolicyScreen} />
      <Stack.Screen name='TermsOfService' component={TermsOfServiceScreen} />
    </Stack.Navigator>
  );
}

function ThemedNavigation({ children }: { readonly children: React.ReactNode }) {
  const { colors, isDark } = useTheme();
  const navigationRef = useNavigationContainerRef();
  const lastScreenRef = useRef<string | undefined>(undefined);
  const recordScreenView = () => {
    const screen = (navigationRef.getCurrentRoute() as { name: string } | undefined)?.name;
    if (!screen || screen === lastScreenRef.current) return;
    lastScreenRef.current = screen;
    trackScreenView(screen);
  };
  const navTheme = useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.accent,
        background: colors.background,
        card: colors.surface,
        text: colors.textPrimary,
        border: colors.surfaceBorder,
        notification: colors.error,
      },
    };
  }, [colors, isDark]);

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={navTheme}
      onReady={() => {
        navigationIntegration.registerNavigationContainer(navigationRef);
        recordScreenView();
      }}
      onStateChange={recordScreenView}
    >
      <StatusBar style={isDark ? "light" : "dark"} />
      <TutorialProvider navigationRef={navigationRef}>{children}</TutorialProvider>
    </NavigationContainer>
  );
}

function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary
        renderFallback={(resetError) => (
          <ErrorFallbackView resetError={resetError} colors={ROOT_FALLBACK_COLORS} />
        )}
      >
        <SafeAreaProvider>
          <ThemeProvider>
            <AuthProvider>
              <TabBarProvider>
                <WorkoutProvider>
                  <ThemedNavigation>
                    <ErrorBoundary>
                      <AppNavigator />
                    </ErrorBoundary>
                  </ThemedNavigation>
                </WorkoutProvider>
              </TabBarProvider>
            </AuthProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

export default wrapRoot(App);

const styles = StyleSheet.create({
  screenFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  customTabBarContainer: {
    position: "absolute",
    bottom: 0,
    left: 20,
    height: 73,
    width: "76%",
    borderRadius: 24,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    ...Platform.select({
      ios: { shadowOpacity: 0.3 },
      android: { elevation: 15 },
    }),
  },
  tabBarBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 24,
    overflow: "hidden",
  },
  gradient: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 5,
    alignItems: "center",
    minWidth: "100%",
  },
  tabButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  tabIconContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 5,
    minWidth: 65,
  },
  iconWrapper: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
    backgroundColor: "transparent",
  },
  icon: { fontSize: 24 },
  label: {
    fontSize: 10,
    fontWeight: "600",
    color: "#9ca3af",
    marginTop: 2,
    letterSpacing: 0.3,
  },
  toggleContainer: {
    position: "absolute",
    bottom: 15,
    right: 20,
    zIndex: 1000,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleButton: {
    width: 46,
    height: 46,
    borderRadius: 16,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  toggleGradient: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  toggleArrow: { fontSize: 20, color: "#ffffff", fontWeight: "bold" },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  loadingText: { fontSize: 64 },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 12,
    marginBottom: 20,
    textAlign: "center",
  },
  errorButton: {
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  errorButtonText: { fontSize: 16, fontWeight: "700" },
});
