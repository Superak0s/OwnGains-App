import React from "react"
import { screen } from "@testing-library/react-native"
import { renderWithProviders } from "test-utils/renderWithProviders"
import { FriendProgramTab } from "../FriendProgramTab"
import type { ReceivedProgram } from "../../types"

jest.mock("@shared/services/sqliteStorage", () => require("test-utils/memorySqlite"))
jest.mock("@shared/context/ThemeContext", () => require("test-utils/renderWithProviders").themeModule)

const program: ReceivedProgram = {
  id: 1,
  senderId: 7,
  senderUsername: "sam",
  sharedAt: "2026-10-01T09:00:00.000Z",
  message: null,
  programData: {
    name: "Push",
    totalDays: 1,
    days: [
      {
        dayNumber: 1,
        dayTitle: "Day 1",
        exercises: [
          { name: "Bench Press", setsBySplit: { A: 3 } },
          { name: "Fly", setsBySplit: { A: 2 } },
          { name: "Bench Press", setsBySplit: { A: 2 } },
        ],
      },
    ],
  },
}

describe("FriendProgramTab", () => {
  it("renders an exercise that appears twice in one day without a duplicate key", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {})
    await renderWithProviders(
      <FriendProgramTab
        selectedFriend={{ id: 7, username: "sam" } as never}
        receivedPrograms={[program]}
        selectedProgram={null}
        setSelectedProgram={jest.fn()}
        onUsePlan={jest.fn()}
        styles={{} as never}
      />,
    )

    expect(screen.getAllByText("Bench Press")).toHaveLength(2)
    expect(error.mock.calls.flat().join(" ")).not.toMatch(/same key/)
    error.mockRestore()
  })
})
