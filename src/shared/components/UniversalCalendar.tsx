import { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  AppState,
} from "react-native";
import { useTheme } from "../context/ThemeContext";
import { toDateString } from "@utils/format";
import type { ThemeColors } from "@shared/context/ThemeContext"


type CalendarView = "week" | "month";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

interface DayDecoration {
  backgroundColor?: string;
  dotColor?: string;
  textColor?: string;
}

interface UniversalCalendarProps {
  readonly hasDataOnDate?: (date: Date) => boolean;
  readonly onDatePress?: (date: Date) => void;
  readonly initialView?: CalendarView;
  readonly legendText?: string;
  readonly dotColor?: string;
  readonly getDayDecoration?: (date: Date) => DayDecoration | null;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
/** The month grid starts on Monday, so its header cannot reuse DAY_NAMES. */
const MONTH_HEADER_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;


function getWeekDates(anchorDate: Date): Date[] {
  const d = new Date(anchorDate);
  const dayOfWeek = d.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    return day;
  });
}

function getMonthGrid(anchorDate: Date): Array<Date | null> {
  const year = anchorDate.getFullYear();
  const month = anchorDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  const days: Array<Date | null> = [];
  for (let i = 0; i < startOffset; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d));
  }
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

const DAY_LABEL: Intl.DateTimeFormatOptions = {
  weekday: "long",
  day: "numeric",
  month: "long",
};

function dayAccessibilityLabel(
  date: Date,
  isToday: boolean,
  hasData: boolean,
): string {
  const parts = [date.toLocaleDateString(undefined, DAY_LABEL)];
  if (isToday) parts.push("today");
  if (hasData) parts.push("has activity");
  return parts.join(", ");
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return toDateString(a) === toDateString(b);
}


