import { createDispatchProxy } from "@shared/services/dispatchProxy"
import { authService as onAuthService } from "./on/auth"
import { authService as offAuthService } from "./off/auth"

export const authService = createDispatchProxy(onAuthService, offAuthService)
