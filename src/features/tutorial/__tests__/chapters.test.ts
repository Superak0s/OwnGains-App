import { CHAPTERS, ONLINE_TOUR, TRACKS, chaptersFor, onlineChaptersFor, stepsFor, type ChapterId } from "../chapters";

const ALL = Object.keys(CHAPTERS) as ChapterId[];
const TRAINER_ONLY: ChapterId[] = ["trainerClient", "trainerSession", "trainerFollow"];

it("keeps the track orders from the spec", () => {
  expect(TRACKS.user).toEqual(["welcome", "home", "plan", "workout", "progress", "tracking", "supplements", "friends", "sharing", "together", "widgets", "settings"]);
  expect(TRACKS.trainer).toEqual(["welcome", "friends", "trainerClient", "trainerSession", "workout", "trainerFollow", "together", "widgets", "settings"]);
  expect(TRACKS.both).toEqual([...TRACKS.user, ...TRAINER_ONLY]);
  expect(chaptersFor("trainer")).toBe(TRACKS.trainer);
});

it("covers every chapter in some track", () => {
  const used = new Set([...TRACKS.user, ...TRACKS.trainer, ...TRACKS.both]);
  expect(ALL.filter((id) => !used.has(id))).toEqual([]);
});

it("hides trainer features from the user track and granting from the trainer track", () => {
  expect(TRACKS.user.filter((id) => TRAINER_ONLY.includes(id))).toEqual([]);
  expect(TRACKS.trainer).not.toContain("sharing");
});

it("online tours contain exactly the online-only chapters of the track", () => {
  expect(onlineChaptersFor("user")).toEqual(["friends", "sharing", "together"]);
  expect(onlineChaptersFor("trainer")).toEqual(["friends", "trainerClient", "trainerSession", "trainerFollow", "together"]);
  expect(onlineChaptersFor("both")).toEqual(["friends", "sharing", "together", "trainerClient", "trainerSession", "trainerFollow"]);
  for (const role of ["user", "trainer", "both"] as const) {
    expect(ONLINE_TOUR[role].every((id) => CHAPTERS[id].onlineOnly)).toBe(true);
    expect(TRACKS[role].filter((id) => CHAPTERS[id].onlineOnly).sort()).toEqual([...ONLINE_TOUR[role]].sort());
  }
});

it("turns an online-only chapter into one card offline and leaves others alone", () => {
  const offline = stepsFor(CHAPTERS.friends, "offline");
  expect(offline).toHaveLength(1);
  expect(offline[0]).toMatchObject({ kind: "card", icon: "🌐" });
  expect(stepsFor(CHAPTERS.friends, "online")).toBe(CHAPTERS.friends.steps);
  expect(stepsFor(CHAPTERS.home, "offline")).toBe(CHAPTERS.home.steps);
});

it("has no empty chapter, checklist or caption", () => {
  for (const ch of Object.values(CHAPTERS)) {
    expect(ch.steps.length).toBeGreaterThan(0);
    for (const step of ch.steps) {
      if (step.kind === "practice" && step.practice.type === "checklist") {
        expect(step.practice.items.length).toBeGreaterThan(0);
      }
      const text = step.kind === "card" ? step.body : step.caption;
      expect(text.trim()).not.toBe("");
    }
  }
});