export default function UniversalCalendar({
  hasDataOnDate,
  onDatePress,
  initialView = "month",
  legendText = "Data logged",
  dotColor,
  getDayDecoration,
}: UniversalCalendarProps) {
  const { colors } = useTheme();
  const resolvedDotColor = dotColor ?? colors.accent;
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // Memoising on [] froze "today" at mount: an app left backgrounded past
  // midnight then treats the new day as the future and disables its cell.
  const [todayStamp, setTodayStamp] = useState(() => startOfToday().getTime());
  const today = useMemo(() => new Date(todayStamp), [todayStamp]);

  useEffect(() => {
    const check = () => {
      const now = startOfToday().getTime();
      setTodayStamp((prev) => (prev === now ? prev : now));
    };
    const interval = setInterval(check, 60_000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, []);

  const [view, setView] = useState<CalendarView>(initialView);
  const [anchorDate, setAnchorDate] = useState<Date>(today);

  const navigate = (direction: -1 | 1) => {
    // Stepping months via setMonth on a day-31 anchor overflows into the
    // month after next (Jan 31 + 1 month = Mar 3), skipping one entirely.
    setAnchorDate((prev) =>
      view === "week"
        ? new Date(
            prev.getFullYear(),
            prev.getMonth(),
            prev.getDate() + direction * 7,
          )
        : new Date(prev.getFullYear(), prev.getMonth() + direction, 1),
    );
  };

  const headerLabel = useMemo(() => {
    if (view === "week") {
      const days = getWeekDates(anchorDate);
      const first = days[0];
      const last = days[6];
      if (first.getMonth() === last.getMonth()) {
        return `${MONTH_NAMES[first.getMonth()]} ${first.getFullYear()}`;
      }
      return `${MONTH_NAMES[first.getMonth()].slice(0, 3)} - ${MONTH_NAMES[last.getMonth()].slice(0, 3)} ${last.getFullYear()}`;
    }
    return `${MONTH_NAMES[anchorDate.getMonth()]} ${anchorDate.getFullYear()}`;
  }, [view, anchorDate]);

  const weekDates = useMemo(() => getWeekDates(anchorDate), [anchorDate]);
  const monthGrid = useMemo(() => getMonthGrid(anchorDate), [anchorDate]);

  /**
   * `gridIndex` produces stable keys for empty (null) cells so React does not
   * remount them on every render.
   */
  const renderEmptyCell = (compact: boolean, gridIndex: number) => (
    <View
      key={`empty-${gridIndex}`}
      style={compact ? styles.monthCell : styles.weekCell}
    />
  );

  const textStylesFor = (
    isToday: boolean,
    isFuture: boolean,
    decoration: DayDecoration | null | undefined,
  ) => [
    isToday && styles.todayText,
    isFuture && styles.futureText,
    decoration?.textColor ? { color: decoration.textColor } : undefined,
  ];

  const renderDay = (
    date: Date | null,
    compact: boolean,
    gridIndex: number,
  ) => {
    if (!date) return renderEmptyCell(compact, gridIndex);

    const isToday = isSameLocalDay(date, today);
    const hasData = hasDataOnDate ? hasDataOnDate(date) : false;
    const isFuture = date > today && !isToday;

    const dayNumber = date.getDate();
    const dayName = DAY_NAMES[date.getDay()];

    const decoration = getDayDecoration?.(date);
    const dayTextStyles = textStylesFor(isToday, isFuture, decoration);

    return (
      <TouchableOpacity
        key={toDateString(date)}
        style={[
          compact ? styles.monthCell : styles.weekCell,
          isToday && styles.todayCell,
          isFuture && styles.futureCell,
          decoration?.backgroundColor
            ? {
                backgroundColor: decoration.backgroundColor,
                borderRadius: 10,
              }
            : undefined,
        ]}
        onPress={() => !isFuture && onDatePress?.(date)}
        disabled={isFuture}
        activeOpacity={isFuture ? 1 : 0.7}
        accessibilityRole='button'
        accessibilityLabel={dayAccessibilityLabel(date, isToday, hasData)}
        accessibilityState={{ disabled: isFuture }}
      >
        {compact ? (
          <Text style={[styles.monthDayName, ...dayTextStyles]}>
            {dayName.slice(0, 1)}
          </Text>
        ) : (
          <Text style={[styles.dayName, ...dayTextStyles]}>{dayName}</Text>
        )}
        <Text
          style={[
            compact ? styles.monthDayNumber : styles.dayNumber,
            ...dayTextStyles,
          ]}
        >
          {dayNumber}
        </Text>
        {hasData ? (
          <View
            style={[
              styles.dot,
              { backgroundColor: decoration?.dotColor ?? resolvedDotColor },
            ]}
          />
        ) : (
          <View style={styles.dotPlaceholder} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.navRow}>
        <TouchableOpacity
          style={styles.navBtn}
          onPress={() => navigate(-1)}
          hitSlop={10}
          accessibilityRole='button'
          accessibilityLabel={`Previous ${view}`}
        >
          <Text style={styles.navBtnText}>‹</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setAnchorDate(today)}
          style={styles.headerLabelBtn}
          accessibilityRole='button'
          accessibilityLabel={`${headerLabel}. Jump to today`}
        >
          <Text style={styles.headerLabel}>{headerLabel}</Text>
          {!isSameLocalDay(anchorDate, today) && (
            <Text style={styles.todayLink}>Today</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navBtn}
          onPress={() => navigate(1)}
          hitSlop={10}
          accessibilityRole='button'
          accessibilityLabel={`Next ${view}`}
        >
          <Text style={styles.navBtnText}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.viewToggle}
          onPress={() => setView((v) => (v === "week" ? "month" : "week"))}
          hitSlop={8}
          accessibilityRole='button'
          accessibilityLabel={`Switch to ${view === "week" ? "month" : "week"} view`}
        >
          <Text style={styles.viewToggleText}>
            {view === "week" ? "Month view" : "Week view"}
          </Text>
        </TouchableOpacity>
      </View>

      {view === "week" && (
        <View style={styles.weekRow}>
          {weekDates.map((d, i) => renderDay(d, false, i))}
        </View>
      )}

      {view === "month" && (
        <>
          <View style={styles.monthHeader}>
            {MONTH_HEADER_DAYS.map((name) => (
              <Text key={name} style={styles.monthHeaderCell}>
                {name.charAt(0)}
              </Text>
            ))}
          </View>
          {Array.from({ length: monthGrid.length / 7 }, (_, row) => (
            <View key={row} style={styles.monthRow}>
              {monthGrid
                .slice(row * 7, row * 7 + 7)
                .map((d, col) => renderDay(d, true, row * 7 + col))}
            </View>
          ))}
        </>
      )}

      <View style={styles.footer}>
        <View style={styles.legend}>
          <View
            style={[styles.legendDot, { backgroundColor: resolvedDotColor }]}
          />
          <Text style={styles.legendText}>{legendText}</Text>
        </View>
      </View>
    </View>
  );
}


const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 12,
      marginBottom: 15,
    },
    navRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
    navBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.separator,
      alignItems: "center",
      justifyContent: "center",
    },
    navBtnText: { fontSize: 22, color: colors.textSecondary, lineHeight: 26 },
    headerLabelBtn: { flex: 1, alignItems: "center" },
    headerLabel: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
    todayLink: { fontSize: 11, color: colors.accent, marginTop: 1 },
    viewToggle: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      backgroundColor: colors.accentLight,
      marginLeft: 6,
    },
    viewToggleText: { fontSize: 12, color: colors.accent, fontWeight: "600" },
    weekRow: { flexDirection: "row", justifyContent: "space-between" },
    weekCell: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 6,
      borderRadius: 10,
      marginHorizontal: 1,
    },
    dayName: { fontSize: 11, color: colors.textMuted, marginBottom: 3 },
    dayNumber: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
    monthHeader: { flexDirection: "row", marginBottom: 2 },
    monthHeaderCell: {
      flex: 1,
      textAlign: "center",
      fontSize: 11,
      color: colors.textMuted,
      fontWeight: "600",
      paddingVertical: 2,
    },
    monthRow: { flexDirection: "row" },
    monthCell: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 4,
      borderRadius: 8,
      marginVertical: 1,
      marginHorizontal: 0.5,
    },
    monthDayName: { fontSize: 9, color: colors.textMuted },
    monthDayNumber: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    todayCell: { backgroundColor: colors.accentLight },
    futureCell: { opacity: 0.45 },
    todayText: { color: colors.accent },
    futureText: { color: colors.textSecondary },
    dot: { width: 6, height: 6, borderRadius: 3, marginTop: 3 },
    dotPlaceholder: { width: 6, height: 6, marginTop: 3 },
    footer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 8,
    },
    legend: { flexDirection: "row", alignItems: "center", gap: 6 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendText: { fontSize: 11, color: colors.textMuted },
  });
