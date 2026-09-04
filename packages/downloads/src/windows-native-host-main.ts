import { createNativeHostProductClient, readProtectedProductPipeDescriptor } from "./product-named-pipe-bridge.js";
import { runWindowsNativeHostClient } from "./windows-native-host.js";
import { readWindowsVaultCapability } from "./windows-vault-adapter.js";

const descriptorPath = process.env.CLAUDE_DESIGN_DOWNLOAD_PIPE_DESCRIPTOR;
const currentUserSid = process.env.CLAUDE_DESIGN_CURRENT_USER_SID;
if (!descriptorPath || !currentUserSid) throw new Error("The protected product pipe descriptor is unavailable");
const descriptor = await readProtectedProductPipeDescriptor(descriptorPath, currentUserSid);
const client = createNativeHostProductClient(descriptor, readWindowsVaultCapability);
void runWindowsNativeHostClient(client).catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : "Native host stopped"}\n`); process.exitCode = 1; });
