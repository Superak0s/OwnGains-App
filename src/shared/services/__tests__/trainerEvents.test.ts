import {
  isTrainerEvent,
  onTrainerEvent,
  type TrainerEvent,
} from "../trainerEvents";

const event = (over: Partial<TrainerEvent> = {}): TrainerEvent => ({
  type: "trainer_set_recorded",
  traineeId: "trainee-9",
  trainerId: "trainer-1",
  trainerUsername: "coach",
  sessionId: "88",
  ...over,
});

describe("trainerEvents", () => {
  it("recognises the four trainer event types", () => {
    expect(isTrainerEvent(event())).toBe(true);
    expect(isTrainerEvent(event({ type: "trainee_set_recorded" }))).toBe(true);
    expect(isTrainerEvent(event({ type: "trainer_session_started" }))).toBe(
      true,
    );
    expect(isTrainerEvent(event({ type: "trainer_session_ended" }))).toBe(true);
  });

  it("rejects unrelated socket messages", () => {
    expect(isTrainerEvent({ type: "joint_session_invite" })).toBe(false);
    expect(isTrainerEvent(null)).toBe(false);
    expect(isTrainerEvent({ type: "trainer_set_recorded" })).toBe(false);
  });

  it("rejects an event missing trainerUsername", () => {
    const { trainerUsername, ...rest } = event();
    expect(isTrainerEvent(rest)).toBe(false);
  });

  it("delivers events to subscribers and stops on unsubscribe", () => {
    const seen: TrainerEvent[] = [];
    const off = onTrainerEvent.subscribe((e) => seen.push(e));

    onTrainerEvent.trigger(event());
    off();
    onTrainerEvent.trigger(event({ sessionId: "99" }));

    expect(seen).toHaveLength(1);
    expect(seen[0].sessionId).toBe("88");
  });

  it("lets each subscriber filter by the user it is bound to", () => {
    const forA: TrainerEvent[] = [];
    const boundTo = "trainee-A";
    const off = onTrainerEvent.subscribe((e) => {
      if (e.traineeId === boundTo) forA.push(e);
    });

    onTrainerEvent.trigger(event({ traineeId: "trainee-B" }));
    onTrainerEvent.trigger(event({ traineeId: "trainee-A" }));
    off();

    expect(forA).toHaveLength(1);
    expect(forA[0].traineeId).toBe("trainee-A");
  });
});
