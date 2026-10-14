import { registerMessages, t } from "@/lib/i18n";
import type { MessageBundle } from "@/lib/i18n";

registerMessages({
  "quit.title": { "zh-CN": "退出 Tailcat Box？", en: "Quit Tailcat Box?" },
  "quit.description": {
    "zh-CN": "关闭窗口前，请先决定正在运行的任务如何处理",
    en: "Decide how the running tasks should be handled before the window closes",
  },
  "quit.body.one": {
    "zh-CN": "仍有 1 个任务在运行，退出会一并停止这个监听 / 转发 / 传输。",
    en: "1 task is still running. Quitting stops this listener, forward or transfer as well.",
  },
  "quit.body.many": {
    "zh-CN": "仍有 {count} 个任务在运行，退出会一并停止这些监听 / 转发 / 传输。",
    en: "{count} tasks are still running. Quitting stops these listeners, forwards and transfers as well.",
  },
  "quit.recommended": {
    "zh-CN": "推荐：先停止全部任务再退出，可以确保不残留 tailcat 子进程。",
    en: "Recommended: stop all tasks first so no tailcat child process is left behind.",
  },
  "quit.force.title": { "zh-CN": "强制退出的风险", en: "Risk of force quit" },
  "quit.force.hint": {
    "zh-CN":
      "强制退出不会等待任务停止，可能残留正在运行或传输的 tailcat 子进程，需要手动结束。",
    en: "Force quit does not wait for tasks to stop and may leave running or transferring tailcat child processes behind, which then have to be ended manually.",
  },
  "quit.cancel": { "zh-CN": "取消", en: "Cancel" },
  "quit.stopAndQuit": {
    "zh-CN": "停止全部任务并退出",
    en: "Stop all tasks and quit",
  },
  "quit.force": { "zh-CN": "强制退出", en: "Force quit" },

  "quit.error.stopAndQuit": {
    "zh-CN": "停止任务并退出失败",
    en: "Could not stop tasks and quit",
  },
  "quit.error.forceQuit": {
    "zh-CN": "强制退出失败",
    en: "Force quit failed",
  },
} satisfies MessageBundle);

export type QuitMode = "stop-and-quit" | "force-quit";

/** 退出失败提示的文案，供 store 在 pushToast 时复用。 */
export function quitErrorMessage(mode: QuitMode): string {
  return t(mode === "stop-and-quit" ? "quit.error.stopAndQuit" : "quit.error.forceQuit");
}
