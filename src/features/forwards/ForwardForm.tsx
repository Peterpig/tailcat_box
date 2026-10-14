import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Panel, PanelBody, PanelFooter, PanelHeader } from "@/components/ui/card";
import { ErrorNote } from "@/components/ui/error-note";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { normalizeError } from "@/lib/errors";
import { useT } from "@/lib/i18n";
import type { ForwardRequest, TaskInfo, UserFacingError } from "@/lib/types";
import {
  isLoopbackHost,
  validateAddress,
  validateBindHost,
  validateListenPort,
  validateRemotePort,
} from "@/lib/validation";
import { validationText } from "./validationText";

type FieldName = "address" | "remotePort" | "localPort" | "bindHost";

export interface ForwardFormProps {
  /** Mirrors `settings.allowNonLoopbackBind`; the only way to unlock exposure. */
  allowNonLoopbackBind: boolean;
  onOpenSettings: () => void;
  onLaunch: (request: ForwardRequest) => Promise<TaskInfo | null>;
}

export function ForwardForm({
  allowNonLoopbackBind,
  onOpenSettings,
  onLaunch,
}: ForwardFormProps) {
  const t = useT();
  const [address, setAddress] = useState("");
  const [remotePort, setRemotePort] = useState("");
  const [localPort, setLocalPort] = useState("0");
  const [bindHost, setBindHost] = useState("127.0.0.1");
  const [label, setLabel] = useState("");
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [parseError, setParseError] = useState<UserFacingError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const trimmedBindHost = bindHost.trim();
  // An empty field is "not filled in yet", not an exposure decision.
  const exposureRisk = trimmedBindHost.length > 0 && !isLoopbackHost(trimmedBindHost);
  const exposureBlocked = exposureRisk && !allowNonLoopbackBind;

  function collectErrors(): Partial<Record<FieldName, string>> {
    const next: Partial<Record<FieldName, string>> = {};
    const addressResult = validateAddress(address);
    if (!addressResult.ok) next.address = validationText(t, "address", addressResult);
    const remoteResult = validateRemotePort(remotePort);
    if (!remoteResult.ok) next.remotePort = validationText(t, "port", remoteResult);
    const localResult = validateListenPort(localPort);
    if (!localResult.ok) next.localPort = validationText(t, "port", localResult);
    const bindResult = validateBindHost(bindHost);
    if (!bindResult.ok) next.bindHost = validationText(t, "host", bindResult);
    return next;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = collectErrors();
    setErrors(next);
    if (Object.keys(next).length > 0 || exposureBlocked) return;

    setSubmitting(true);
    setParseError(null);
    try {
      // `tailcat parse` is the authoritative check for a connection token.
      await api.engineParse(address.trim());
    } catch (error) {
      setParseError(normalizeError(error));
      setSubmitting(false);
      return;
    }

    await onLaunch({
      kind: "forward",
      address: address.trim(),
      remotePort: Number(remotePort),
      localPort: Number(localPort),
      bindHost: trimmedBindHost,
      label: label.trim() || undefined,
    });
    setSubmitting(false);
  }

  return (
    <Panel>
      <PanelHeader
        title={t("forwards.forward.form.title")}
        description={t("forwards.forward.form.description")}
      />
      <form onSubmit={handleSubmit} noValidate>
        <PanelBody className="flex flex-col gap-3.5">
          <Field
            label={t("forwards.field.address")}
            htmlFor="forward-address"
            hint={t("forwards.field.address.hint")}
            error={errors.address}
            required
          >
            <Input
              id="forward-address"
              mono
              autoComplete="off"
              spellCheck={false}
              invalid={Boolean(errors.address)}
              placeholder="tc… / peer.example.com"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
          </Field>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field
              label={t("forwards.field.remotePort")}
              htmlFor="forward-remote-port"
              hint={t("forwards.field.remotePort.hint")}
              error={errors.remotePort}
              required
            >
              <Input
                id="forward-remote-port"
                mono
                inputMode="numeric"
                invalid={Boolean(errors.remotePort)}
                placeholder="8080"
                value={remotePort}
                onChange={(event) => setRemotePort(event.target.value)}
              />
            </Field>
            <Field
              label={t("forwards.field.localPort")}
              htmlFor="forward-local-port"
              hint={t("forwards.field.localPort.hint")}
              error={errors.localPort}
            >
              <Input
                id="forward-local-port"
                mono
                inputMode="numeric"
                invalid={Boolean(errors.localPort)}
                placeholder="0"
                value={localPort}
                onChange={(event) => setLocalPort(event.target.value)}
              />
            </Field>
          </div>

          <Field
            label={t("forwards.field.bindHost")}
            htmlFor="forward-bind-host"
            hint={t("forwards.field.bindHost.hint")}
            error={errors.bindHost}
          >
            <Input
              id="forward-bind-host"
              mono
              invalid={Boolean(errors.bindHost)}
              value={bindHost}
              onChange={(event) => setBindHost(event.target.value)}
            />
          </Field>

          <Field
            label={t("forwards.field.label")}
            htmlFor="forward-label"
            hint={t("forwards.field.label.hint")}
            optional
            optionalLabel={t("common.optional")}
          >
            <Input
              id="forward-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </Field>

          {exposureRisk ? (
            <Callout
              tone="risk"
              title={t("forwards.risk.title")}
              actions={
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={onOpenSettings}
                >
                  {t("forwards.risk.openSettings")}
                </Button>
              }
            >
              <p>{t("forwards.risk.body")}</p>
              {exposureBlocked ? <p className="mt-1">{t("forwards.risk.blocked")}</p> : null}
            </Callout>
          ) : null}

          {parseError ? <ErrorNote error={parseError} /> : null}

          <p className="t-caption text-muted-foreground">{t("forwards.forward.note")}</p>
        </PanelBody>
        <PanelFooter>
          <Button
            type="submit"
            variant="primary"
            loading={submitting}
            disabled={exposureBlocked}
          >
            {t("forwards.forward.submit")}
          </Button>
        </PanelFooter>
      </form>
    </Panel>
  );
}
