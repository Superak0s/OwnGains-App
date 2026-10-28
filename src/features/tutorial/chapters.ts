import type { AppMode } from "@shared/services/appMode";
import type { TabName } from "@shared/services/tabOrder";
import type { AnchorId } from "./anchors";

export type ChapterId =
  | "welcome" | "home" | "plan" | "workout" | "progress" | "tracking"
  | "supplements" | "friends" | "sharing" | "together" | "widgets"
  | "settings" | "trainerClient" | "trainerSession" | "trainerFollow";

export type Gesture = "tap" | "swipe" | "twoFinger";

export interface ChecklistItem {
  icon: string;
  label: string;
  result: string;
}

export type PracticeSpec =
  | { type: "checklist"; items: ChecklistItem[] }
  | { type: "logSet" }
  | { type: "permissions" }
  | { type: "twoFingerPull" }
  | { type: "banner"; variant: "trainer" | "partner" | "trainerSession" };

export interface SpotlightStep {
  kind: "spotlight";
  tab?: TabName;
  anchor: AnchorId;
  caption: string;
  gesture?: Gesture;
  advanceOn: "tap" | "next";
  fallback: string;
}
export interface CardStep {
  kind: "card";
  icon: string;
  title: string;
  body: string;
}
export interface PracticeStep {
  kind: "practice";
  caption: string;
  practice: PracticeSpec;
}
export type Step = SpotlightStep | CardStep | PracticeStep;

export interface Chapter {
  id: ChapterId;
  title: string;
  icon: string;
  onlineOnly: boolean;
  steps: Step[];
}

const spot = (
  tab: TabName,
  anchor: AnchorId,
  caption: string,
  fallback: string,
  gesture?: Gesture,
): Step => ({ kind: "spotlight", tab, anchor, caption, fallback, gesture, advanceOn: "next" });
const card = (icon: string, title: string, body: string): Step => ({ kind: "card", icon, title, body });
const practice = (caption: string, spec: PracticeSpec): Step => ({ kind: "practice", caption, practice: spec });
const checklist = (caption: string, items: Array<[string, string, string]>): Step =>
  practice(caption, {
    type: "checklist",
    items: items.map(([icon, label, result]) => ({ icon, label, result })),
  });

const chapter = (id: ChapterId, icon: string, title: string, steps: Step[], onlineOnly = false): Chapter =>
  ({ id, icon, title, steps, onlineOnly });

