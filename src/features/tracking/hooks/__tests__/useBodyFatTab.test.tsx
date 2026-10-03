import React from "react";
import { create, act } from "react-test-renderer";
import { useBodyFatTab, type BodyFatInput } from "../useBodyFatTab";
import { bodyFatApi } from "../../services";
import type { HeightData } from "@shared/types";

jest.mock("../../services", () => ({
  bodyFatApi: { logBodyFat: jest.fn(), deleteBodyFatEntry: jest.fn() },
}));
jest.mock("@features/auth/services/index", () => ({
  authService: { updateProfile: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock("@shared/services/sqliteStorage", () =>
  require("test-utils/memorySqlite"),
);

const logBodyFat = bodyFatApi.logBodyFat as jest.Mock;

type Control = ReturnType<typeof useBodyFatTab>;

const alert = jest.fn();
const openHeightModal = jest.fn();

function Harness({
  controlRef,
  height,
  sex,
}: {
  controlRef: React.MutableRefObject<Control | null>;
  height: HeightData | null;
  sex: "male" | "female";
}) {
  controlRef.current = useBodyFatTab({
    alert,
    loadData: jest.fn(),
    setDayModal: jest.fn(),
    selectedLogDate: null,
    setSelectedLogDate: jest.fn(),
    height,
    getUserKey: (k) => k,
    savedFormulaSex: sex,
    openHeightModal,
  });
  return null;
}

async function calculate(
  input: Partial<BodyFatInput>,
  { height = { heightCm: 180 } as HeightData | null, sex = "male" as "male" | "female" } = {},
) {
  const controlRef: React.MutableRefObject<Control | null> = { current: null };
  await act(async () => {
    create(<Harness controlRef={controlRef} height={height} sex={sex} />);
  });
  let saved = false;
  await act(async () => {
    saved = await controlRef.current!.calculateBodyFat({ waist: "", neck: "", hip: "", ...input });
  });
  return saved;
}

beforeEach(() => {
  jest.clearAllMocks();
  logBodyFat.mockResolvedValue(undefined);
});

describe("useBodyFatTab.calculateBodyFat", () => {
  it("logs the US Navy estimate in centimetres for a male", async () => {
    expect(await calculate({ waist: "85", neck: "38" })).toBe(true);
    const [percentage, measurements, sex] = logBodyFat.mock.calls[0];
    expect(percentage).toBeCloseTo(16.1, 1);
    expect(measurements).toEqual({ waist: 85, neck: 38, hip: 0, unit: "cm" });
    expect(sex).toBe("male");
  });

  it("requires the hip for the female formula", async () => {
    expect(await calculate({ waist: "70", neck: "32" }, { sex: "female" })).toBe(false);
    expect(logBodyFat).not.toHaveBeenCalled();
  });

  it("asks for a height first and can route to the height sheet", async () => {
    expect(await calculate({ waist: "85", neck: "38" }, { height: null })).toBe(false);
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    buttons.find((b) => b.text === "Set Height")!.onPress!();
    expect(openHeightModal).toHaveBeenCalled();
  });

  it("rejects a neck larger than the waist rather than logging a nonsense value", async () => {
    expect(await calculate({ waist: "30", neck: "40" })).toBe(false);
    expect(logBodyFat).not.toHaveBeenCalled();
  });
});
