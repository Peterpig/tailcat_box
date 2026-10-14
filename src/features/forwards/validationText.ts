import type { TranslateParams } from "@/lib/i18n";
import type { ValidationResult } from "@/lib/validation";
import { validationMessageKey } from "./messages";

type Translator = (key: string, params?: TranslateParams) => string;

/**
 * Localised text for a client-side validation failure.
 *
 * `translate` falls back to the key itself when the bundle has no entry, so an
 * unregistered reason degrades to the validator's own message instead of
 * leaking a raw key into the UI.
 */
export function validationText(
  t: Translator,
  scope: "address" | "port" | "host",
  result: ValidationResult,
): string {
  const key = validationMessageKey(scope, result.reason);
  const text = t(key);
  if (text !== key) return text;
  return result.message ?? t("forwards.error.generic");
}
