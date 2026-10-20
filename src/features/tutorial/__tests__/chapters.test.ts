import { CHAPTERS, ONLINE_TOUR, TRAINER_TOUR, TUTORIAL, stepsFor, type ChapterId } from "../chapters";

const ALL = Object.keys(CHAPTERS) as ChapterId[];

it("covers every chapter in the tutorial or the trainer tour, once", () => {
  expect([...TUTORIAL, ...TRAINER_TOUR].sort()).toEqual([...ALL].sort());
});

it("opens with the trainer mode hint", () => {
  const first = CHAPTERS[TUTORIAL[0]].steps[0];
  expect(first).toMatchObject({ kind: "card" });
  expect(first.kind === "card" && first.body).toContain("Trainer Mode");
});

it("the online tour is exactly the online-only chapters of the tutorial", () => {
  expect(ONLINE_TOUR.every((id) => CHAPTERS[id].onlineOnly)).toBe(true);
  expect(TUTORIAL.filter((id) => CHAPTERS[id].onlineOnly).sort()).toEqual([...ONLINE_TOUR].sort());
  expect(TRAINER_TOUR.every((id) => CHAPTERS[id].onlineOnly)).toBe(true);
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
