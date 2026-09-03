import * as React from "react";
import type { LockPolicy } from "./types";
import { LOCK_DISCLOSURE } from "./locks";

export type LockableProps = {
  elementId: string;
  locked: boolean;
  label: string;
  children?: React.ReactNode;
  onActivate: () => void;
  onUnlockRequest: () => void;
};

/** Operable wrapper used when a native disabled control cannot receive unlock events. */
export function LockableElement(props: LockableProps): React.ReactElement {
  const handleActivate = (): void => {
    if (props.locked) props.onUnlockRequest();
    else props.onActivate();
  };
  return React.createElement(
    "div",
    {
      id: props.elementId,
      role: "button",
      tabIndex: 0,
      "aria-label": props.label,
      "aria-disabled": props.locked,
      "data-locked": props.locked ? "true" : "false",
      onClickCapture: (event: MouseEvent) => { event.stopPropagation(); event.preventDefault(); handleActivate(); },
      onPointerDownCapture: (event: PointerEvent) => { event.stopPropagation(); event.preventDefault(); },
      onTouchStartCapture: (event: TouchEvent) => { event.stopPropagation(); event.preventDefault(); },
      onKeyDownCapture: (event: KeyboardEvent) => {
        event.stopPropagation();
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleActivate();
        }
      }
    },
    props.children
  );
}

export type LockWizardProps = {
  targetLabel: string;
  recoveryDirectory: string;
  policy: LockPolicy;
  onPolicyChange: (policy: LockPolicy) => void;
  onSubmit: (credentials: { pin?: string; password?: string; totpSecret?: string }) => void;
  onCancel: () => void;
  originElement?: { focus: () => void };
};

/** Accessible, keyboard-operable wizard shell. Secret values stay in transient form state. */
export function LockWizard(props: LockWizardProps): React.ReactElement {
  const [credentials, setCredentials] = React.useState<Record<string, string>>({});
  const update = (factor: string, value: string): void => setCredentials((current) => ({ ...current, [factor]: value }));
  const submit = (event: SubmitEvent): void => {
    event.preventDefault();
    props.onSubmit({ pin: credentials.pin, password: credentials.password, totpSecret: credentials.totp });
  };
  const cancel = (): void => { props.onCancel(); props.originElement?.focus(); };
  const policyFactors: Record<LockPolicy, string[]> = {
    PIN: ["pin"], PASSWORD: ["password"], PIN_PASSWORD: ["pin", "password"],
    PASSWORD_TOTP: ["password", "totp"], PIN_TOTP: ["pin", "totp"], PASSWORD_PIN_TOTP: ["password", "pin", "totp"]
  };
  const fields = policyFactors[props.policy].map((factor) => React.createElement(
    "div",
    { key: factor },
    React.createElement("label", { htmlFor: `lock-${factor}` }, factor === "totp" ? "One-time code" : factor),
    React.createElement("input", { id: `lock-${factor}`, name: factor, type: factor === "totp" ? "text" : "password", inputMode: factor === "pin" || factor === "totp" ? "numeric" : "text", autoComplete: "off", onInput: (event: Event) => update(factor, (event.target as HTMLInputElement).value) }),
    factor === "pin" ? React.createElement("div", { role: "group", "aria-label": "PIN keypad" }, ...["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "Backspace", "Clear"].map((key) => React.createElement("button", { type: "button", key, onClick: () => update("pin", key === "Clear" ? "" : key === "Backspace" ? (credentials.pin ?? "").slice(0, -1) : `${credentials.pin ?? ""}${key}`) }, key))) : null
  ));
  return React.createElement(
    "form",
    { role: "dialog", "aria-labelledby": "lock-wizard-title", onSubmit: submit, onKeyDown: (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); cancel(); } } },
    React.createElement("h2", { id: "lock-wizard-title" }, `Lock ${props.targetLabel}`),
    React.createElement("p", null, LOCK_DISCLOSURE),
    React.createElement("label", { htmlFor: "lock-policy" }, "Credential policy"),
    React.createElement(
      "select",
      { id: "lock-policy", value: props.policy, onChange: (event: Event) => props.onPolicyChange((event.target as HTMLSelectElement).value as LockPolicy) },
      ...(["PIN", "PASSWORD", "PIN_PASSWORD", "PASSWORD_TOTP", "PIN_TOTP", "PASSWORD_PIN_TOTP"] as LockPolicy[]).map((policy) => React.createElement("option", { key: policy, value: policy }, policy))
    ),
    ...fields,
    React.createElement("p", { id: "lock-recovery" }, `Recovery: delete the local application-data folder ${props.recoveryDirectory} if this toy lock leaves you out.`),
    React.createElement("button", { type: "submit" }, "Create lock"),
    React.createElement("button", { type: "button", onClick: cancel }, "Cancel")
  );
}
