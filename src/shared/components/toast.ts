import { Platform, ToastAndroid } from "react-native";

/**
 * Brief, non-blocking confirmation. Android-only: there is no maintained iOS
 * target, and a silent no-op is better than a blocking dialog for a routine save.
 */
export function showToast(message: string): void {
  if (Platform.OS === "android") {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  }
}
