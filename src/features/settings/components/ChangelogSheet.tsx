import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import ModalSheet from "@shared/components/ModalSheet";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";
import changelogMarkdown from "../../../../CHANGELOG.md";
import {
  categoriesIn,
  filterByCategory,
  findRelease,
  parseChangelog,
  UNRELEASED,
  type ChangeCategory,
  type Release,
} from "../utils/changelog";

const RELEASES: Release[] = parseChangelog(changelogMarkdown).filter(
  (r) => __DEV__ || r.version !== UNRELEASED,
);

type SheetView = { kind: "all" } | { kind: "version"; version: string };

interface Props {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly currentVersion: string | undefined;
}

function currentRelease(version: string | undefined): Release | null {
  return findRelease(RELEASES, version) ?? RELEASES[0] ?? null;
}

const formatDate = (iso: string | null): string | null => {
  if (!iso) return null;
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const releaseLabel = (release: Release): string =>
  release.version === UNRELEASED ? UNRELEASED : `Version ${release.version}`;

export default function ChangelogSheet({ visible, onClose, currentVersion }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const entry = currentRelease(currentVersion);

  const [view, setView] = useState<SheetView>({ kind: "all" });
  const [openedFromAll, setOpenedFromAll] = useState(false);
  const [category, setCategory] = useState<ChangeCategory | null>(null);

  useEffect(() => {
    if (!visible) return;
    setView(entry ? { kind: "version", version: entry.version } : { kind: "all" });
    setOpenedFromAll(false);
    setCategory(null);
  }, [visible, entry]);

  const categoryColor = (c: ChangeCategory): string => {
    switch (c) {
      case "Added":
        return colors.success;
      case "Fixed":
        return colors.info;
      case "Removed":
      case "Security":
        return colors.error;
      case "Deprecated":
        return colors.warning;
      default:
        return colors.accent;
    }
  };

  const renderChips = (available: ChangeCategory[]) => {
    if (available.length < 2) return null;
    const options: (ChangeCategory | null)[] = [null, ...available];
    return (
      <View style={styles.chipRow}>
        {options.map((c) => {
          const selected = category === c;
          const label = c ?? "All";
          return (
            <TouchableOpacity
              key={label}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => setCategory(c)}
              accessibilityRole="button"
              accessibilityLabel={`Show ${label === "All" ? "all changes" : label.toLowerCase() + " changes"}`}
              accessibilityState={{ selected }}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const renderVersion = (release: Release) => {
    const available = release.sections.map((s) => s.category);
    const activeCategory = category && available.includes(category) ? category : null;
    const sections = filterByCategory(release, activeCategory);
    const isCurrent = release.version === currentVersion;
    const date = formatDate(release.date);

    return (
      <View>
        {openedFromAll && (
          <TouchableOpacity
            style={styles.backLink}
            onPress={() => setView({ kind: "all" })}
            accessibilityRole="button"
            accessibilityLabel="Back to all versions"
          >
            <Text style={styles.linkText}>‹ All versions</Text>
          </TouchableOpacity>
        )}

        <View style={styles.versionHeader}>
          <Text style={styles.versionTitle} accessibilityRole="header">
            {releaseLabel(release)}
          </Text>
          {isCurrent && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Installed</Text>
            </View>
          )}
        </View>
        {date && <Text style={styles.dateText}>{date}</Text>}

        {renderChips(available)}

        {sections.length === 0 ? (
          <Text style={styles.emptyText}>
            No user-facing changes in this version.
          </Text>
        ) : (
          sections.map((section) => (
            <View key={section.category} style={styles.section}>
              <Text
                style={[styles.categoryTitle, { color: categoryColor(section.category) }]}
                accessibilityRole="header"
              >
                {section.category}
              </Text>
              {section.items.map((item) => (
                <View key={item} style={styles.itemRow}>
                  <Text style={styles.bullet} importantForAccessibility="no">
                    •
                  </Text>
                  <Text style={styles.itemText}>{item}</Text>
                </View>
              ))}
            </View>
          ))
        )}

        {!openedFromAll && RELEASES.length > 1 && (
          <TouchableOpacity
            style={styles.allButton}
            onPress={() => setView({ kind: "all" })}
            accessibilityRole="button"
            accessibilityLabel="See all versions"
          >
            <Text style={styles.allButtonText}>See all versions</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const summarize = (release: Release): string =>
    filterByCategory(release, category)
      .map((s) => `${s.items.length} ${s.category.toLowerCase()}`)
      .join(" · ");

  const renderAll = () => {
    const shown = RELEASES.filter(
      (r) => !category || r.sections.some((s) => s.category === category),
    );
    return (
      <View>
        {renderChips(categoriesIn(RELEASES))}
        {shown.length === 0 && (
          <Text style={styles.emptyText}>No versions have changes of this kind.</Text>
        )}
        {shown.map((release) => {
          const summary = summarize(release);
          const date = formatDate(release.date);
          return (
            <TouchableOpacity
              key={release.version}
              style={styles.versionRow}
              onPress={() => {
                setOpenedFromAll(true);
                setView({ kind: "version", version: release.version });
              }}
              accessibilityRole="button"
              accessibilityLabel={[releaseLabel(release), date, summary].filter(Boolean).join(", ")}
            >
              <View style={{ flex: 1 }}>
                <View style={styles.versionHeader}>
                  <Text style={styles.versionRowTitle}>{releaseLabel(release)}</Text>
                  {release.version === currentVersion && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>Installed</Text>
                    </View>
                  )}
                </View>
                {date && <Text style={styles.dateText}>{date}</Text>}
                <Text style={styles.summaryText}>
                  {summary || "No user-facing changes"}
                </Text>
              </View>
              <Text style={styles.chevron} importantForAccessibility="no">
                ›
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const selected = view.kind === "version" ? findRelease(RELEASES, view.version) : null;

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title={selected ? "What's New" : "All Versions"}
      showCancelButton={false}
      confirmText="Done"
      onConfirm={onClose}
      scrollable={true}
      fullHeight={true}
    >
      {RELEASES.length === 0 && (
        <Text style={styles.emptyText}>No release notes are available.</Text>
      )}
      {RELEASES.length > 0 && (selected ? renderVersion(selected) : renderAll())}
    </ModalSheet>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    backLink: { paddingVertical: 8, marginBottom: 4, alignSelf: "flex-start" },
    linkText: { fontSize: 15, fontWeight: "600", color: colors.accent },
    versionHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
    versionTitle: { fontSize: 22, fontWeight: "800", color: colors.textPrimary },
    versionRowTitle: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
    dateText: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    badge: {
      backgroundColor: colors.accentLight,
      borderRadius: 8,
      paddingVertical: 2,
      paddingHorizontal: 8,
    },
    badgeText: { fontSize: 12, fontWeight: "700", color: colors.accent },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 14 },
    chip: {
      minHeight: 36,
      justifyContent: "center",
      paddingHorizontal: 14,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      backgroundColor: colors.background,
    },
    chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
    chipText: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
    chipTextSelected: { color: colors.textOnAccent },
    section: { marginTop: 12 },
    categoryTitle: {
      fontSize: 13,
      fontWeight: "800",
      letterSpacing: 0.5,
      textTransform: "uppercase",
      marginBottom: 6,
    },
    itemRow: { flexDirection: "row", marginBottom: 8 },
    bullet: { width: 16, fontSize: 15, color: colors.textSecondary },
    itemText: { flex: 1, fontSize: 15, lineHeight: 21, color: colors.textPrimary },
    emptyText: { fontSize: 14, color: colors.textSecondary, marginTop: 12 },
    allButton: {
      marginTop: 20,
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.accent,
      alignItems: "center",
    },
    allButtonText: { fontSize: 15, fontWeight: "700", color: colors.accent },
    versionRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.separator,
    },
    summaryText: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
    chevron: { fontSize: 24, color: colors.textMuted, marginLeft: 8 },
  });
