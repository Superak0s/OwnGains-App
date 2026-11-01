import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "@shared/context/ThemeContext";
import { useMessages } from "@features/messages/MessagesContext";

interface TabIconProps {
  readonly icon: string;
  readonly label: string;
  readonly focused: boolean;
  readonly badge?: number;
}

const TabIcon = ({ icon, label, focused, badge = 0 }: TabIconProps) => {
  const { colors } = useTheme();
  return (
    <View style={styles.tabIconContainer}>
      <View
        style={[
          styles.iconWrapper,
          focused && {
            backgroundColor: colors.accent,
            shadowColor: colors.accent,
            borderRadius: 23,
          },
        ]}
      >
        <Text style={styles.icon}>{icon}</Text>
        {badge > 0 && (
          <View style={[styles.badge, { backgroundColor: colors.error }]}>
            <Text style={styles.badgeText}>{badge > 99 ? "99+" : badge}</Text>
          </View>
        )}
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

const UnreadTabIcon = (props: TabIconProps) => (
  <TabIcon {...props} badge={useMessages().unreadCount} />
);

/**
 * Builds a `tabBarIcon` render function.
 *
 * @remarks Tab bars call the result as a plain function, not as a component,
 * so hooks belong in the element it returns, never in the function itself.
 */
export const createTabBarIcon = (icon: string, label: string, withUnreadBadge = false) => {
  const Icon = withUnreadBadge ? UnreadTabIcon : TabIcon;
  const TabBarIcon = ({ focused }: { readonly focused: boolean }) => (
    <Icon icon={icon} label={label} focused={focused} />
  );
  TabBarIcon.displayName = `TabBarIcon(${label})`;
  return TabBarIcon;
};

const styles = StyleSheet.create({
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
  badge: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  label: {
    fontSize: 10,
    fontWeight: "600",
    color: "#9ca3af",
    marginTop: 2,
    letterSpacing: 0.3,
  },
});
