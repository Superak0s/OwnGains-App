jest.mock("@shared/components/ScrollTabBar", () => ({ __esModule: true, default: () => null }))
jest.mock("@shared/components/ZoomableImage", () => ({ __esModule: true, default: () => null }))
jest.mock("@shared/services/sqliteStorage", () => require("test-utils/memorySqlite"))
jest.mock("@shared/context/AuthContext", () => require("test-utils/renderWithProviders").authModule)
jest.mock("@shared/context/WorkoutContext", () => require("test-utils/renderWithProviders").workoutModule)
jest.mock("@shared/context/ThemeContext", () => require("test-utils/renderWithProviders").themeModule)
jest.mock("@shared/context/JointSessionContext", () => require("test-utils/renderWithProviders").jointSessionModule)
jest.mock("@react-navigation/native", () => require("test-utils/renderWithProviders").navigationModule)
jest.mock("@shared/services/appMode", () => ({
  ...jest.requireActual("@shared/services/appMode"),
  isServerless: async () => true,
  getAppMode: async () => "offline",
  getAppModeSync: () => "offline",
}))
jest.mock("@shared/services/authenticatedFetch", () => ({
  authenticatedFetch: jest.fn(async () => {
    throw new Error("offline tracking must not reach the network")
  }),
}))

import React from "react"
import { fireEvent, screen, waitFor } from "@testing-library/react-native"
import { renderWithProviders } from "test-utils/renderWithProviders"
import { resetMemorySqlite } from "test-utils/memorySqlite"
import { authenticatedFetch } from "@shared/services/authenticatedFetch"
import { formatDate } from "@utils/format"
import { bodyTrackingApi, hydrationApi, macrosTrackingApi, progressPhotoApi } from "../services"
import { TRACKING_TABS } from "../tabs"
import { PhotosComparisonWidget } from "../tabs/PhotosTab"
import TrackingScreen from "../TrackingScreen"

const tabKeys = TRACKING_TABS.map((t) => t.key).filter((k) => k !== "health")

const openTab = async (tab: string) => {
  await renderWithProviders(<TrackingScreen />, { routeParams: { tab } })
  await waitFor(() => expect(screen.queryByLabelText("Loading entries")).toBeNull())
}

beforeEach(() => {
  resetMemorySqlite()
  jest.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

describe("an account with nothing logged", () => {
  it.each(tabKeys)("opens the %s tab without crashing, a load error or a network call", async (tab) => {
    await openTab(tab)
    expect(screen.queryByText("Couldn't load this tab's data.")).toBeNull()
    expect(authenticatedFetch).not.toHaveBeenCalled()
  })
})

describe("an account with entries", () => {
  it("shows a logged weight instead of the empty state", async () => {
    await bodyTrackingApi.logWeight(81.5, "kg", null, new Date().toISOString())
    await openTab("weight")
    expect(await screen.findByText("81.5 kg")).toBeOnTheScreen()
  })

  it("shows today's logged water", async () => {
    await hydrationApi.logHydration(400, undefined, new Date().toISOString())
    await openTab("hydration")
    expect(await screen.findByText("400 ml")).toBeOnTheScreen()
  })

  it("shows a logged meal once the entries finish loading", async () => {
    await macrosTrackingApi.logMacros({ name: "Oats", protein: 12, carbs: 60, fat: 5, calories: 330 })
    await openTab("macros")
    expect(await screen.findByText(/Oats/)).toBeOnTheScreen()
    expect(screen.queryByText(/Nothing logged yet/)).toBeNull()
  })
})

describe("changing data", () => {
  it("keeps a weight entry when the delete is cancelled and removes it when confirmed", async () => {
    await bodyTrackingApi.logWeight(81.5, "kg", null, new Date().toISOString())
    await openTab("weight")

    await fireEvent.press(await screen.findByLabelText("Delete weight entry"))
    await fireEvent.press(await screen.findByText("Cancel"))
    expect((await bodyTrackingApi.getWeightHistory()).entries).toHaveLength(1)

    await fireEvent.press(screen.getByLabelText("Delete weight entry"))
    await fireEvent.press(await screen.findByText("Delete"))
    await waitFor(() => expect(screen.queryByText("81.5 kg")).toBeNull())
    expect((await bodyTrackingApi.getWeightHistory()).entries).toEqual([])
  })

  it("stores a new weight and shows it without a reload", async () => {
    await openTab("weight")
    await fireEvent.press(screen.getAllByLabelText("Log weight")[0])
    await fireEvent.changeText(await screen.findByPlaceholderText("Enter weight (kg)"), "79.4")
    await fireEvent.press(screen.getByText("Save"))
    await waitFor(async () => expect((await bodyTrackingApi.getWeightHistory()).entries).toHaveLength(1))
    expect(await screen.findByText("79.4 kg")).toBeOnTheScreen()
  })

  it("refuses a non-numeric weight instead of storing NaN", async () => {
    await openTab("weight")
    await fireEvent.press(screen.getAllByLabelText("Log weight")[0])
    await fireEvent.changeText(await screen.findByPlaceholderText("Enter weight (kg)"), "abc")
    await fireEvent.press(screen.getByText("Save"))
    expect(await screen.findByText("Invalid Input")).toBeOnTheScreen()
    expect((await bodyTrackingApi.getWeightHistory()).entries).toEqual([])
  })

  it("removes a water entry after the confirm", async () => {
    await hydrationApi.logHydration(400, undefined, new Date().toISOString())
    await openTab("hydration")
    await fireEvent.press(await screen.findByLabelText("Delete water entry"))
    await fireEvent.press(await screen.findByText("Delete"))
    await waitFor(() => expect(screen.queryByText("400 ml")).toBeNull())
    expect((await hydrationApi.getHydrationHistory()).data).toEqual([])
  })
})

describe("photo comparison", () => {
  const photo = (id: number, takenAt: string) => ({
    id,
    takenAt,
    uri: `file:///photos/${id}.jpg`,
    thumbUri: null,
    muscleGroups: [],
    angle: "front",
  })

  const openComparison = async (photos: ReturnType<typeof photo>[]) => {
    jest.spyOn(progressPhotoApi, "getPhotoPage").mockResolvedValue({ success: true, data: photos, nextCursor: null } as never)
    await renderWithProviders(<PhotosComparisonWidget />)
    await fireEvent.press(screen.getByText("Compare photos"))
  }

  it("opens with no photos and says nothing matches", async () => {
    await openComparison([])
    expect(await screen.findByText("No photos match these filters.")).toBeOnTheScreen()
  })

  it("opens with one photo day and asks for another instead of comparing it with itself", async () => {
    await openComparison([photo(1, "2026-09-01T08:00:00.000Z")])
    expect(await screen.findByText(/Only one day of photos matches/)).toBeOnTheScreen()
    expect(screen.queryByText(/apart$/)).toBeNull()
  })

  it("opens with two photo days and puts the older one as Before", async () => {
    const year = new Date().getFullYear()
    const [sep, oct] = [`${year}-09-01T08:00:00.000Z`, `${year}-10-01T08:00:00.000Z`]
    await openComparison([photo(2, oct), photo(1, sep)])
    const day = (iso: string) => formatDate(iso, { month: "short", day: "numeric" })
    expect((await screen.findAllByText(`Before · ${day(sep)}`)).length).toBeGreaterThan(0)
    expect(screen.getAllByText(`After · ${day(oct)}`).length).toBeGreaterThan(0)
  })
})
