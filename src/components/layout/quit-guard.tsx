import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { useT } from "@/lib/i18n";
import { useAppStore } from "@/store/app";
import "./quit-guard.messages";

/**
 * 窗口关闭守卫：Rust 侧在有任务运行时阻止关闭并 emit 事件，这里负责把
 * 「还有任务在跑」这件事说清楚，并让用户显式选择退出方式。
 */
export function QuitGuard() {
  const t = useT();
  const quitPrompt = useAppStore((state) => state.quitPrompt);
  const quitBusy = useAppStore((state) => state.quitBusy);
  const dismissQuitPrompt = useAppStore((state) => state.dismissQuitPrompt);
  const confirmQuit = useAppStore((state) => state.confirmQuit);

  const running = quitPrompt ?? 0;

  return (
    <Dialog
      open={quitPrompt !== null}
      onOpenChange={(open) => {
        // 遮罩点击 / Esc 与「取消」等价；忙碌时 store 会忽略这次关闭。
        if (!open) dismissQuitPrompt();
      }}
    >
      <DialogContent size="sm" hideClose>
        <DialogHeader
          title={t("quit.title")}
          description={t("quit.description")}
        />
        <DialogBody className="flex flex-col gap-3">
          <p className="t-body">
            {t(running === 1 ? "quit.body.one" : "quit.body.many", {
              count: running,
            })}
          </p>
          <p className="t-caption text-muted-foreground">{t("quit.recommended")}</p>
          <Callout tone="risk" title={t("quit.force.title")}>
            {t("quit.force.hint")}
          </Callout>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" disabled={quitBusy} onClick={dismissQuitPrompt}>
            {t("quit.cancel")}
          </Button>
          <Button
            variant="danger"
            disabled={quitBusy}
            onClick={() => void confirmQuit("force-quit")}
          >
            {t("quit.force")}
          </Button>
          <Button
            variant="primary"
            loading={quitBusy}
            onClick={() => void confirmQuit("stop-and-quit")}
          >
            {t("quit.stopAndQuit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
