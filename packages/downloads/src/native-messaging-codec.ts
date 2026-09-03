/**
 * Chrome native messaging uses a four-byte native-endian length prefix followed
 * by one UTF-8 JSON message. Windows is little-endian, so the native adapter
 * uses UInt32LE consistently and never treats the stream as an unframed text stream.
 */

export const NATIVE_FRAME_HEADER_BYTES = 4;
export const MAX_NATIVE_MESSAGE_BYTES = 64 * 1024;

export function encodeNativeFrame(message: string): Uint8Array {
  const payload = new TextEncoder().encode(message);
  if (payload.byteLength > MAX_NATIVE_MESSAGE_BYTES) throw new RangeError("Native message exceeds the bounded frame size");
  const frame = new Uint8Array(NATIVE_FRAME_HEADER_BYTES + payload.byteLength);
  new DataView(frame.buffer).setUint32(0, payload.byteLength, true);
  frame.set(payload, NATIVE_FRAME_HEADER_BYTES);
  return frame;
}

export class NativeFrameDecoder {
  private pending = new Uint8Array(0);

  push(chunk: Uint8Array): string[] {
    if (!(chunk instanceof Uint8Array) || chunk.byteLength === 0) return [];
    const messages: string[] = [];
    let offset = 0;
    while (offset < chunk.byteLength) {
      if (this.pending.byteLength === 0) {
        this.pending = chunk.slice(offset);
        offset = chunk.byteLength;
      } else {
        const needed = this.pending.byteLength < NATIVE_FRAME_HEADER_BYTES
          ? NATIVE_FRAME_HEADER_BYTES - this.pending.byteLength
          : NATIVE_FRAME_HEADER_BYTES + new DataView(this.pending.buffer, this.pending.byteOffset, this.pending.byteLength).getUint32(0, true) - this.pending.byteLength;
        if (needed < 0 || needed > MAX_NATIVE_MESSAGE_BYTES + NATIVE_FRAME_HEADER_BYTES) throw new RangeError("Native message exceeds the bounded frame size");
        const take = Math.min(needed, chunk.byteLength - offset);
        const combined = new Uint8Array(this.pending.byteLength + take);
        combined.set(this.pending);
        combined.set(chunk.slice(offset, offset + take), this.pending.byteLength);
        this.pending = combined;
        offset += take;
      }
      while (this.pending.byteLength >= NATIVE_FRAME_HEADER_BYTES) {
        const length = new DataView(this.pending.buffer, this.pending.byteOffset, this.pending.byteLength).getUint32(0, true);
        if (length > MAX_NATIVE_MESSAGE_BYTES) throw new RangeError("Native message exceeds the bounded frame size");
        const frameBytes = NATIVE_FRAME_HEADER_BYTES + length;
        if (this.pending.byteLength < frameBytes) break;
        const payload = this.pending.slice(NATIVE_FRAME_HEADER_BYTES, frameBytes);
        messages.push(new TextDecoder("utf-8", { fatal: true }).decode(payload));
        this.pending = this.pending.slice(frameBytes);
      }
    }
    return messages;
  }

  assertComplete(): void {
    if (this.pending.byteLength !== 0) throw new Error("Native stream ended with an incomplete frame");
  }
}
