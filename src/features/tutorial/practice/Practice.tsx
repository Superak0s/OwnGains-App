import React from "react";
import type { PracticeSpec } from "../chapters";
import {
  BannerDemo,
  Checklist,
  FriendRequestDemo,
  LogSetDemo,
  PermissionsDemo,
  SorenessDemo,
  TwoFingerPullDemo,
} from "./demos";

export default function Practice({
  spec,
  onComplete,
}: {
  readonly spec: PracticeSpec;
  readonly onComplete: () => void;
}): React.JSX.Element {
  switch (spec.type) {
    case "checklist":
      return <Checklist items={spec.items} onComplete={onComplete} />;
    case "logSet":
      return <LogSetDemo onComplete={onComplete} />;
    case "permissions":
      return <PermissionsDemo onComplete={onComplete} />;
    case "friendRequest":
      return <FriendRequestDemo onComplete={onComplete} />;
    case "soreness":
      return <SorenessDemo onComplete={onComplete} />;
    case "twoFingerPull":
      return <TwoFingerPullDemo onComplete={onComplete} />;
    case "banner":
      return <BannerDemo variant={spec.variant} onComplete={onComplete} />;
  }
}
