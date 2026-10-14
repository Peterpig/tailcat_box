import { useCallback, useRef, useState } from "react";
import { Info, Waypoints } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type { ScreenProps } from "@/App";
import { ScreenBody, ScreenColumns } from "@/components/layout/screen";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "@/lib/i18n";
import type { TaskInfo, TaskRequest } from "@/lib/types";
import { selectTasksByKind, useAppStore } from "@/store/app";
import { ForwardForm } from "./ForwardForm";
import { ServiceAddress } from "./ServiceAddress";
import { ServiceForm } from "./ServiceForm";
import { TaskDetail } from "./TaskDetail";
import { TaskList } from "./TaskList";
import "./messages";

/* Module-level selectors keep their identity stable across renders. */
const selectForwardTasks = selectTasksByKind("forward");
const selectServiceTasks = selectTasksByKind("service");

type TabId = "forward" | "service";

export default function ForwardsScreen({ onNavigate }: ScreenProps) {
  const t = useT();
  const [tab, setTab] = useState<TabId>("forward");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const engine = useAppStore((state) => state.engine);
  const allowNonLoopbackBind = useAppStore(
    (state) => state.settings.allowNonLoopbackBind,
  );
  const startTask = useAppStore((state) => state.startTask);
  const stopTask = useAppStore((state) => state.stopTask);
  const removeTask = useAppStore((state) => state.removeTask);

  // Zustand v5 compares snapshots with Object.is, so a filtering selector must
  // be wrapped in `useShallow` or it hands React a fresh array on every read.
  const forwardTasks = useAppStore(useShallow(selectForwardTasks));
  const serviceTasks = useAppStore(useShallow(selectServiceTasks));

  /**
   * Launch parameters of the tasks started from this screen. The backend only
   * reports argv, so this map is the only trustworthy source for "start again
   * with the same parameters"; tasks restored from an earlier session have no
   * entry and therefore cannot be restarted as-is.
   */
  const requestsRef = useRef(new Map<string, TaskRequest>());

  const launch = useCallback(
    async (request: TaskRequest): Promise<TaskInfo | null> => {
      const task = await startTask(request);
      if (task) {
        requestsRef.current.set(task.id, request);
        setSelectedId(task.id);
      }
      return task;
    },
    [startTask],
  );

  const handleStop = useCallback(
    (id: string) => {
      void stopTask(id);
    },
    [stopTask],
  );

  const handleRemove = useCallback(
    (id: string) => {
      void removeTask(id);
      setSelectedId((current) => (current === id ? null : current));
    },
    [removeTask],
  );

  const handleStart = useCallback(
    (task: TaskInfo) => {
      const request = requestsRef.current.get(task.id);
      if (!request) return;
      void launch(request);
    },
    [launch],
  );

  const canRestart = useCallback(
    (task: TaskInfo) => requestsRef.current.has(task.id),
    [],
  );

  const selectedForward = forwardTasks.find((task) => task.id === selectedId) ?? null;
  const selectedService = serviceTasks.find((task) => task.id === selectedId) ?? null;
  const engineMissing = Boolean(engine && !engine.found);

  return (
    <>
      <PageHeader title={t("forwards.title")} description={t("forwards.description")} />
      <ScreenBody>
        {engineMissing ? (
          <Callout
            tone="warning"
            title={t("forwards.engine.missing.title")}
            actions={
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onNavigate("settings")}
              >
                {t("forwards.engine.missing.openSettings")}
              </Button>
            }
          >
            {engine?.error?.hint ?? t("forwards.engine.missing.body")}
          </Callout>
        ) : null}

        <Tabs value={tab} onValueChange={(value) => setTab(value as TabId)}>
          <TabsList>
            <TabsTrigger value="forward">{t("forwards.tab.forward")}</TabsTrigger>
            <TabsTrigger value="service">{t("forwards.tab.service")}</TabsTrigger>
          </TabsList>

          <TabsContent value="forward" className="mt-4 flex flex-col gap-4">
            <ScreenColumns>
              <ForwardForm
                allowNonLoopbackBind={allowNonLoopbackBind}
                onOpenSettings={() => onNavigate("settings")}
                onLaunch={launch}
              />
              <TaskList
                title={t("forwards.list.forward.title")}
                description={t("forwards.list.forward.description")}
                emptyTitle={t("forwards.empty.forward.title")}
                emptyDescription={t("forwards.empty.forward.description")}
                emptyIcon={<Waypoints className="size-4" />}
                tasks={forwardTasks}
                selectedId={selectedId}
                canRestart={canRestart}
                onSelect={setSelectedId}
                onStart={handleStart}
                onStop={handleStop}
                onRemove={handleRemove}
              />
            </ScreenColumns>
            {selectedForward ? <TaskDetail task={selectedForward} /> : null}
          </TabsContent>

          <TabsContent value="service" className="mt-4 flex flex-col gap-4">
            <ScreenColumns>
              <ServiceForm onLaunch={launch} />
              <TaskList
                title={t("forwards.list.service.title")}
                description={t("forwards.list.service.description")}
                emptyTitle={t("forwards.empty.service.title")}
                emptyDescription={t("forwards.empty.service.description")}
                emptyIcon={<Info className="size-4" />}
                tasks={serviceTasks}
                selectedId={selectedId}
                canRestart={canRestart}
                onSelect={setSelectedId}
                onStart={handleStart}
                onStop={handleStop}
                onRemove={handleRemove}
                renderRowExtra={(task) => <ServiceAddress task={task} />}
              />
            </ScreenColumns>
            <Callout tone="info" title={t("forwards.service.note.title")}>
              <p>{t("forwards.service.note.body")}</p>
              <p className="mt-1">{t("forwards.service.note.ssh")}</p>
              <p className="mt-1">{t("forwards.service.note.psk")}</p>
            </Callout>
            {selectedService ? <TaskDetail task={selectedService} /> : null}
          </TabsContent>
        </Tabs>
      </ScreenBody>
    </>
  );
}
