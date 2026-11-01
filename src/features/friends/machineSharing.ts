import { suggestMachineNames } from "@features/workout/utils";
import { isServerless } from "@shared/services/appMode";
import { reportAndReturn } from "@shared/services/crashReporting";
import type { WorkoutData } from "@shared/types";
import { sharingApi } from "./services";

export const MAX_SHARED_MACHINES = 100;
const MAX_MACHINE_NAME = 60;

export const sharedMachinesPayload = (
  program: Pick<WorkoutData, "days"> | null | undefined,
): { machines: string[] } => ({
  machines: suggestMachineNames(program, null, [], "")
    .filter((m) => m.length <= MAX_MACHINE_NAME)
    .slice(0, MAX_SHARED_MACHINES),
});

/** Machine names from a friend's grant. A friend wrote the payload, so only short strings are kept. */
export const parseSharedMachines = (payload: unknown): string[] => {
  const list = (payload as { machines?: unknown } | null)?.machines;
  if (!Array.isArray(list)) return [];
  return list
    .filter((m): m is string => typeof m === "string")
    .map((m) => m.trim())
    .filter((m) => m && m.length <= MAX_MACHINE_NAME)
    .slice(0, MAX_SHARED_MACHINES);
};

/** Re-sends the current machine names to every friend they're shared with. */
export async function refreshSharedMachines(
  program: Pick<WorkoutData, "days"> | null | undefined,
): Promise<void> {
  if (await isServerless()) return;
  const grants = await sharingApi
    .getGrantedPermissions()
    .catch(reportAndReturn([], { stage: "refreshSharedMachines" }));
  const targets = grants.filter((g) => g.permissionType === "machines");
  if (!targets.length) return;
  const payload = sharedMachinesPayload(program);
  await Promise.all(
    targets.map((g) =>
      sharingApi
        .grantPermission(g.toUserId, "machines", payload)
        .catch(reportAndReturn(null, { stage: "refreshSharedMachines" })),
    ),
  );
}

export async function fetchFriendMachineNames(): Promise<string[]> {
  if (await isServerless()) return [];
  const received = await sharingApi
    .getReceivedPermissions()
    .catch(reportAndReturn([], { stage: "friendMachineNames" }));
  return received
    .filter((p) => p.permissionType === "machines")
    .flatMap((p) => parseSharedMachines(p.payload));
}
