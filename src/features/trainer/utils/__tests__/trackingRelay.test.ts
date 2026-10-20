import { putRecords } from "@shared/services/sqliteStorage"
import { resetMemorySqlite } from "test-utils/memorySqlite"
import { setRecordStoreUser } from "@shared/services/offlineHelpers"
import { getUserKey } from "@shared/services/storage"
import { trackingRelayApi } from "../../services"
import { getDeviceKey, open, safetyCode, seal } from "../trackingCrypto"
import { loadTrackingCopy, purgeTrackingCopies, syncTrackingInbox, unpackTrackingCopy } from "../trackingInbox"
import { shareTracking } from "../trackingShare"
import { clientTrackingApis, READ_ONLY_MESSAGE } from "../trackingView"

const mockFiles = new Map<string, string>()
const mockSecrets = new Map<string, string>()

jest.mock("@shared/services/sqliteStorage", () => require("test-utils/memorySqlite"))
jest.mock("expo-crypto", () => ({
  getRandomBytes: (n: number) => new Uint8Array(jest.requireActual<typeof import("crypto")>("crypto").randomBytes(n)),
}))
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (k: string) => mockSecrets.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockSecrets.set(k, v)),
}))
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///doc/",
  EncodingType: { Base64: "base64" },
  getInfoAsync: jest.fn(async (uri: string) => ({
    exists: [...mockFiles.keys()].some((f) => f.startsWith(uri)),
    size: mockFiles.get(uri)?.length,
  })),
  readAsStringAsync: jest.fn(async (uri: string) => mockFiles.get(uri)),
  writeAsStringAsync: jest.fn(async (uri: string, v: string) => void mockFiles.set(uri, v)),
  makeDirectoryAsync: jest.fn(async () => {}),
  readDirectoryAsync: jest.fn(async (dir: string) =>
    [...mockFiles.keys()].filter((f) => f.startsWith(dir)).map((f) => f.slice(dir.length)),
  ),
  deleteAsync: jest.fn(async (uri: string) => {
    for (const f of [...mockFiles.keys()]) if (f.startsWith(uri)) mockFiles.delete(f)
  }),
}))
jest.mock("@shared/services/localOnlyFeatures", () => ({ isFeatureLocal: async () => true }))
jest.mock("../../services", () => ({
  trackingRelayApi: {
    registerDeviceKey: jest.fn(async () => 7),
    getRecipients: jest.fn(),
    sendMessage: jest.fn(),
    getMessages: jest.fn(),
    ackMessages: jest.fn(async () => {}),
    requestResend: jest.fn(async () => {}),
  },
}))

const relay = trackingRelayApi as jest.Mocked<typeof trackingRelayApi>
type Sent = Parameters<typeof relay.sendMessage>
let mailbox: Sent[] = []

const asClient = async () => {
  setRecordStoreUser("client-1")
}
const asTrainer = async () => {
  setRecordStoreUser("trainer-1")
}

beforeEach(async () => {
  jest.clearAllMocks()
  resetMemorySqlite()
  mockFiles.clear()
  mailbox = []
  relay.sendMessage.mockImplementation(async (...args) => void mailbox.push(args))
  let delivered = false
  relay.getMessages.mockImplementation(async () => {
    if (delivered) return []
    delivered = true
    return mailbox.map(([, kind, ref, sealed], i) => ({
      id: String(i + 1),
      clientId: "client-1",
      kind,
      ref,
      createdAt: "2026-10-18T10:00:00.000Z",
      ...sealed,
    }))
  })
  await asClient()
  await putRecords(getUserKey("body_weight", "client-1"), [
    { id: "w1", sortKey: "2026-10-01", value: JSON.stringify({ id: "w1", weightKg: 80, note: null, recordedAt: "2026-10-01" }) },
    { id: "w2", sortKey: "2026-10-10", value: JSON.stringify({ id: "w2", weightKg: 79.5, note: "fasted", recordedAt: "2026-10-10" }) },
  ])
  mockFiles.set("file:///doc/progress-photos/p1.jpg", "aGVsbG8=")
  await putRecords(getUserKey("progress_photos_muscle", "client-1"), [
    { id: "p1", sortKey: "2026-10-05", value: JSON.stringify({ id: "p1", takenAt: "2026-10-05", uri: "file:///doc/progress-photos/p1.jpg", angle: "front" }) },
  ])
})

