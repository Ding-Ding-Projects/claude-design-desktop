import net from "node:net";
import { encodeNativeFrame, NativeFrameDecoder } from "./native-messaging-codec.js";
import { readProtectedProductPipeDescriptor, type ProductPipeDescriptor } from "./product-named-pipe-bridge.js";
import { WindowsNativeDownloadHost, type WindowsNativeHostOptions } from "./windows-native-host.js";
import { challengeNonce, equalMac, PIPE_AUTH_EXPIRY_MS, proofMac, requestDigest } from "./pipe-auth.js";

export type ProductMainListenerOptions = {
  descriptorPath: string;
  currentUserSid: string;
  hostOptions: WindowsNativeHostOptions;
  readVaultCapability: (accountKey: string) => Promise<string>;
  verifyCurrentUserAcl: (pipeName: string, currentUserSid: string) => Promise<boolean>;
};

export class ProductMainDownloadListener {
  private server?: any;
  private descriptor?: ProductPipeDescriptor;
  private host?: WindowsNativeDownloadHost;
  private readonly usedNonces = new Map<string, number>();

  constructor(private readonly options: ProductMainListenerOptions) {}

  async start(): Promise<void> {
    this.descriptor = await readProtectedProductPipeDescriptor(this.options.descriptorPath, this.options.currentUserSid);
    if (!(await this.options.verifyCurrentUserAcl(this.descriptor.pipeName, this.descriptor.currentUserSid))) throw new Error("Named pipe ACL is not restricted to the current user");
    this.host = new WindowsNativeDownloadHost(this.options.hostOptions);
    const host = this.host;
    const descriptor = this.descriptor;
    this.server = net.createServer((socket: any) => {
      const decoder = new NativeFrameDecoder();
      let phase: "hello" | "proof" | "request" = "hello";
      let serverNonce = "";
      let digest = "";
      let expiresAt = 0;
      socket.on("data", (chunk: any) => { try { for (const raw of decoder.push(chunk)) {
        const value = JSON.parse(raw) as Record<string, any>;
        if (phase === "hello") {
          if (value.type !== "hello" || value.protocolVersion !== 1 || value.role !== "native-host-client" || typeof value.requestDigest !== "string" || value.requestDigest.length !== 64) throw new Error("Invalid pipe hello");
          this.expireNonces();
          serverNonce = challengeNonce();
          if (this.usedNonces.has(serverNonce)) throw new Error("Duplicate pipe nonce");
          digest = value.requestDigest;
          expiresAt = Date.now() + PIPE_AUTH_EXPIRY_MS;
          phase = "proof";
          socket.write(Buffer.from(encodeNativeFrame(JSON.stringify({ type: "challenge", protocolVersion: 1, role: "product-main", nonce: serverNonce, requestDigest: digest, expiresAt }))));
        } else if (phase === "proof") {
          if (Date.now() > expiresAt || value.type !== "proof" || value.protocolVersion !== 1 || value.role !== "native-host-client" || value.nonce !== serverNonce || value.requestDigest !== digest || typeof value.mac !== "string") throw new Error("Invalid or expired pipe proof");
          void this.options.readVaultCapability(descriptor.vaultAccountKey).then((capability) => { if (!equalMac(value.mac, proofMac(capability, serverNonce, "native-host-client", 1, digest))) throw new Error("Pipe proof did not match the OS-vault capability"); this.usedNonces.set(serverNonce, expiresAt); phase = "request"; socket.write(Buffer.from(encodeNativeFrame(JSON.stringify({ type: "authenticated", protocolVersion: 1, requestDigest: digest })))); }).catch(() => socket.destroy());
        } else {
          if (value.channel !== "download-companion" || value.type !== "native-request" || value.vaultAccountKey !== descriptor.vaultAccountKey || typeof value.payload !== "string" || requestDigest(value.payload) !== digest) throw new Error("Unauthenticated or duplicate native request");
          void host.handle(value.payload).then((response) => socket.end(Buffer.from(encodeNativeFrame(JSON.stringify(response))))).catch(() => socket.destroy());
          phase = "request";
        }
      } } catch { socket.destroy(); } });
    });
    await new Promise<void>((resolve, reject) => { this.server?.once("error", reject); this.server?.listen(descriptor.pipeName, resolve); });
  }

  async stop(): Promise<void> { await new Promise<void>((resolve) => this.server?.close(() => resolve()) || resolve()); }

  private expireNonces(): void { const now = Date.now(); for (const [nonce, expiry] of this.usedNonces) if (expiry <= now) this.usedNonces.delete(nonce); }
}

function isRecord(value: unknown): value is Record<string, any> { return typeof value === "object" && value !== null && !Array.isArray(value); }
