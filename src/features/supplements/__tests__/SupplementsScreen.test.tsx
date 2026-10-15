jest.mock("@shared/services/sqliteStorage", () => require("test-utils/memorySqlite"))
jest.mock("@shared/context/AuthContext", () => require("test-utils/renderWithProviders").authModule)
jest.mock("@shared/context/ThemeContext", () => require("test-utils/renderWithProviders").themeModule)
jest.mock("@react-navigation/native", () => require("test-utils/renderWithProviders").navigationModule)
jest.mock("@shared/components/ModalSheet", () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}))
jest.mock("@shared/components/LocalOnlyNotice", () => () => null)
jest.mock("@shared/services/supplementReminders", () => ({
  cancelTimeReminder: jest.fn(async () => {}),
  cancelNextDoseReminder: jest.fn(async () => {}),
  scheduleNextDoseReminder: jest.fn(async () => "id"),
  scheduleTimeReminder: jest.fn(async () => "id"),
  removeSupplementReminderConfig: jest.fn(async () => {}),
  pruneOrphanedSupplementReminders: jest.fn(async () => {}),
  readSupplementReminderConfigs: jest.fn(async () => []),
  saveSupplementReminderConfig: jest.fn(async () => {}),
}))
jest.mock("@features/supplements/services", () => ({
  supplementsApi: {
    list: jest.fn(),
    create: jest.fn(),
    log: jest.fn(),
    getLog: jest.fn(),
    delete: jest.fn(),
    deleteLogEntry: jest.fn(),
  },
}))

import { act, fireEvent, screen, waitFor } from "@testing-library/react-native"
import { renderWithProviders } from "test-utils/renderWithProviders"
import { supplementsApi } from "@features/supplements/services"
import * as reminders from "@shared/services/supplementReminders"
import { resetMemorySqlite } from "test-utils/memorySqlite"
import SupplementsScreen from "../SupplementsScreen"

const api = supplementsApi as unknown as Record<string, jest.Mock>
const rem = reminders as unknown as Record<string, jest.Mock>

const supp = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  name: "Creatine",
  unit: "g",
  defaultAmount: 5,
  reminderEnabled: false,
  reminderTime: null,
  color: null,
  icon: "💪",
  dosesPerDay: 1,
  doseIntervalMinutes: null,
  takenToday: false,
  dosesToday: 0,
  lastTakenAt: null,
  streak: 0,
  ...overrides,
})

const listReturns = (...lists: unknown[][]) => {
  for (const list of lists) api.list.mockResolvedValueOnce({ success: true, supplements: list })
}

