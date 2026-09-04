import { readFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { encodeNativeFrame, NativeFrameDecoder } from "./native-messaging-codec.js";
import { challengeNonce, proofMac, requestDigest } from "./pipe-auth.js";

export type ProductPipeDescriptor = { version: 1; pipeName: string; currentUserSid: string; acl: { scope: "current-user"; denyEveryone: true }; vaultAccountKey: string };
export type NativeHostProductClient = { request(raw: string): Promise<string> };

export async function readProtectedProductPipeDescriptor(descriptorPath: string, currentUserSid: string): Promise<ProductPipeDescriptor> {
  const parsed: unknown = JSON.parse(await readFile(path.resolve(descriptorPath), "utf8"));
  if (!isRecord(parsed) || parsed.version !== 1 || parsed.currentUserSid !== currentUserSid || !isRecord(parsed.acl) || parsed.acl.scope !== "current-user" || parsed.acl.denyEveryone !== true || typeof parsed.vaultAccountKey !== "string" || !/^\\\\\.\\pipe\\ClaudeDesignDownload-[A-Za-z0-9._-]{1,96}$/u.test(String(parsed.pipeName))) throw new Error("Invalid protected product pipe descriptor");
  return parsed as ProductPipeDescriptor;
}

export function createNativeHostProductClient(descriptor: ProductPipeDescriptor, readCapability: (accountKey: string) => Promise<string>): NativeHostProductClient {
  return {
    request(raw) {
      if (typeof raw !== "string" || new TextEncoder().encode(raw).byteLength > 64 * 1024) return Promise.reject(new Error("Native request exceeds its bound"));
      const clientNonce = challengeNonce();
      const digest = requestDigest(raw);
      return new Promise((resolve, reject) => {
        const socket = net.createConnection(descriptor.pipeName);
        const decoder = new NativeFrameDecoder();
        let phase: "challenge" | "ack" | "response" = "challenge";
        socket.once("error", reject);
        socket.on("data", (chunk: any) => { for (const response of decoder.push(chunk)) { try {
          const value = JSON.parse(response) as Record<string, any>;
          if (phase === "challenge") {
            if (value.type !== "challenge" || typeof value.nonce !== "string" || value.requestDigest !== digest || value.expiresAt < Date.now()) throw new Error("Invalid pipe challenge");
            const serverNonce = value.nonce;
            void readCapability(descriptor.vaultAccountKey).then((capability) => { socket.write(Buffer.from(encodeNativeFrame(JSON.stringify({ type: "proof", protocolVersion: 1, role: "native-host-client", nonce: serverNonce, requestDigest: digest, mac: proofMac(capability, serverNonce, "native-host-client", 1, digest) })))); phase = "ack"; }).catch(reject);
          } else if (phase === "ack") {
            if (value.type !== "authenticated" || value.requestDigest !== digest) throw new Error("Native authentication was not accepted");
            socket.end(Buffer.from(encodeNativeFrame(JSON.stringify({ channel: "download-companion", type: "native-request", vaultAccountKey: descriptor.vaultAccountKey, payload: raw })))); phase = "response";
          } else { socket.end(); resolve(response); }
        } catch (error) { socket.destroy(); reject(error); return; } } });
        socket.once("connect", () => socket.write(Buffer.from(encodeNativeFrame(JSON.stringify({ type: "hello", protocolVersion: 1, role: "native-host-client", nonce: clientNonce, requestDigest: digest })))));
      });
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