export const CHAPTERS: Record<ChapterId, Chapter> = {
  welcome: chapter("welcome", "💪", "Welcome", [
    card("🧑‍🏫", "Are you a trainer?", "Turn on Trainer Mode in Settings, or with the Trainer Mode widget on Home, to see what your clients are doing: their sessions, programs and progress. The trainer tour starts from there."),
    spot("Home", "tabbar.toggle", "Swipe the tab bar sideways for more tabs. The arrow beside it hides it when you need room.", "Swipe the tab bar sideways for more tabs. The arrow beside it hides it and brings it back."),
  ]),
  home: chapter("home", "🏠", "Home", [
    spot("Home", "home.changeDay", "Change Day picks which program day you'll train next.", "Once you have a plan, Change Day on the Next Workout card picks the day you'll train next."),
    card("🔒", "Finished days lock", "A finished day is marked Done and locked, so it can't be changed by accident. Tap Start again on its banner to log it again. Forgot to log at the gym? Log a past workout on Home."),
  ]),
  plan: chapter("plan", "📋", "Plan", [
    spot("Plan", "plan.import", "Import file brings in a program from a spreadsheet (.ods, .xlsx or .xls). Accept each matched row so its progress charts connect.", "Build your plan → Import file brings in a program from a spreadsheet."),
    card("📅", "Schedule workouts", "The Schedule widget books a workout on a future day with a notification or alarm, and can copy it into your phone's calendar."),
  ]),
  workout: chapter("workout", "🏋️", "Workout", [
    practice("Log a set: enter the weight and reps, rate the effort, then save. Tap Use it to copy last time's numbers.", { type: "logSet" }),
    checklist("A few things you might miss.", [
      ["✏️", "Edit a set", "Tap a logged set to fix its weight, reps or notes, or to delete it."],
      ["⚖️", "kg or lbs", "Switch the unit while logging a set. Each exercise remembers its own."],
      ["🔧", "Machines", "Save the machines at your gym and pick one per exercise, so your weights stay comparable."],
      ["⏰", "Rest alarm", "Rest can ring full screen like an alarm clock instead of a notification."],
      ["🔄", "Change day", "Picked the wrong day? Change it mid-workout and logged exercises come with you."],
    ]),
  ]),
  progress: chapter("progress", "📊", "Progress", [
    card("🔍", "Charts open full screen", "Tap any chart on Progress to pick a range, zoom, add a trend line or goal, compare with last period, or export it."),
  ]),
  tracking: chapter("tracking", "📈", "Tracking", [
    spot("Tracking", "scrollTabs", "Each sub-tab tracks one thing. Edit tabs lets you reorder or hide them.", "At the top of Track, each sub-tab tracks one thing. Edit tabs reorders or hides them."),
  ]),
  supplements: chapter("supplements", "💊", "Supplements", [
    card("⏰", "Dose reminders", "Set reminders per supplement as a notification or a full-screen alarm. Volume down snoozes a ringing alarm and power turns it off. On phones that delay notifications, OwnGains tells you once which battery settings to change."),
  ]),
  friends: chapter("friends", "👥", "Friends", [
    card("🔒", "Locked tabs", "A friend's locked tab means they haven't given you access yet. Tap it to see what they'd need to allow. Tap Message on a friend to chat."),
  ], true),
  sharing: chapter("sharing", "🔐", "Sharing & permissions", [
    practice("You decide what each friend can see and do. Turn a few on, give Alex Trainer Access, then turn one off.", { type: "permissions" }),
    practice("While a trainer logs a session for you, this banner shows on your Workout screen. Try revoking their access.", { type: "banner", variant: "trainer" }),
  ], true),
  together: chapter("together", "🤝", "Training together", [
    card("🤝", "Lift together or watch", "Friends → friend → Actions → Lift Together starts a joint session. A friend's Live tab shows their session as it happens. Each needs the friend's permission."),
  ], true),
  widgets: chapter("widgets", "🧩", "Widgets", [
    practice("Pull down with two fingers anywhere on a board to open its widget gallery. Every screen has its own board.", { type: "twoFingerPull" }),
    card("🎨", "Skins", "Settings → Appearance → Skins shares your theme and widget layouts, or loads someone else's by ID, link or file. Preview a skin before you apply it."),
  ]),
  settings: chapter("settings", "⚙️", "Settings", [
    spot("Settings", "settings.tutorial", "Replay any chapter of this tutorial from here.", "Settings → About → Tutorial replays any chapter."),
  ]),
  trainerClient: chapter("trainerClient", "🤝", "Trainer: getting a client", [
    checklist("Your tabs are now Clients, Session, Programs, Progress, Track, Supps and Settings. Clients is your roster.", [
      ["➕", "Add client", "Search their username, or scan the QR code under My QR Code in their Friends tab. Access starts once they accept."],
      ["⚠️", "Needs attention", "Clients who are inactive or behind their week come first."],
      ["👤", "Client page", "Their week, recent sessions, progress and the permissions they gave you. Ask for History, Analytics and Tracking Access here."],
    ]),
    card("🔒", "Tracking Access", "Tracking Access sends you a client's weight, measurements, nutrition, injuries and photos, encrypted so only your phone can read them. In Track, tap the Tracking title and pick a client. Check the safety code matches theirs."),
  ], true),
  trainerSession: chapter("trainerSession", "🏋️", "Trainer: running a session", [
    practice("Open a client and tap Start session. The bar shows who you're logging for.", { type: "banner", variant: "trainerSession" }),
    card("📤", "Programs", "Send program on a client's page shares the splits you tick. Edit program opens theirs in Programs. You can't delete their logged sets or touch their account."),
  ], true),
  trainerFollow: chapter("trainerFollow", "📈", "Trainer: following clients", [
    card("👀", "Follow their progress", "A client's friend tabs show their History, Analytics, Program and Live session. In Progress, tap the title to pick a client."),
  ], true),
};

export const TUTORIAL: ChapterId[] = ["welcome", "home", "plan", "workout", "progress", "tracking", "supplements", "friends", "sharing", "together", "widgets", "settings"];
export const ONLINE_TOUR: ChapterId[] = ["friends", "sharing", "together"];
export const TRAINER_TOUR: ChapterId[] = ["trainerClient", "trainerSession", "trainerFollow"];

export function stepsFor(chapter: Chapter, mode: AppMode): Step[] {
  if (!chapter.onlineOnly || mode === "online") return chapter.steps;
  return [
    card("🌐", `${chapter.title} needs online mode`, "This part needs online mode. Switch to online mode in Settings, then replay this chapter from Settings → About → Tutorial."),
  ];
}
