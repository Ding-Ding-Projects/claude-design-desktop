# Native host registration templates

The templates are intentionally uninstalled examples. A packaging step replaces `{{INSTALL_DIR}}` with the user-selected absolute install folder and `{{EXTENSION_ID}}` with the extension id after validating both values. No credential, host address, or machine-specific path is stored in this source tree.

The host communicates with newline-delimited JSON using `protocol.schema.json`. The host must reject unknown fields, malformed JSON, embedded URL credentials, oversized messages, unsafe destination segments, and any message whose `protocolVersion` is not `1`. Progress is presented in a separate always-on-top native progress window. The browser-only extension remains usable when the native host is unavailable.
