import type { DownloadRecord } from "./download-state-machine.js";
import type { ProgressWindowController, ProgressWindowOptions } from "./windows-native-host.js";

export type ProductDownloadUiTransport = {
  send(message: ProductDownloadUiMessage): Promise<void>;
};

export type ProductDownloadUiMessage =
  | { channel: "download-companion"; type: "start-dialog"; record: DownloadRecord; preflight: { destinationPath: string; collision: boolean; freeBytes: number; minimumFreeBytes: number } }
  | { channel: "download-companion"; type: "progress-window-open"; options: ProgressWindowOptions }
  | { channel: "download-companion"; type: "progress-window-update"; record: DownloadRecord }
  | { channel: "download-companion"; type: "progress-window-close"; downloadId: string }
  | { channel: "download-companion"; type: "notification"; title: string; message: string };

export type ProductDownloadConfirmMessage = {
  channel: "download-companion";
  type: "confirm-download";
  requestId: string;
  proposalId: string;
  confirmation: { keyOne: true; keyTwo: true; slider: 1 };
};

export function createProductDownloadUiBridge(transport: ProductDownloadUiTransport): {
  openStartDialog(record: DownloadRecord, preflight: { destinationPath: string; collision: boolean; freeBytes: number; minimumFreeBytes: number }): Promise<void>;
  progressWindow: ProgressWindowController;
  notify(title: string, message: string): Promise<void>;
} {
  return {
    openStartDialog: (record, preflight) => transport.send({ channel: "download-companion", type: "start-dialog", record, preflight }),
    progressWindow: {
      open: (options) => transport.send({ channel: "download-companion", type: "progress-window-open", options }),
      update: (record) => transport.send({ channel: "download-companion", type: "progress-window-update", record }),
      close: (downloadId) => transport.send({ channel: "download-companion", type: "progress-window-close", downloadId })
    },
    notify: (title, message) => transport.send({ channel: "download-companion", type: "notification", title, message })
  };
}
