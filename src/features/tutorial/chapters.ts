import type { AppMode } from "@shared/services/appMode";
import { TAB_META, type TabName } from "@shared/services/tabOrder";
import type { AnchorId } from "./anchors";
import type { Role } from "./tutorialState";

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
  | { type: "friendRequest" }
  | { type: "soreness" }
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

const tapTab = (tab: TabName, caption: string): Step => ({
  kind: "spotlight",
  anchor: `tab.${tab}`,
  caption,
  gesture: "tap",
  advanceOn: "tap",
  fallback: `${TAB_META[tab].label} is scrolled out of the tab bar. Tap Next to go there.`,
});
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
    card("💪", "Welcome to OwnGains", "Log workouts, follow a plan, and track your progress and body data. Everything is saved on this device first. Online mode adds sync, friends and training together."),
    spot("Home", "tab.Home", "This is the tab bar. Every screen is one tap away. Swipe it sideways to see more tabs.", "The tab bar at the bottom has every screen. Swipe it sideways to see more."),
    spot("Home", "tabbar.toggle", "The arrow beside the tab bar slides it away when you need room, and brings it back.", "The arrow beside the tab bar hides it and brings it back."),
    card("↕️", "Your tabs, your order", "Reorder or hide tabs any time in Settings → Tab Order."),
  ]),
  home: chapter("home", "🏠", "Home", [
    tapTab("Home", "Tap Home."),
    card("🏠", "Your Home board", "Next Workout shows the day you'll train next, Weekly Progress your week at a glance, Workout History every finished session, and Streak how many weeks in a row you've trained."),
    spot("Home", "home.changeDay", "Change Day picks which program day you'll train next.", "Once you have a plan, Change Day on the Next Workout card picks the day you'll train next."),
    checklist("Finished days lock. Try the locked-day actions.", [
      ["✓", "Day 1 — Push · Locked", "A finished day locks, so the workout you logged can't be changed by accident."],
      ["👀", "Tap to view", "Opens the finished session with every set, weight and rep."],
      ["🔓", "Unlock", "Settings → Locked Days unlocks one day if you need to fix something."],
    ]),
    card("🧩", "Widgets from other screens", "Home can also show widgets from any other screen. The Widgets chapter shows you how."),
  ]),
  plan: chapter("plan", "📋", "Plan", [
    tapTab("Plan", "Tap Plan. Your program is here."),
    checklist("Build your plan: start from a template or make your own split.", [
      ["📚", "Template", "Pick a ready-made program such as Push/Pull/Legs, Upper/Lower or Full Body, then adjust it."],
      ["✏️", "New split", "Name your split and choose how many days it has."],
      ["➕", "Add exercises", "Filter the exercise library, browse by muscle, or create a custom exercise."],
    ]),
    card("📋", "Your splits at a glance", "Once you have a plan, this board shows Your splits, Weekly volume per muscle, and a card for every program day. Insert into current adds a day's exercises to the day you're on."),
    spot("Plan", "plan.import", "Import file brings in a program from a spreadsheet (.ods, .xlsx or .xls).", "Build your plan → Import file brings in a program from a spreadsheet."),
    checklist("After an import, check how each row was matched.", [
      ["🔍", "Re-check matches", "Runs matching again after you rename a row."],
      ["✅", "Accept a match", "Links the row to the library exercise, so its progress charts connect."],
      ["📝", "Keep as custom", "Keeps your own name as a custom exercise."],
    ]),
    spot("Plan", "plan.export", "Export saves your program as a JSON backup, or as a spreadsheet graded against a target rep range.", "Once you have a plan, Export sits below your program days."),
  ]),
  workout: chapter("workout", "🏋️", "Workout", [
    tapTab("Workout", "Tap Workout. This is where you log your training."),
    card("📊", "Session at a glance", "The Day, Total Sets, Progress and Session Stats widgets, plus the stats ticker, keep score while you train."),
    practice("Log a set: enter the weight and reps, rate the effort, then save. Tap Use it to copy last time's numbers.", { type: "logSet" }),
    checklist("Build the day as you go.", [
      ["➕", "Add Sets", "Adds more sets to an exercise, and − removes one."],
      ["🏋️", "Add Exercise", "Adds an exercise to today, from the library or one of your own."],
      ["💡", "Suggestions", "One tap adds a suggested exercise for muscles you haven't trained yet."],
      ["🔧", "Machines", "Save the machines at your gym and pick one per exercise, so your weights stay comparable."],
      ["✏️", "Edit a set", "Tap a logged set to fix its weight, reps or notes, or to delete it."],
    ]),
    checklist("Rest between sets.", [
      ["⏱️", "Presets", "Choose a rest reminder such as 1:30 or 3:00."],
      ["🔢", "Custom", "Type any number of seconds."],
      ["🔕", "Turn Off", "No reminder until you choose one again."],
    ]),
    checklist("OwnGains notices when you beat your best.", [
      ["🏆", "PR celebration", "A new personal record gets a celebration. You can turn it off in Settings."],
      ["📈", "Auto-progression", "When you reach the top of your rep range, it suggests adding weight."],
    ]),
    spot("Workout", "workout.addExercise", "Add Exercise adds a movement to today's workout.", "Once a day is loaded, Add Exercise sits below the exercise list."),
    card("🔄", "Change day mid-workout", "Picked the wrong day? You can change it mid-workout, and exercises you've already logged come with you."),
    spot("Workout", "workout.complete", "Complete workout ends the session and locks the day.", "During a session, Complete workout at the bottom ends it and locks the day."),
    card("📶", "Offline is fine", "Sessions logged without a connection sync on their own when you're back online."),
  ]),
  progress: chapter("progress", "📊", "Progress", [
    tapTab("Analytics", "Tap Progress."),
    spot("Analytics", "scrollTabs", "Switch between one exercise, a muscle group, or your Training Summary.", "At the top of Progress, switch between Exercise, Muscle Group and Training Summary."),
    checklist("Every chart on the Progress board.", [
      ["🎯", "Select Exercise", "Choose which exercise or muscle group the charts show."],
      ["📅", "Workout History", "Every session that included it."],
      ["🧮", "Weekly Sets", "Working sets this week against your 4-week average. For a muscle group, against the 10 to 20 sets most muscles need to grow."],
      ["📋", "Exercises", "For a muscle group, every exercise in it with its own 1RM and 30-day trend."],
      ["💯", "Estimated 1RM", "Your estimated one-rep max over time."],
      ["🏆", "Personal Records", "Your best weight at each rep count from 1 to 12."],
      ["📈", "Progress Rate", "How fast you're improving."],
      ["🎚️", "Rep Range Split", "How your sets divide between strength, hypertrophy and endurance ranges."],
      ["📆", "Training Frequency", "How often you train it each week."],
      ["😮‍💨", "Rest & Fatigue", "How your rest times and performance change across a session."],
      ["➕", "More in the gallery", "All Set Data, Last Workout, and weight and reps charts can be added from the widget gallery."],
    ]),
    checklist("Tap any chart to open it full screen.", [
      ["📆", "Range", "Pick 1W to All, or your own dates."],
      ["🔍", "Zoom", "Pinch to zoom, double tap to reset, and tap a point to see its value or open that day's workout."],
      ["📉", "Trend and goal", "Add a 7 day average or trend line, a goal line with an estimated date, and record markers."],
      ["🔁", "Compare", "Show the previous period or last year beside this one."],
      ["⚙️", "Chart options", "Switch between line, area and bar, and set the Y axis and labels. Settings are kept per chart."],
      ["💾", "Export", "Save the chart as an image or its points as CSV."],
    ]),
  ]),
  tracking: chapter("tracking", "📈", "Tracking", [
    tapTab("Tracking", "Tap Track. Your body data is here."),
    spot("Tracking", "scrollTabs", "Each sub-tab tracks one thing. Edit tabs lets you reorder or hide them.", "At the top of Track, each sub-tab tracks one thing."),
    checklist("What each sub-tab does.", [
      ["⚖️", "Weight", "Log your weight and see it on a calendar and a trend line."],
      ["📸", "Photos", "Add progress photos and compare two side by side."],
      ["🍽️", "Macros", "Log calories, protein, carbs and fat."],
      ["📐", "Body Fat", "Enter your height once and get a body-fat % from your measurements."],
      ["📏", "Measurements", "Chest, waist, arms and more over time."],
      ["💧", "Hydration", "Log water against a weekly goal."],
      ["🩹", "Recovery", "Soreness, a morning recovery check, recovery analytics and an injury log."],
      ["🌙", "Cycle", "Your cycle status, with your period and cycle length."],
      ["❤️", "Health", "On Android, your steps, heart rate and sleep from Health Connect."],
    ]),
    practice("Tap the muscles that feel sore to log recovery.", { type: "soreness" }),
    card("🩹", "More recovery tools", "Recovery also has the morning recovery check, recovery analytics, and Log injury."),
  ]),
  supplements: chapter("supplements", "💊", "Supplements", [
    tapTab("Supplements", "Tap Supps."),
    checklist("Add a supplement and log your doses.", [
      ["➕", "Add", "Choose a preset such as Creatine, or add your own with a dose and unit."],
      ["✅", "Log a dose", "One tap logs today's dose."],
      ["🔁", "Log Again", "Took a second dose? Log another one."],
      ["📜", "History", "See every dose you've logged."],
    ]),
    checklist("Never miss a dose.", [
      ["🔔", "Reminders", "Choose how many doses a day and at what time."],
      ["📳", "Notification type", "A quiet notification or a louder alert."],
      ["🔋", "Battery settings", "On phones that delay notifications to save battery, OwnGains tells you once which settings to change."],
    ]),
  ]),
  friends: chapter("friends", "👥", "Friends", [
    tapTab("Friends", "Tap Friends."),
    spot("Friends", "scrollTabs", "Friends and Requests are both here.", "At the top of Friends, switch between Friends and Requests. Search for people from the bar at the top of Friends."),
    practice("Add a friend by QR code or username. Alex sent you a request, so accept it.", { type: "friendRequest" }),
    checklist("Each friend has their own tabs.", [
      ["📅", "History", "Their workout calendar and sessions."],
      ["📊", "Analytics", "Their progress charts."],
      ["📋", "Program", "The program they shared with you. Use this plan makes it your own."],
      ["🔴", "Live", "Their session as it happens."],
      ["⚙️", "Actions", "Permissions, sessions and more."],
      ["🔒", "Locked tab", "They haven't given you access to this yet. Tap it to see what they'd need to allow."],
    ]),
    checklist("If a friendship goes wrong.", [
      ["➖", "Remove", "Ends the friendship."],
      ["⛔", "Block", "They can't find or contact you."],
      ["🚩", "Report", "Tells the server operator about abuse."],
      ["🗒️", "Blocked Users", "Settings → Blocked Users lets you unblock someone."],
    ]),
  ], true),
  sharing: chapter("sharing", "🔐", "Sharing & permissions", [
    practice("You decide what each friend can see and do. Turn a few on, give Alex Trainer Access, then turn one off.", { type: "permissions" }),
    practice("While a trainer logs a session for you, this banner shows on your Workout screen. Try revoking their access.", { type: "banner", variant: "trainer" }),
  ], true),
  together: chapter("together", "🤝", "Training together", [
    practice("Lift Together: invite Alex, follow their progress live, and leave any time.", { type: "banner", variant: "partner" }),
    checklist("Lift together and watch live.", [
      ["📨", "Invite", "Friends → friend → Actions → Lift Together. They need to allow Joint Session."],
      ["👥", "Partner badges", "Exercises you share are marked, and you can see which one they're on."],
      ["🔴", "Watch", "A friend's Live tab shows their session as it happens, if they allow Watch Session."],
      ["⏹️", "Stop", "Stop watching, or leave a joint session, at any time."],
    ]),
  ], true),
  widgets: chapter("widgets", "🧩", "Widgets", [
    practice("Pull down with two fingers anywhere on a board to open its widget gallery.", { type: "twoFingerPull" }),
    spot("Home", "widgets.edit", "Or tap here to add, reorder, resize or remove widgets.", "At the bottom of every board, Add or edit widgets opens the same panel."),
    card("🧩", "Every screen has its own board", "Home, Workout, Plan, Progress, Friends and every Track sub-tab each have their own widgets."),
  ]),
  settings: chapter("settings", "⚙️", "Settings", [
    tapTab("Settings", "Tap Settings."),
    checklist("Tune how OwnGains works.", [
      ["👤", "Profile", "Your name, height and details, plus Change Password when you're online."],
      ["🕐", "Use Manual Time", "Enter set times yourself instead of using the clock."],
      ["🏆", "PR Celebration", "Turn the personal-record celebration on or off."],
      ["📈", "Auto-Progression Prompt", "Turn the add-weight suggestion on or off."],
      ["⏱️", "Time Between Sets", "Your default rest reminder."],
      ["⚖️", "Compare against", "What your sets are compared with."],
      ["🎨", "Theme", "Pick a theme or design your own."],
      ["↕️", "Tab Order", "Reorder or hide tabs."],
    ]),
    spot("Settings", "settings.sync", "Sync Now sends anything waiting to your server.", "Under Connected To you'll see your server, and Sync Now whenever something is waiting."),
    checklist("Your data, your call.", [
      ["🔓", "Locked Days", "Unlock one day to fix it."],
      ["✏️", "Edit workout history", "Correct past sessions."],
      ["📤", "Export My Data", "Save everything to an encrypted file."],
      ["📥", "Restore Data", "Load a backup or a Strength Level export."],
      ["🐞", "Crash reports", "Choose whether crash reports are sent."],
      ["📊", "Usage metrics", "Opt in to anonymous usage metrics."],
      ["🆕", "What's New", "Changes in each version."],
      ["☕", "Support Development", "An optional tip to keep OwnGains running."],
    ]),
    spot("Settings", "settings.exportData", "Export My Data keeps a copy of everything you've logged.", "Under Privacy and Data, Export My Data saves everything to a file."),
    spot("Settings", "settings.tutorial", "Replay any chapter of this tutorial from here.", "Settings → About → Tutorial replays any chapter."),
  ]),
  trainerClient: chapter("trainerClient", "🤝", "Trainer: getting a client", [
    card("🧑‍🏫", "Getting a client", "Trainer mode lets you log workouts for a client and edit their program. Your client stays in control: only they can give you access."),
    practice("First, add your client as a friend.", { type: "friendRequest" }),
    card("💬", "Ask for Trainer Access", "There's no request button. Ask your client in person or by message to turn on Trainer Access for you."),
    practice("This is the screen your client sees: Friends → you → Actions → Trainer Access. Try it here so you can walk them through it.", { type: "permissions" }),
    card("📊", "Ask to follow their progress too", "Ask for History, Analytics and Share My Program as well, so you can follow how they're doing."),
  ], true),
  trainerSession: chapter("trainerSession", "🏋️", "Trainer: running a session", [
    checklist("Start a session for your client.", [
      ["👤", "Pick your client", "Tap Train next to them in Friends, or open them."],
      ["⚙️", "Actions", "Once they've granted Trainer Access, their Actions tab has Start trainer session."],
      ["▶️", "Start", "Workout opens, and you're running their session."],
    ]),
    practice("Me and Trainees switch between your workout and your client's. The bar shows who you're logging for.", { type: "banner", variant: "trainerSession" }),
    practice("Log their sets exactly like your own.", { type: "logSet" }),
    card("📤", "Send a plan", "In your client's Actions tab, Send a Plan shares your program. They see it in your Program tab and tap Use this plan to follow it."),
    card("🛡️", "Built-in limits", "You can edit their program, but you can't delete their sets, remove their only machine, touch their account, or do anything destructive."),
  ], true),
  trainerFollow: chapter("trainerFollow", "📈", "Trainer: following clients", [
    checklist("Once your client grants access, follow them from their friend tabs.", [
      ["📅", "History", "Every session they've logged."],
      ["📊", "Analytics", "Their progress charts."],
      ["📋", "Program", "The program they're following."],
      ["🔴", "Live", "Their session as it happens."],
    ]),
    card("👀", "Watch live", "Their Live tab shows their session as it happens, so you can coach from anywhere."),
  ], true),
};

