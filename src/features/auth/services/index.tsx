import { createDispatchProxy } from "@shared/services/dispatchProxy"
import { authService as onAuthService } from "./on/auth"
import { authService as offAuthService } from "./off/auth"
import { profilePhotoApi as onProfilePhotoApi } from "./on/profilePhoto"
import { profilePhotoApi as offProfilePhotoApi } from "./off/profilePhoto"

export const authService = createDispatchProxy(onAuthService, offAuthService)
export const profilePhotoApi = createDispatchProxy(
  onProfilePhotoApi,
  offProfilePhotoApi,
  undefined,
  "profilePhoto",
)
