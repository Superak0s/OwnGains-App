import { parseSharedMachines, sharedMachinesPayload, MAX_SHARED_MACHINES } from "../machineSharing";

describe("parseSharedMachines", () => {
  it("keeps only trimmed, non-empty, short strings from a friend's payload", () => {
    expect(
      parseSharedMachines({ machines: [" Cybex ", "", 7, null, "x".repeat(61), "Matrix"] }),
    ).toEqual(["Cybex", "Matrix"]);
  });

  it("returns nothing for a malformed payload", () => {
    expect(parseSharedMachines(null)).toEqual([]);
    expect(parseSharedMachines({ machines: "Cybex" })).toEqual([]);
    expect(parseSharedMachines({ programData: {} })).toEqual([]);
  });

  it("caps the list", () => {
    const machines = Array.from({ length: 150 }, (_, i) => `M${i}`);
    expect(parseSharedMachines({ machines })).toHaveLength(MAX_SHARED_MACHINES);
  });
});

describe("sharedMachinesPayload", () => {
  it("sends the program's machine names once each", () => {
    const ex = (name: string, machines: string[]) => ({ name, machines, sets: 3 });
    const program = {
      days: [
        {
          dayNumber: 1,
          split: {
            A: { totalSets: 0, exercises: [ex("Press", ["Cybex"]), ex("Row", ["cybex", "Matrix"])] },
          },
        },
      ],
    };
    expect(sharedMachinesPayload(program)).toEqual({ machines: ["Cybex", "Matrix"] });
    expect(sharedMachinesPayload(null)).toEqual({ machines: [] });
  });
});
