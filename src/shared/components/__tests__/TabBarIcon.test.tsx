import { createTabBarIcon } from "@shared/components/TabBarIcon";

describe("createTabBarIcon", () => {
  // The tab bar calls tabBarIcon as a plain function during its own render, so
  // a hook in it joins the tab bar's hook list and breaks when tabs change.
  it.each([false, true])("calls no hook when invoked as a function (unread badge: %s)", (withUnreadBadge) => {
    const renderIcon = createTabBarIcon("👥", "Friends", withUnreadBadge);
    expect(() => renderIcon({ focused: true })).not.toThrow();
  });
});
