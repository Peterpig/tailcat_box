import { useCallback, useEffect, useState } from "react";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { normalizeError } from "@/lib/errors";
import { useT } from "@/lib/i18n";
import { validateKeyName } from "@/lib/validation";
import { useAppStore } from "@/store/app";
import type { KeyCreateResult, SavedKey, UserFacingError } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorNote } from "@/components/ui/error-note";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/components/ui/copy-button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import "./messages";

const AUTO_REGION = "auto";

/**
 * Server and client key management.
 *
 * The CLI writes keys into `$CONFIG/tailcat/keys`; this panel only ever lists,
 * creates and deletes them through `api.engine*`, never touching the filesystem
 * itself.
 */
export function KeyManager() {
  const t = useT();
  const engine = useAppStore((state) => state.engine);
  const pushToast = useAppStore((state) => state.pushToast);

  const [keys, setKeys] = useState<SavedKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<UserFacingError | null>(null);
  const [actionError, setActionError] = useState<UserFacingError | null>(null);
  const [regions, setRegions] = useState<string[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<KeyCreateResult | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SavedKey | null>(null);

  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [client, setClient] = useState(false);
  const [region, setRegion] = useState<string>(AUTO_REGION);
  const [fixedRegion, setFixedRegion] = useState(false);
  const [embedDerpMap, setEmbedDerpMap] = useState(false);
  const [force, setForce] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setKeys(await api.engineKeys());
    } catch (error) {
      setLoadError(normalizeError(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Regions are only needed for the create form; a failure just leaves the
  // "automatic" option available.
  useEffect(() => {
    let cancelled = false;
    api
      .engineRegions()
      .then((list) => {
        if (!cancelled) setRegions(list);
      })
      .catch(() => {
        /* the manual region field is optional */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function resetForm() {
    setName("");
    setNameError(null);
    setClient(false);
    setRegion(AUTO_REGION);
    setFixedRegion(false);
    setEmbedDerpMap(false);
    setForce(false);
  }

  async function handleCreate() {
    setActionError(null);
    const validation = validateKeyName(name);
    if (!validation.ok) {
      setNameError(validation.message ?? t("engine.keys.create.nameRequired"));
      return;
    }
    setNameError(null);
    setSubmitting(true);
    try {
      const result = await api.engineCreateKey({
        name: name.trim(),
        client,
        region: client || region === AUTO_REGION ? null : region,
        fixedRegion,
        embedDerpMap,
        force,
      });
      setCreateOpen(false);
      resetForm();
      setCreated(result);
      await reload();
      pushToast({ tone: "success", title: t("engine.keys.created") });
    } catch (error) {
      setActionError(normalizeError(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setSubmitting(true);
    setActionError(null);
    try {
      await api.engineDeleteKey(target.name);
      setPendingDelete(null);
      await reload();
      pushToast({
        tone: "success",
        title: t("engine.keys.deleted", { name: target.name }),
      });
    } catch (error) {
      setPendingDelete(null);
      setActionError(normalizeError(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Panel>
      <PanelHeader
        title={t("engine.keys.title")}
        description={t("engine.keys.description")}
        actions={
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setActionError(null);
              resetForm();
              setCreateOpen(true);
            }}
          >
            <Plus aria-hidden />
            {t("engine.keys.new")}
          </Button>
        }
      />
      <PanelBody className="flex flex-col gap-3">
        <Callout tone="info" title={t("engine.keys.defaultMagic.title")}>
          {t("engine.keys.defaultMagic.body")}
        </Callout>

        {engine?.keysDir ? (
          <p className="t-caption text-muted-foreground">
            {t("engine.keys.dir")}：<span className="t-mono">{engine.keysDir}</span>
          </p>
        ) : null}

        {actionError ? <ErrorNote error={actionError} /> : null}

        {loading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : loadError ? (
          <ErrorNote error={loadError} />
        ) : keys.length === 0 ? (
          <EmptyState
            icon={<KeyRound aria-hidden />}
            title={t("engine.keys.empty")}
            description={t("engine.keys.emptyHint")}
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {keys.map((key) => (
              <li
                key={key.name}
                className="flex items-center gap-2 px-3 py-2"
              >
                <span className="t-mono min-w-0 flex-1 truncate text-foreground">
                  {key.name}
                </span>
                <Badge tone={key.client ? "info" : "neutral"}>
                  {key.client
                    ? t("engine.keys.badge.client")
                    : t("engine.keys.badge.server")}
                </Badge>
                {key.isDefault ? (
                  <Badge tone="warning">{t("engine.keys.badge.default")}</Badge>
                ) : null}
                <Button
                  variant="dangerGhost"
                  size="icon-sm"
                  aria-label={`${t("engine.keys.delete")} ${key.name}`}
                  onClick={() => setPendingDelete(key)}
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </PanelBody>

      {/* --- create dialog ------------------------------------------------ */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent size="md">
          <DialogHeader
            title={t("engine.keys.create.title")}
            description={t("engine.keys.create.description")}
          />
          <DialogBody className="flex flex-col gap-4">
            <Field
              label={t("engine.keys.create.name")}
              htmlFor="key-name"
              required
              error={nameError}
            >
              <Input
                id="key-name"
                mono
                value={name}
                invalid={Boolean(nameError)}
                placeholder={t("engine.keys.create.namePlaceholder")}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>

            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <Label htmlFor="key-client">
                  {t("engine.keys.create.client")}
                </Label>
                <p className="field-hint mt-0.5">
                  {t("engine.keys.create.clientHint")}
                </p>
              </div>
              <Switch
                id="key-client"
                checked={client}
                onCheckedChange={setClient}
              />
            </div>

            {client ? null : (
              <>
                <Field label={t("engine.keys.create.region")}>
                  <Select value={region} onValueChange={setRegion}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={AUTO_REGION}>
                        {t("engine.keys.create.regionAuto")}
                      </SelectItem>
                      {regions.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <SwitchRow
                  id="key-fixed-region"
                  label={t("engine.keys.create.fixedRegion")}
                  checked={fixedRegion}
                  onChange={setFixedRegion}
                />
                <SwitchRow
                  id="key-embed-derp"
                  label={t("engine.keys.create.embedDerpMap")}
                  checked={embedDerpMap}
                  onChange={setEmbedDerpMap}
                />
              </>
            )}

            <SwitchRow
              id="key-force"
              label={t("engine.keys.create.force")}
              checked={force}
              onChange={setForce}
            />

            {actionError ? <ErrorNote error={actionError} /> : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button loading={submitting} onClick={() => void handleCreate()}>
              {t("engine.keys.create.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- created key result ------------------------------------------- */}
      <Dialog
        open={created !== null}
        onOpenChange={(open) => {
          if (!open) setCreated(null);
        }}
      >
        <DialogContent size="md">
          <DialogHeader title={t("engine.keys.created")} />
          <DialogBody className="flex flex-col gap-3">
            {created?.address ? (
              <Field label={t("engine.keys.result.server")}>
                <div className="flex items-center gap-2">
                  <span className="t-mono min-w-0 flex-1 break-all rounded-md border border-border bg-[color:var(--surface-inset)] px-2 py-1.5">
                    {created.address}
                  </span>
                  <CopyButton value={created.address} size="icon" aria-label={t("common.copy")} />
                </div>
              </Field>
            ) : null}
            {created?.publicKey ? (
              <Field label={t("engine.keys.result.client")}>
                <div className="flex items-center gap-2">
                  <span className="t-mono min-w-0 flex-1 break-all rounded-md border border-border bg-[color:var(--surface-inset)] px-2 py-1.5">
                    {created.publicKey}
                  </span>
                  <CopyButton value={created.publicKey} size="icon" aria-label={t("common.copy")} />
                </div>
              </Field>
            ) : null}
            {created?.path ? (
              <p className="t-caption text-muted-foreground">
                {t("engine.keys.result.written")}：
                <span className="t-mono">{created.path}</span>
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => setCreated(null)}>
              {t("engine.keys.result.done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- delete confirmation ------------------------------------------ */}
      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <DialogContent size="sm">
          <DialogHeader
            title={t("engine.keys.deleteTitle", {
              name: pendingDelete?.name ?? "",
            })}
            description={t("engine.keys.deleteBody")}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              loading={submitting}
              onClick={() => void handleDelete()}
            >
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

function SwitchRow({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor={id}>{label}</Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
