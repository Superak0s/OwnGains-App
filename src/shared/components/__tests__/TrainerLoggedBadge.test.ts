import { trainerLoggedLabel } from "../TrainerLoggedBadge"

describe("trainerLoggedLabel", () => {
  it("is empty for a workout the user logged themselves", () => {
    expect(trainerLoggedLabel({})).toBeNull()
    expect(trainerLoggedLabel({ loggedByTrainerId: null, loggedByTrainerUsername: "coach" })).toBeNull()
  })

  it("names the trainer who logged it", () => {
    expect(trainerLoggedLabel({ loggedByTrainerId: "u1", loggedByTrainerUsername: "coach" })).toBe("Logged by @coach")
  })

  it("takes another verb", () => {
    expect(trainerLoggedLabel({ loggedByTrainerId: "u1", loggedByTrainerUsername: "coach", verb: "Scheduled" })).toBe("Scheduled by @coach")
  })
})
