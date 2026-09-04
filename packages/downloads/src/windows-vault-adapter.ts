/**
 * The native host must obtain this capability from the Windows credential vault
 * through the packaged privileged adapter. It is intentionally fail-closed in
 * the standalone protocol package until the product supplies that adapter.
 */
export type WindowsVaultCapabilityAdapter = (accountKey: string) => Promise<string>;

export async function readWindowsVaultCapability(_accountKey: string): Promise<string> {
  throw new Error("The packaged Windows credential-vault adapter is unavailable");
}
