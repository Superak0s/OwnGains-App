import { Platform } from "react-native"
import Zeroconf from "react-native-zeroconf"
import { isPrivateHost } from "./config"
import { log, metric } from "./crashReporting"

const SCAN_TIMEOUT_MS = 4000
const LOG_PREFIX = "[lanDiscovery]"

// Every field below arrives from a multicast advertisement any device on the
// network can publish, so it is untrusted input. A `fqdn` that is not a bare
// hostname could smuggle userinfo, a port, a path or a second host into the
// URL the caller builds from it (`https://${fqdn}`).
const HOSTNAME_LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?"
const HOSTNAME_PATTERN = new RegExp(
  `^${HOSTNAME_LABEL}(?:[.]${HOSTNAME_LABEL})*[.]?$`,
  "i",
)
const MAX_FQDN_LENGTH = 253

export const safeFqdn = (value: string | undefined | null): string | null => {
  if (typeof value !== "string") return null
  const length = value.endsWith(".") ? value.length - 1 : value.length
  return length <= MAX_FQDN_LENGTH && HOSTNAME_PATTERN.test(value) ? value : null
}

export const safePort = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 65535
    ? value
    : null

type LanServer = {
  ip: string
  port: number
  fqdn: string | null
}

type ZeroconfService = {
  name: string
  host: string
  port: number
  addresses: string[]
  txt?: Record<string, string>
}

// Android emulators don't support multicast, so scanning there will always
// time out with zero results. That's expected, not a bug.
export const scanForLanServer = (): Promise<LanServer | null> => {
  console.log(`${LOG_PREFIX} starting scan for _owngains._tcp on ${Platform.OS}`)
  return new Promise((resolve) => {
    // Constructed inside the executor so a missing native module (Expo Go)
    // rejects the promise instead of throwing at the call site.
    const zeroconf = new Zeroconf()
    let settled = false
    const started = Date.now()
    const finish = (result: LanServer | null) => {
      if (settled) return
      settled = true
      metric.distribution("lan.scan.duration", Date.now() - started, {
        unit: "millisecond",
        attributes: { outcome: result ? "found" : "not_found" },
      })
      clearTimeout(timer)
      zeroconf.stop()
      zeroconf.removeAllListeners()
      resolve(result)
    }

    const reject = (reason: string) => {
      console.log(`${LOG_PREFIX} ignoring advertisement: ${reason}`)
      log.warn("lan.advertisement_rejected", { reason })
    }

    zeroconf.on("start", () => console.log(`${LOG_PREFIX} scan started`))
    zeroconf.on("error", (err: Error) => {
      console.log(`${LOG_PREFIX} error:`, err?.message ?? err)
      log.warn("lan.scan_error", { reason: err?.message ?? "unknown" })
    })
    zeroconf.on("resolved", (service: ZeroconfService) => {
      console.log(`${LOG_PREFIX} resolved a service`)
      const ip = service.addresses?.find((addr) => addr.includes("."))
      if (!ip) return reject("no_ipv4_address")
      // A LAN advertisement pointing at a public address is either broken or
      // an attempt to redirect the client off-network.
      if (!isPrivateHost(ip)) return reject("non_private_address")
      const port = safePort(service.port)
      if (port === null) return reject("invalid_port")
      finish({ ip, port, fqdn: safeFqdn(service.txt?.fqdn) })
    })

    // Armed only once the scan is actually running: a throw from scan() would
    // otherwise leave the timer and listeners alive on a dead instance.
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      zeroconf.scan("owngains", "tcp", "local.")
    } catch (error) {
      console.log(`${LOG_PREFIX} scan failed to start:`, error)
      log.warn("lan.scan_error", { reason: (error as Error)?.message ?? "scan_failed" })
      finish(null)
      return
    }
    timer = setTimeout(() => {
      console.log(`${LOG_PREFIX} scan timed out after ${SCAN_TIMEOUT_MS}ms, no server found`)
      finish(null)
    }, SCAN_TIMEOUT_MS)
  })
}
