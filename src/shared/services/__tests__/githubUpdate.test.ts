jest.mock("@shared/services/sqliteStorage", () =>
  require("test-utils/memorySqlite"),
);

import { checkForGitHubUpdate } from "../githubUpdate";

describe("checkForGitHubUpdate", () => {
  const release = { tag_name: "v2.0.0", html_url: "https://github.com/r/2" };
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it("returns a newer release and then waits a day before checking again", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => release });
    const now = 1_000_000_000_000;
    await expect(checkForGitHubUpdate("1.0.0", now)).resolves.toEqual({
      version: "2.0.0",
      url: release.html_url,
    });
    await expect(checkForGitHubUpdate("1.0.0", now + 1000)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries next launch when GitHub fails", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });
    const now = 2_000_000_000_000;
    await expect(checkForGitHubUpdate("1.0.0", now)).resolves.toBeNull();
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => release });
    await expect(checkForGitHubUpdate("2.0.0", now + 1)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
