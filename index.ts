// Imports run in order, so crash reporting starts before App's module graph
// loads and an error thrown while a module initialises is still reported.
import "./src/shared/services/startCrashReporting";
import { registerRootComponent } from "expo";
import App from "./App";

registerRootComponent(App);
