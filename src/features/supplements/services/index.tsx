import { createDispatchProxy } from "@shared/services/dispatchProxy"
import { supplementsApi as supplementsApiOn } from "./on/supplements"
import { supplementsApi as supplementsApiOff } from "./off/supplements"

export const supplementsApi = createDispatchProxy(
  supplementsApiOn,
  supplementsApiOff,
  "supplements",
)

export type {
  SupplementSummary,
  SupplementEntry,
  CreateSupplementParams,
  UpdateSupplementParams,
  LogSupplementParams,
  SupplementLogResponse,
} from "../types"
