type PermissionCallback = (allowed: boolean) => void;

export type SessionSecurityTarget = {
  setPermissionRequestHandler(handler: (webContents: unknown, permission: string, callback: PermissionCallback) => void): void;
  setPermissionCheckHandler(handler: () => boolean): void;
};

/** Install renderer security policy only after Electron's session is ready. */
export function configureSessionSecurity(target: SessionSecurityTarget) {
  target.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  target.setPermissionCheckHandler(() => false);
}