async function trainerKey() {
  await asTrainer()
  const key = await getDeviceKey()
  relay.getRecipients.mockResolvedValue([{ trainerId: "trainer-1", keys: [{ keyId: 7, publicKey: key.publicKey, resend: false }] }])
  return key
}

describe("tracking relay", () => {
  it("round-trips a box and refuses the wrong key", async () => {
    const key = await trainerKey()
    const other = await (async () => {
      mockSecrets.clear()
      return getDeviceKey()
    })()
    const sealed = seal(new TextEncoder().encode("hi"), key.publicKey)
    expect(new TextDecoder().decode(open(sealed, key.secretKey)!)).toBe("hi")
    expect(open(sealed, other.secretKey)).toBeNull()
    expect(safetyCode(["b", "a"])).toBe(safetyCode(["a", "b"]))
    expect(safetyCode(["a"])).toMatch(/^[0-9A-F]{4}( [0-9A-F]{4}){7}$/)
  })

  it("sends photos before the snapshot, skips unchanged data, and the trainer reads it", async () => {
    await trainerKey()
    await asClient()
    await shareTracking()
    expect(mailbox.map(([keyId, kind, ref]) => [keyId, kind, ref])).toEqual([
      [7, "photo", "p1"],
      [7, "snapshot", ""],
    ])
    const plain = JSON.stringify(mailbox.map(([, , , s]) => s))
    expect(plain).not.toContain("fasted")
    expect(plain).not.toContain("progress-photos")

    await shareTracking()
    expect(mailbox).toHaveLength(2)

    await asTrainer()
    expect(await syncTrackingInbox()).toEqual(["client-1"])
    expect(relay.ackMessages).toHaveBeenCalledWith(expect.any(String), ["1", "2"])
    expect(relay.requestResend).not.toHaveBeenCalled()
    expect(mockFiles.get("file:///doc/trainer-tracking/trainer-1/client-1/p1.jpg")).toBe("aGVsbG8=")

    const copy = await loadTrackingCopy("client-1")
    expect(copy!.snapshot.records.progress_photos_muscle).toEqual([{ id: "p1", takenAt: "2026-10-05", angle: "front" }])
    await unpackTrackingCopy("client-1", copy!)
    const apis = clientTrackingApis("client-1")
    const weights = async () => (await apis.bodyTrackingApi.getWeightHistory()).entries.map((w) => w.id)
    expect(await weights()).toEqual(["w2", "w1"])
    const { data: photos } = await apis.progressPhotoApi.getPhotoPage(null, 10)
    expect(photos[0].uri).toBe("file:///doc/trainer-tracking/trainer-1/client-1/p1.jpg")
    await expect(apis.bodyTrackingApi.deleteWeightEntry("w1")).rejects.toThrow(READ_ONLY_MESSAGE)
    expect(await weights()).toHaveLength(2)

    await purgeTrackingCopies([])
    expect(await loadTrackingCopy("client-1")).toBeNull()
    expect(await weights()).toEqual([])
    expect([...mockFiles.keys()].some((f) => f.includes("trainer-tracking"))).toBe(false)
  })

  it("sends everything again on a resend request, and asks for one when a photo never arrived", async () => {
    const key = await trainerKey()
    await asClient()
    await shareTracking()
    relay.getRecipients.mockResolvedValue([{ trainerId: "trainer-1", keys: [{ keyId: 7, publicKey: key.publicKey, resend: true }] }])
    await shareTracking()
    expect(mailbox.map(([, kind]) => kind)).toEqual(["photo", "snapshot", "photo", "snapshot"])

    const [, , , photo] = mailbox[0]
    mailbox = [[7, "photo", "../../escape", photo], ...mailbox.slice(1, 2)]
    await asTrainer()
    await syncTrackingInbox()
    expect(relay.requestResend).toHaveBeenCalledWith(expect.any(String), "client-1")
    expect([...mockFiles.keys()].some((f) => f.includes("escape"))).toBe(false)
  })
})
