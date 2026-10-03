import React from "react";
import {
  PhotosCalendarWidget,
  PhotosGalleryWidget,
  PhotosComparisonWidget,
} from "../tabs/PhotosTab";
import { Note } from "../ui";

export function renderPhotosWidget(type: string): React.ReactNode {
  switch (type) {
    case "photos_calendar": return <PhotosCalendarWidget />;
    case "photos_gallery": return <PhotosGalleryWidget />;
    case "photos_comparison": return <PhotosComparisonWidget />;
    default: return <Note>Coming soon</Note>;
  }
}