const USER_TRACK: ChapterId[] = ["welcome", "home", "plan", "workout", "progress", "tracking", "supplements", "friends", "sharing", "together", "widgets", "settings"];

export const TRACKS: Record<Role, ChapterId[]> = {
  user: USER_TRACK,
  trainer: ["welcome", "friends", "trainerClient", "trainerSession", "workout", "trainerFollow", "together", "widgets", "settings"],
  both: [...USER_TRACK, "trainerClient", "trainerSession", "trainerFollow"],
};

export const ONLINE_TOUR: Record<Role, ChapterId[]> = {
  user: ["friends", "sharing", "together"],
  trainer: ["friends", "trainerClient", "trainerSession", "trainerFollow", "together"],
  both: ["friends", "sharing", "together", "trainerClient", "trainerSession", "trainerFollow"],
};

export const chaptersFor = (role: Role): ChapterId[] => TRACKS[role];
export const onlineChaptersFor = (role: Role): ChapterId[] => ONLINE_TOUR[role];

export function stepsFor(chapter: Chapter, mode: AppMode): Step[] {
  if (!chapter.onlineOnly || mode === "online") return chapter.steps;
  return [
    card("🌐", `${chapter.title} needs online mode`, "This part needs online mode. Switch to online mode in Settings, then replay this chapter from Settings → Tutorial."),
  ];
}
