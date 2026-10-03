import React from "react";
import { create, act } from "react-test-renderer";
import { useMeasurementsTab, type MeasurementInput } from "../useMeasurementsTab";
import { bodyMeasurementsApi, customMeasurementsApi } from "../../services";

jest.mock("../../services", () => ({
  bodyMeasurementsApi: {
    logMeasurement: jest.fn(),
    deleteMeasurementEntry: jest.fn(),
  },
  customMeasurementsApi: {
    createType: jest.fn(),
    listTypes: jest.fn(),
    logValue: jest.fn(),
  },
}));

const logMeasurement = bodyMeasurementsApi.logMeasurement as jest.Mock;
const createType = customMeasurementsApi.createType as jest.Mock;
const listTypes = customMeasurementsApi.listTypes as jest.Mock;
const logValue = customMeasurementsApi.logValue as jest.Mock;

type Control = ReturnType<typeof useMeasurementsTab>;

const alert = jest.fn();
const loadTabData = jest.fn(async () => {});

function Harness({ controlRef }: { controlRef: React.MutableRefObject<Control | null> }) {
  controlRef.current = useMeasurementsTab({
    alert,
    loadTabData,
    setDayModal: jest.fn(),
    selectedLogDate: null,
    setSelectedLogDate: jest.fn(),
    buildLocalISOForDate: jest.fn(),
  });
  return null;
}

const form = (fields: Partial<MeasurementInput>): MeasurementInput => ({
  waist: "",
  armLeft: "",
  armRight: "",
  chest: "",
  customPart: "",
  customValue: "",
  ...fields,
});

async function log(fields: Partial<MeasurementInput>) {
  const controlRef: React.MutableRefObject<Control | null> = { current: null };
  await act(async () => {
    create(<Harness controlRef={controlRef} />);
  });
  let result: string | undefined;
  await act(async () => {
    result = await controlRef.current!.handleLogMeasurement(form(fields));
  });
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  logMeasurement.mockResolvedValue(undefined);
  createType.mockResolvedValue({ keyName: "calves" });
  logValue.mockResolvedValue(undefined);
});

describe("useMeasurementsTab.handleLogMeasurement", () => {
  it("refuses an empty form or a non-numeric value without calling the API", async () => {
    expect(await log({})).toBe("none");
    expect(await log({ chest: "abc" })).toBe("none");
    expect(await log({ customPart: "Calves", customValue: "x" })).toBe("none");
    expect(alert).toHaveBeenCalledTimes(3);
    expect(logMeasurement).not.toHaveBeenCalled();
  });

  it("logs only the filled standard fields and reloads", async () => {
    expect(await log({ waist: "80", chest: "100" })).toBe("all");
    expect(logMeasurement).toHaveBeenCalledWith(80, undefined, undefined, 100, undefined);
    expect(logValue).not.toHaveBeenCalled();
    expect(loadTabData).toHaveBeenCalled();
  });

  it("reports a partial save when the custom value fails after the standard ones were saved", async () => {
    logValue.mockRejectedValue(new Error("offline"));
    expect(await log({ waist: "80", customPart: "Calves", customValue: "38" })).toBe("standard");
    expect(loadTabData).not.toHaveBeenCalled();
  });

  it("reuses an existing custom type when creating it is refused", async () => {
    createType.mockRejectedValue(new Error("duplicate"));
    listTypes.mockResolvedValue({ data: [{ keyName: "calves", label: "Calves" }] });

    expect(await log({ customPart: " calves ", customValue: "38" })).toBe("all");
    expect(logValue).toHaveBeenCalledWith("calves", 38, undefined);
  });
});
