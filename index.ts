// Imports run in order, so crash reporting starts before App's module graph
// loads and an error thrown while a module initialises is still reported.
import "./src/shared/services/startCrashReporting";
import { AppRegistry } from "react-native";
import { registerRootComponent } from "expo";
import { ALARM_SCREEN } from "./src/shared/services/supplementAlarms";
import AlarmScreen from "./src/features/supplements/components/AlarmScreen";
import App from "./App";

// The native AlarmActivity starts its own React root.
AppRegistry.registerComponent(ALARM_SCREEN, () => AlarmScreen);

registerRootComponent(App);
