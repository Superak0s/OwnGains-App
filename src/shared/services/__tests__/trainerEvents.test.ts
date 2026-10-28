import {
  toTrainerEvent,
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
    expect(toTrainerEvent(event())).not.toBeNull();
    expect(toTrainerEvent(event({ type: "trainee_set_recorded" }))).not.toBeNull();
    expect(toTrainerEvent(event({ type: "trainer_session_started" }))).not.toBeNull();
    expect(toTrainerEvent(event({ type: "trainer_session_ended" }))).not.toBeNull();
  });

  it("accepts the numeric sessionId the server sends, as a string", () => {
    expect(toTrainerEvent({ ...event(), sessionId: 88 })?.sessionId).toBe("88");
  });

  it("rejects unrelated socket messages", () => {
    expect(toTrainerEvent({ type: "joint_session_invite" })).toBeNull();
    expect(toTrainerEvent(null)).toBeNull();
    expect(toTrainerEvent({ type: "trainer_set_recorded" })).toBeNull();
  });

  it("rejects an event missing trainerUsername", () => {
    const { trainerUsername, ...rest } = event();
    expect(toTrainerEvent(rest)).toBeNull();
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
