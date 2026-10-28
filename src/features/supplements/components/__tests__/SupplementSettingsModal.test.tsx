jest.mock("@shared/services/sqliteStorage", () => require("test-utils/memorySqlite"))
jest.mock("@shared/context/AuthContext", () => require("test-utils/renderWithProviders").authModule)
jest.mock("@shared/context/ThemeContext", () => require("test-utils/renderWithProviders").themeModule)
jest.mock("@react-navigation/native", () => require("test-utils/renderWithProviders").navigationModule)
jest.mock("@shared/components/ModalSheet", () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}))
jest.mock("@shared/services/supplementReminders", () => ({
  scheduleTimeReminder: jest.fn(async () => "id"),
  cancelTimeReminder: jest.fn(async () => {}),
  cancelNextDoseReminder: jest.fn(async () => {}),
  saveSupplementReminderConfig: jest.fn(async () => {}),
  initializeSupplementNotifications: jest.fn(async () => true),
}))
jest.mock("@shared/services/notifications", () => ({
  promptForAlarmPermissions: jest.fn(async () => {}),
  promptForExactAlarms: jest.fn(async () => {}),
}))
jest.mock("@features/supplements/services", () => ({
  supplementsApi: { update: jest.fn(async () => ({ success: true })) },
}))

import { act, fireEvent, screen, waitFor } from "@testing-library/react-native"
import { renderWithProviders } from "test-utils/renderWithProviders"
import { supplementsApi } from "@features/supplements/services"
import * as reminders from "@shared/services/supplementReminders"
import SupplementSettingsModal from "../SupplementSettingsModal"

const api = supplementsApi as unknown as Record<string, jest.Mock>
const rem = reminders as unknown as Record<string, jest.Mock>

const supplement = {
  id: 1,
  name: "Creatine",
  unit: "g",
  defaultAmount: 5,
  reminderEnabled: true,
  reminderTime: "08:00",
  color: null,
  icon: "💪",
  dosesPerDay: 3,
  doseIntervalMinutes: 240,
  takenToday: false,
  dosesToday: 0,
  lastTakenAt: null,
  streak: 0,
}

const mount = () =>
  renderWithProviders(
    <SupplementSettingsModal visible supplement={supplement} onClose={jest.fn()} onSaved={jest.fn()} />,
  )

beforeEach(() => jest.clearAllMocks())

it("turning off all reminders also cancels the next-dose reminder and keeps a comma amount", async () => {
  await mount()
  await fireEvent.changeText(await screen.findByDisplayValue("5"), "2,5")
  await fireEvent.press(screen.getByText("Turn off all reminders"))
  await fireEvent.press(await screen.findByText("Disable"))

  await waitFor(() => expect(rem.cancelNextDoseReminder).toHaveBeenCalledWith("u1", 1))
  await waitFor(() =>
    expect(rem.saveSupplementReminderConfig).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ defaultAmount: 2.5, enabled: false }),
    ),
  )
})

it("saves once when Save is tapped again while the permission check is pending", async () => {
  let grant!: (v: boolean) => void
  rem.initializeSupplementNotifications.mockReturnValueOnce(new Promise<boolean>((r) => { grant = r }))
  await mount()

  const save = await screen.findByText("✓ Save Settings")
  // One outer act: renders flush only when it ends, so the second tap runs before the re-render.
  await act(async () => {
    const taps = [fireEvent.press(save), fireEvent.press(save)]
    grant(true)
    await Promise.all(taps)
  })

  await waitFor(() => expect(api.update).toHaveBeenCalled())
  expect(api.update).toHaveBeenCalledTimes(1)
})
