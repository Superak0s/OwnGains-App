declare module "react-native-zeroconf" {
  export interface ZeroconfService {
    name: string
    host: string
    port: number
    addresses: string[]
    txt?: Record<string, string>
  }

  export default class Zeroconf {
    on(event: "start" | "stop" | "update", listener: () => void): this
    on(event: "error", listener: (err: Error) => void): this
    on(event: "resolved" | "found", listener: (service: ZeroconfService) => void): this
    removeAllListeners(): void
    scan(type?: string, protocol?: string, domain?: string): void
    stop(): void
  }
}
