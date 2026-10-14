import { useMemo, useState } from "react";
import { ArrowUp, File, Folder, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorNote } from "@/components/ui/error-note";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { normalizeError } from "@/lib/errors";
import { formatBytes, formatTimestamp } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { validateAddress, validateRemotePath } from "@/lib/validation";
import type { RemoteEntry, RemoteListing, UserFacingError } from "@/lib/types";
import { validationMessage } from "./messages";

function parentPath(path: string): string {
  const segments = path.split("/").filter(Boolean);
  segments.pop();
  return segments.join("/");
}

function childPath(path: string, name: string): string {
  const base = path.replace(/\/+$/, "");
  return base ? `${base}/${name}` : name;
}

function sortEntries(entries: RemoteEntry[]): RemoteEntry[] {
  return [...entries]
    .filter((entry) => entry.name !== "." && entry.name !== "..")
    .sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

/** Remote browse view: `tailcat ls -l`, strictly read-only. */
export function BrowsePanel() {
  const t = useT();
  const [address, setAddress] = useState("");
  const [path, setPath] = useState("");
  const [listing, setListing] = useState<RemoteListing | null>(null);
  const [error, setError] = useState<UserFacingError | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const entries = useMemo(
    () => (listing ? sortEntries(listing.entries) : []),
    [listing],
  );

  const load = async (nextPath: string) => {
    const addressResult = validateAddress(address);
    if (!addressResult.ok) {
      setFieldError(
        validationMessage(t, "transfer.validation.address", addressResult.reason),
      );
      return;
    }
    const pathResult = validateRemotePath(nextPath);
    if (!pathResult.ok) {
      setFieldError(
        validationMessage(t, "transfer.validation.remotePath", pathResult.reason),
      );
      return;
    }

    setFieldError(null);
    setError(null);
    setBusy(true);
    try {
      const result = await api.listRemote(address.trim(), nextPath.trim());
      setListing(result);
      setPath(result.path && result.path.length > 0 ? result.path : nextPath.trim());
    } catch (cause) {
      setListing(null);
      setError(normalizeError(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel>
      <PanelHeader
        title={t("transfer.browse.title")}
        description={t("transfer.browse.description")}
      />
      <PanelBody className="flex flex-col gap-3.5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:items-end">
          <Field
            label={t("transfer.browse.addressLabel")}
            htmlFor="transfer-browse-address"
            error={fieldError}
          >
            <Input
              id="transfer-browse-address"
              mono
              value={address}
              invalid={Boolean(fieldError)}
              placeholder="tc…"
              onChange={(event) => {
                setAddress(event.target.value);
                setFieldError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") void load(path);
              }}
            />
          </Field>
          <Field
            label={t("transfer.browse.pathLabel")}
            htmlFor="transfer-browse-path"
            hint={t("transfer.browse.pathHint")}
          >
            <Input
              id="transfer-browse-path"
              mono
              value={path}
              placeholder="/"
              onChange={(event) => {
                setPath(event.target.value);
                setFieldError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") void load(path);
              }}
            />
          </Field>
          <Button
            variant="primary"
            loading={busy}
            onClick={() => void load(path)}
          >
            <RefreshCw />
            {t("transfer.browse.load")}
          </Button>
        </div>

        <Callout tone="info">{t("transfer.browse.readonly")}</Callout>

        {error ? <ErrorNote error={error} /> : null}

        {listing ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="t-mono min-w-0 truncate text-[11.5px] text-muted-foreground">
                {path || t("transfer.browse.root")}
              </div>
              <div className="flex items-center gap-2">
                <span className="t-caption text-muted-foreground">
                  {t("transfer.browse.count", { count: entries.length })}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={path.length === 0}
                  onClick={() => void load(parentPath(path))}
                >
                  <ArrowUp />
                  {t("transfer.browse.up")}
                </Button>
              </div>
            </div>

            {entries.length === 0 ? (
              <EmptyState
                icon={<Folder />}
                title={t("transfer.browse.emptyTitle")}
                description={t("transfer.browse.emptyDescription")}
              />
            ) : (
              <div className="overflow-hidden rounded-md border border-border">
                <table className="w-full border-collapse text-left">
                  <thead className="bg-secondary">
                    <tr>
                      <th className="t-overline px-3 py-2">
                        {t("transfer.browse.colName")}
                      </th>
                      <th className="t-overline w-24 px-3 py-2 text-right">
                        {t("transfer.browse.colSize")}
                      </th>
                      <th className="t-overline w-28 px-3 py-2">
                        {t("transfer.browse.colMode")}
                      </th>
                      <th className="t-overline w-44 px-3 py-2">
                        {t("transfer.browse.colModified")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr key={entry.name} className="border-t border-border">
                        <td className="px-3 py-1.5">
                          {entry.isDir ? (
                            <button
                              type="button"
                              className="t-body flex max-w-full items-center gap-1.5 text-info hover:underline"
                              onClick={() => void load(childPath(path, entry.name))}
                            >
                              <Folder className="size-3.5 shrink-0" />
                              <span className="truncate">{entry.name}</span>
                            </button>
                          ) : (
                            <span className="t-body flex max-w-full items-center gap-1.5 text-foreground">
                              <File className="size-3.5 shrink-0 text-[color:var(--ash)]" />
                              <span className="truncate">{entry.name}</span>
                            </span>
                          )}
                        </td>
                        <td className="t-caption px-3 py-1.5 text-right text-muted-foreground">
                          {entry.isDir ? "—" : formatBytes(entry.size)}
                        </td>
                        <td className="t-mono px-3 py-1.5 text-[11.5px] text-muted-foreground">
                          {entry.mode ?? "—"}
                        </td>
                        <td className="t-caption px-3 py-1.5 text-muted-foreground">
                          {formatTimestamp(entry.modified)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : busy ? (
          <div className="flex flex-col gap-2">
            <p className="t-caption text-muted-foreground">
              {t("transfer.browse.loading")}
            </p>
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : error ? null : (
          <EmptyState
            icon={<Folder />}
            title={t("transfer.browse.idleTitle")}
            description={t("transfer.browse.idleDescription")}
          />
        )}
      </PanelBody>
    </Panel>
  );
}
