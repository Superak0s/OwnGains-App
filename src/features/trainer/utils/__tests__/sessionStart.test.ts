import type { WorkoutData } from "@shared/types"
import { trainerDayChoices } from "../sessionStart"

const data: WorkoutData = {
  days: [
    { dayNumber: 1, dayTitle: "Push", split: { A: { exercises: [{ name: "Bench", sets: 3 }], totalSets: 3 } } },
    { dayNumber: 2, split: { B: { exercises: [{ name: "Squat", sets: 3 }], totalSets: 3 } } },
    { dayNumber: 3, split: { A: { exercises: [{ name: "Row", sets: 4 }], totalSets: 4 } } },
  ],
}

it("lists the trainer's days of their split, numbered within it", () => {
  expect(trainerDayChoices(data, "A")).toEqual([
    { label: "Day 1 · Push", start: { dayTitle: "Push", exercises: [{ name: "Bench", sets: 3 }] } },
    { label: "Day 2", start: { dayTitle: "Day 2", exercises: [{ name: "Row", sets: 4 }] } },
  ])
})

it("lists nothing without a program or a split", () => {
  expect(trainerDayChoices(null, "A")).toEqual([])
  expect(trainerDayChoices(data, null)).toEqual([])
})
