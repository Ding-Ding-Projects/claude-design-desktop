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
      onClick: handleActivate,
      onKeyDown: (event: KeyboardEvent) => {
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
};

/** Accessible, keyboard-operable wizard shell. Secret values stay in transient form state. */
export function LockWizard(props: LockWizardProps): React.ReactElement {
  return React.createElement(
    "form",
    { role: "dialog", "aria-labelledby": "lock-wizard-title", onSubmit: (event: SubmitEvent) => { event.preventDefault(); props.onSubmit({}); } },
    React.createElement("h2", { id: "lock-wizard-title" }, `Lock ${props.targetLabel}`),
    React.createElement("p", null, LOCK_DISCLOSURE),
    React.createElement("label", { htmlFor: "lock-policy" }, "Credential policy"),
    React.createElement(
      "select",
      { id: "lock-policy", value: props.policy, onChange: (event: Event) => props.onPolicyChange((event.target as HTMLSelectElement).value as LockPolicy) },
      ...(["PIN", "PASSWORD", "PIN_PASSWORD", "PASSWORD_TOTP", "PIN_TOTP", "PASSWORD_PIN_TOTP"] as LockPolicy[]).map((policy) => React.createElement("option", { key: policy, value: policy }, policy))
    ),
    React.createElement("p", { id: "lock-recovery" }, `Recovery: delete the local application-data folder ${props.recoveryDirectory} if this toy lock leaves you out.`),
    React.createElement("button", { type: "submit" }, "Create lock"),
    React.createElement("button", { type: "button", onClick: props.onCancel }, "Cancel")
  );
}