const deferred = <T,>() => {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

const pressLast = async (text: string) => {
  const all = screen.getAllByText(text)
  await fireEvent.press(all[all.length - 1])
}

beforeEach(() => {
  jest.clearAllMocks()
  resetMemorySqlite()
  for (const fn of [...Object.values(api), ...Object.values(rem)]) if (jest.isMockFunction(fn)) fn.mockReset()
  api.list.mockResolvedValue({ success: true, supplements: [] })
  rem.readSupplementReminderConfigs.mockResolvedValue([])
})

afterEach(() => {
  jest.useRealTimers()
})

it("reloads the list when the day changes while the screen stays open", async () => {
  jest.useFakeTimers({ now: new Date(2026, 9, 14, 23, 59, 45) })
  listReturns([supp({ takenToday: true, dosesToday: 1 })], [supp()])
  await renderWithProviders(<SupplementsScreen />)
  expect(await screen.findByText("✓ Done")).toBeTruthy()

  await act(async () => {
    jest.advanceTimersByTime(30_000)
  })

  expect(api.list).toHaveBeenCalledTimes(2)
  expect(await screen.findByText("Log")).toBeTruthy()
})

it("schedules the next dose from the refreshed count, not the card's stale one", async () => {
  const interval = 240
  listReturns(
    [supp({ dosesPerDay: 3, dosesToday: 2, doseIntervalMinutes: interval })],
    [supp({ dosesPerDay: 3, dosesToday: 1, doseIntervalMinutes: interval, lastTakenAt: new Date().toISOString() })],
  )
  api.log.mockResolvedValue({ success: true, id: 9, streak: 1 })
  await renderWithProviders(<SupplementsScreen />)

  await fireEvent.press(await screen.findByLabelText("Log Creatine"))
  await fireEvent.press(screen.getByLabelText("Log 5 g of Creatine"))

  await waitFor(() => expect(rem.scheduleNextDoseReminder).toHaveBeenCalled())
  expect(rem.cancelNextDoseReminder).not.toHaveBeenCalled()
  const due = rem.scheduleNextDoseReminder.mock.calls[0][5] as Date
  expect(due.getTime() - Date.now()).toBeGreaterThan((interval - 1) * 60_000)
})

it("cancels the next-dose reminder when the dose that started it is deleted", async () => {
  const entry = {
    id: 5,
    supplementId: 1,
    amount: 5,
    takenAt: new Date().toISOString(),
    note: null,
    createdAt: new Date().toISOString(),
  }
  listReturns(
    [supp({ dosesPerDay: 3, dosesToday: 1, doseIntervalMinutes: 240, lastTakenAt: entry.takenAt })],
    [supp({ dosesPerDay: 3, dosesToday: 0, doseIntervalMinutes: 240 })],
  )
  api.getLog.mockResolvedValue({ success: true, entries: [entry], streak: 1, takenToday: true, todayEntry: entry })
  api.deleteLogEntry.mockResolvedValue({ success: true })
  await renderWithProviders(<SupplementsScreen />)

  await fireEvent.press(await screen.findByText("Creatine"))
  await fireEvent.press(screen.getByLabelText("Creatine history"))
  await fireEvent.press(await screen.findByLabelText("Delete supplement entry"))
  await pressLast("Delete")

  await waitFor(() => expect(rem.cancelNextDoseReminder).toHaveBeenCalledWith("u1", 1))
})

it("keeps the history of the supplement opened last when an earlier request finishes late", async () => {
  listReturns([supp(), supp({ id: 2, name: "Zinc", unit: "mg" })])
  const slow = deferred<unknown>()
  api.getLog.mockImplementation((id: number) =>
    id === 1
      ? slow.promise
      : Promise.resolve({ success: true, entries: [{ id: 20, supplementId: 2, amount: 7, takenAt: new Date().toISOString(), note: null, createdAt: "" }], streak: 0, takenToday: true, todayEntry: null }),
  )
  await renderWithProviders(<SupplementsScreen />)

  await fireEvent.press(await screen.findByText("Creatine"))
  await fireEvent.press(screen.getByText("Zinc"))
  // One outer act: renders flush only when it ends, so both presses run before the re-render.
  await act(async () => {
    const opens = [
      fireEvent.press(screen.getByLabelText("Creatine history")),
      fireEvent.press(screen.getByLabelText("Zinc history")),
    ]
    slow.resolve({ success: true, entries: [{ id: 10, supplementId: 1, amount: 99, takenAt: new Date().toISOString(), note: null, createdAt: "" }], streak: 0, takenToday: true, todayEntry: null })
    await Promise.all(opens)
  })

  expect(screen.getByText("7 mg")).toBeTruthy()
  expect(screen.queryByText("99 g")).toBeNull()
})

it("adds a template once when it is tapped twice in a row", async () => {
  const pending = deferred<unknown>()
  api.create.mockReturnValue(pending.promise)
  await renderWithProviders(<SupplementsScreen />)

  await fireEvent.press(await screen.findByText("+ Add"))
  const row = screen.getByText("Magnesium")
  // One outer act: renders flush only when it ends, so the second tap runs before the re-render.
  await act(async () => {
    const taps = [fireEvent.press(row), fireEvent.press(row)]
    pending.resolve({ success: true, supplement: supp() })
    await Promise.all(taps)
  })

  expect(api.create).toHaveBeenCalledTimes(1)
})

it("shows an error when a supplement's reminders cannot be read before deleting it", async () => {
  listReturns([supp()])
  rem.readSupplementReminderConfigs.mockRejectedValueOnce(new Error("disk full"))
  await renderWithProviders(<SupplementsScreen />)

  await fireEvent.press(await screen.findByText("Creatine"))
  await fireEvent.press(screen.getByLabelText("Delete Creatine"))
  await pressLast("Delete")

  expect(await screen.findByText("Error")).toBeTruthy()
  expect(api.delete).not.toHaveBeenCalled()
})

it("still shows the error when restoring the reminder after a failed delete throws", async () => {
  listReturns([supp()])
  rem.readSupplementReminderConfigs.mockResolvedValueOnce([
    { supplementId: 1, name: "Creatine", unit: "g", defaultAmount: 5, timeBasedEnabled: true, reminderTime: "08:00", enabled: true },
  ])
  api.delete.mockRejectedValueOnce(new Error("offline"))
  rem.saveSupplementReminderConfig.mockRejectedValueOnce(new Error("disk full"))
  await renderWithProviders(<SupplementsScreen />)

  await fireEvent.press(await screen.findByText("Creatine"))
  await fireEvent.press(screen.getByLabelText("Delete Creatine"))
  await pressLast("Delete")

  expect(await screen.findByText("Error")).toBeTruthy()
})
