import { createContext, useContext } from "react";
import * as dispatched from "./services";

export type TrackingApis = typeof dispatched;

export interface TrackingView {
  readonly apis: TrackingApis;
  /** Set when the screen shows someone else's tracking, which can be looked at but not changed. */
  readonly readOnly: { readonly title: string; readonly subtitle?: string } | null;
}

const TrackingViewContext = createContext<TrackingView>({ apis: dispatched, readOnly: null });

export const TrackingViewProvider = TrackingViewContext.Provider;
export const useTrackingApis = (): TrackingApis => useContext(TrackingViewContext).apis;
export const useTrackingReadOnly = (): TrackingView["readOnly"] => useContext(TrackingViewContext).readOnly;
