import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelFooter, PanelHeader } from "@/components/ui/card";
import { ErrorNote } from "@/components/ui/error-note";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { normalizeError } from "@/lib/errors";
import { useT } from "@/lib/i18n";
import type { ServiceRequest, TaskInfo, UserFacingError } from "@/lib/types";
import {
  validateAddress,
  validateListenPort,
  validateRemotePort,
} from "@/lib/validation";
import { validationText } from "./validationText";

type FieldName = "address" | "remotePort" | "localPort";

export interface ServiceFormProps {
  onLaunch: (request: ServiceRequest) => Promise<TaskInfo | null>;
}

export function ServiceForm({ onLaunch }: ServiceFormProps) {
  const t = useT();
  const [address, setAddress] = useState("");
  const [remotePort, setRemotePort] = useState("");
  const [localPort, setLocalPort] = useState("0");
  const [scheme, setScheme] = useState<"http" | "https">("http");
  const [label, setLabel] = useState("");
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [parseError, setParseError] = useState<UserFacingError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function collectErrors(): Partial<Record<FieldName, string>> {
    const next: Partial<Record<FieldName, string>> = {};
    const addressResult = validateAddress(address);
    if (!addressResult.ok) next.address = validationText(t, "address", addressResult);
    const remoteResult = validateRemotePort(remotePort);
    if (!remoteResult.ok) next.remotePort = validationText(t, "port", remoteResult);
    const localResult = validateListenPort(localPort);
    if (!localResult.ok) next.localPort = validationText(t, "port", localResult);
    return next;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = collectErrors();
    setErrors(next);
    if (Object.keys(next).length > 0) return;

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
      kind: "service",
      address: address.trim(),
      remotePort: Number(remotePort),
      localPort: Number(localPort),
      bindHost: "127.0.0.1",
      scheme,
      label: label.trim() || undefined,
    });
    setSubmitting(false);
  }

  return (
    <Panel>
      <PanelHeader
        title={t("forwards.service.form.title")}
        description={t("forwards.service.form.description")}
      />
      <form onSubmit={handleSubmit} noValidate>
        <PanelBody className="flex flex-col gap-3.5">
          <Field
            label={t("forwards.field.address")}
            htmlFor="service-address"
            hint={t("forwards.field.address.hint")}
            error={errors.address}
            required
          >
            <Input
              id="service-address"
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
              label={t("forwards.field.targetPort")}
              htmlFor="service-target-port"
              hint={t("forwards.field.targetPort.hint")}
              error={errors.remotePort}
              required
            >
              <Input
                id="service-target-port"
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
              htmlFor="service-local-port"
              hint={t("forwards.field.localPort.hint")}
              error={errors.localPort}
            >
              <Input
                id="service-local-port"
                mono
                inputMode="numeric"
                invalid={Boolean(errors.localPort)}
                placeholder="0"
                value={localPort}
                onChange={(event) => setLocalPort(event.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label={t("forwards.field.scheme")} htmlFor="service-scheme">
              <Select
                value={scheme}
                onValueChange={(value) => setScheme(value === "https" ? "https" : "http")}
              >
                <SelectTrigger id="service-scheme">
                  <SelectValue>{scheme.toUpperCase()}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="http">HTTP</SelectItem>
                  <SelectItem value="https">HTTPS</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field
              label={t("forwards.field.label")}
              htmlFor="service-label"
              hint={t("forwards.field.label.hint")}
              optional
              optionalLabel={t("common.optional")}
            >
              <Input
                id="service-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
              />
            </Field>
          </div>

          {parseError ? <ErrorNote error={parseError} /> : null}

          <p className="t-caption text-muted-foreground">
            {t("forwards.service.bindNote")}
          </p>
        </PanelBody>
        <PanelFooter>
          <Button type="submit" variant="primary" loading={submitting}>
            {t("forwards.service.submit")}
          </Button>
        </PanelFooter>
      </form>
    </Panel>
  );
}
