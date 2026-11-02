jest.mock("@shared/services/sqliteStorage", () => require("test-utils/memorySqlite"))
jest.mock("@shared/context/ThemeContext", () => require("test-utils/renderWithProviders").themeModule)
jest.mock("../services", () => ({
  messagesApi: { getThread: jest.fn(), markRead: jest.fn(async () => undefined) },
}))

import { fireEvent, screen } from "@testing-library/react-native"
import { renderWithProviders } from "test-utils/renderWithProviders"
import { messagesApi } from "../services"
import ConversationScreen from "../ConversationScreen"

const getThread = messagesApi.getThread as jest.Mock

it("shows a load failure with a retry instead of an empty conversation", async () => {
  getThread.mockRejectedValueOnce(new TypeError("Network request failed")).mockResolvedValueOnce({
    messages: [{ id: 1, body: "hello there", fromMe: false, createdAt: "2026-10-20T10:00:00.000Z" }],
    canSend: true,
  })
  await renderWithProviders(
    <ConversationScreen
      peer={{ userUuid: "u2", username: "sam" }}
      onBack={jest.fn()}
      onRead={jest.fn()}
      onSent={jest.fn()}
      onChanged={jest.fn()}
    />,
  )

  expect(await screen.findByText("Couldn't load messages")).toBeTruthy()
  expect(screen.queryByText(/No messages yet/)).toBeNull()

  await fireEvent.press(screen.getByText("Retry"))

  expect(await screen.findByText("hello there")).toBeTruthy()
  expect(getThread).toHaveBeenCalledTimes(2)
})
