jest.mock("@shared/services/sqliteStorage", () => require("test-utils/memorySqlite"));
jest.mock("@shared/context/AuthContext", () => require("test-utils/renderWithProviders").authModule);
jest.mock("@shared/context/WorkoutContext", () => require("test-utils/renderWithProviders").workoutModule);
jest.mock("@shared/context/ThemeContext", () => require("test-utils/renderWithProviders").themeModule);
jest.mock("@react-navigation/native", () => require("test-utils/renderWithProviders").navigationModule);

import React from "react";
import { Text } from "react-native";
import { screen } from "@testing-library/react-native";
import { useAuth } from "@shared/context/AuthContext";
import { useWorkout } from "@shared/context/WorkoutContext";
import { useTheme } from "@shared/context/ThemeContext";
import { useNavigation } from "@react-navigation/native";
import { renderWithProviders } from "test-utils/renderWithProviders";
import { program } from "test-utils/fixtures";

function Probe() {
  const { user } = useAuth();
  const { workoutData } = useWorkout();
  const { colors } = useTheme();
  useNavigation();
  return <Text style={{ color: colors.textPrimary }}>{`${user?.username}:${workoutData?.days.length ?? "none"}`}</Text>;
}

it("hands screens the overridden context values so edge data can be mounted", async () => {
  await renderWithProviders(<Probe />, { workout: { workoutData: program } });
  expect(screen.getByText("tester:2")).toBeTruthy();
  await renderWithProviders(<Probe />, { auth: { user: { id: "x", username: "other" } } });
  expect(screen.getByText("other:none")).toBeTruthy();
});
