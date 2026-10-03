import type { SetTiming } from "@shared/types"
import { pickRecordSessions, recordSessionsOutside } from "../recordSets"

const set = (
  exerciseName: string,
  weight: number,
  reps: number,
  extra: Partial<SetTiming> = {},
): SetTiming => ({
  exerciseName,
  weight,
  reps,
  setIndex: 0,
  endTime: "2026-01-01T10:00:00Z",
  ...extra,
})

const setsOf = (sessions: { setTimings?: SetTiming[] }[]) =>
  sessions.flatMap((session) => session.setTimings ?? [])

describe("pickRecordSessions", () => {
  it("keeps only the record-setting sets and drops sessions with none", () => {
    const heaviest = set("Bench", 100, 3)
    const mostReps = set("Bench", 40, 20)
    const ordinary = set("Bench", 60, 25)
    const repeat = set("Bench", 100, 3)
    const sessions = [
      { id: 1, setTimings: [heaviest, set("Bench", 80, 3)] },
      { id: 2, setTimings: [repeat] },
      { id: 3, setTimings: [mostReps, ordinary] },
    ]

    const result = pickRecordSessions(sessions)

    expect(result.map((s) => s.id)).toEqual([1, 3])
    expect(setsOf(result)).toContain(heaviest)
    expect(setsOf(result)).toContain(ordinary)
    expect(setsOf(result)).not.toContain(repeat)
  })

  it("keeps the heaviest and lightest set for each rep count up to the limit", () => {
    const fiveHeavy = set("Pull-up", 20, 5)
    const fiveLight = set("Pull-up", -30, 5)
    const fiveMiddle = set("Pull-up", 0, 5)
    const result = pickRecordSessions([
      { id: 1, setTimings: [fiveHeavy, fiveMiddle, fiveLight] },
    ])

    expect(setsOf(result)).toEqual([fiveHeavy, fiveLight])
  })

  it("does not keep a per-rep record past the rep limit", () => {
    const top = set("Curl", 20, 15)
    const beaten = set("Curl", 10, 15)
    const floor = set("Curl", 5, 14)
    const result = pickRecordSessions([
      { id: 1, setTimings: [top, beaten, floor] },
    ])

    expect(setsOf(result)).not.toContain(beaten)
  })

  it("tracks each exercise and machine separately", () => {
    const smith = set("Squat", 80, 5, { machineName: "Smith" })
    const free = set("Squat", 120, 5)
    const result = pickRecordSessions([{ id: 1, setTimings: [smith, free] }])

    expect(setsOf(result)).toEqual([smith, free])
  })

  it("ignores warm-ups and sets without reps", () => {
    const result = pickRecordSessions([
      {
        id: 1,
        setTimings: [
          set("Row", 200, 5, { isWarmup: true }),
          set("Row", 300, 0),
        ],
      },
    ])

    expect(result).toEqual([])
  })
})

describe("recordSessionsOutside", () => {
  it("drops record sessions the window already holds", () => {
    const records = [{ id: 1 }, { id: "2" }, { id: 3 }]
    expect(recordSessionsOutside([{ id: "1" }, { id: 2 }], records)).toEqual([
      { id: 3 },
    ])
  })

  it("returns nothing when the server can't provide records", () => {
    expect(recordSessionsOutside([{ id: 1 }], null)).toEqual([])
  })
})
