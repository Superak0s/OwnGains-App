import React from "react";
import { create, act } from "react-test-renderer";
import { usePhotoPages } from "../usePhotoPages";
import { progressPhotoApi } from "../../services";
import type { PhotoCursor, PhotoPage } from "../../types/muscleRecovery";

jest.mock("../../services", () => ({
  progressPhotoApi: { getPhotoPage: jest.fn() },
}));

jest.mock("@shared/services/crashReporting", () => ({
  captureException: jest.fn(),
}));

const getPhotoPage = progressPhotoApi.getPhotoPage as jest.Mock;

const page = (ids: number[], next: PhotoCursor | null): PhotoPage => ({
  success: true,
  data: ids.map((id) => ({ id, takenAt: `2024-01-${String(30 - id).padStart(2, "0")}` })),
  nextCursor: next,
});

type Control = ReturnType<typeof usePhotoPages>;

function Harness({ controlRef }: { readonly controlRef: { current: Control | null } }) {
  controlRef.current = usePhotoPages();
  return null;
}

function mount() {
  const controlRef: { current: Control | null } = { current: null };
  act(() => {
    create(<Harness controlRef={controlRef} />);
  });
  return () => controlRef.current!;
}

beforeEach(() => {
  getPhotoPage.mockReset();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("usePhotoPages", () => {
  it("flags a failed load and clears it once a retry succeeds", async () => {
    getPhotoPage
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(page([1], null));
    const control = mount();

    await act(() => control().refresh());
    expect(control().loadFailed).toBe(true);
    expect(control().photos).toEqual([]);

    await act(() => control().refresh());
    expect(control().loadFailed).toBe(false);
    expect(control().photos.map((p) => p.id)).toEqual([1]);
  });

  it("loads the next page from the cursor and appends it", async () => {
    getPhotoPage
      .mockResolvedValueOnce(page([1, 2], { before: "b", beforeId: "2" }))
      .mockResolvedValueOnce(page([3], null));
    const control = mount();

    await act(() => control().refresh());
    expect(control().hasMore).toBe(true);

    await act(() => control().loadMore());
    expect(getPhotoPage).toHaveBeenLastCalledWith({ before: "b", beforeId: "2" }, 50);
    expect(control().photos.map((p) => p.id)).toEqual([1, 2, 3]);
    expect(control().hasMore).toBe(false);
  });

  it("loadAll follows the cursor to the end", async () => {
    getPhotoPage
      .mockResolvedValueOnce(page([1], { before: "a", beforeId: "1" }))
      .mockResolvedValueOnce(page([2], { before: "b", beforeId: "2" }))
      .mockResolvedValueOnce(page([3], null));
    const control = mount();

    await act(() => control().loadAll());

    expect(control().photos.map((p) => p.id)).toEqual([1, 2, 3]);
    expect(getPhotoPage).toHaveBeenCalledTimes(3);
  });

  it("stops loadAll on a failed page instead of retrying forever", async () => {
    getPhotoPage
      .mockResolvedValueOnce(page([1], { before: "a", beforeId: "1" }))
      .mockRejectedValue(new Error("offline"));
    const control = mount();

    await act(() => control().loadAll());

    expect(getPhotoPage).toHaveBeenCalledTimes(2);
    expect(control().photos.map((p) => p.id)).toEqual([1]);
    expect(control().hasMore).toBe(true);
  });

  it("drops a page that arrives after a refresh", async () => {
    let resolveStale: (p: PhotoPage) => void = () => {};
    getPhotoPage
      .mockResolvedValueOnce(page([1], { before: "a", beforeId: "1" }))
      .mockImplementationOnce(() => new Promise((r) => (resolveStale = r)))
      .mockResolvedValueOnce(page([9], null));
    const control = mount();

    await act(() => control().refresh());
    let stale: Promise<void> = Promise.resolve();
    act(() => {
      stale = control().loadMore();
    });
    await act(() => control().refresh());
    await act(async () => {
      resolveStale(page([2], null));
      await stale;
    });

    expect(control().photos.map((p) => p.id)).toEqual([9]);
  });
});
