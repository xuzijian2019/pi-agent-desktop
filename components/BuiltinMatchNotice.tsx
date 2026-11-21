"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { ConfigButton } from "./SettingsUi";
import {
  applyBuiltinSettings,
  diffBuiltinSettings,
  hasBuiltinDiff,
  normalizeEndpoint,
  type BuiltinMatch,
  type ThinkingLevelMap,
} from "@/lib/builtin-model-match";

const LOOKUP_DELAY_MS = 300;

/** The built-in catalog's answer for this endpoint and model id (null until known). */
export function useBuiltinMatch(baseUrl: string | undefined, modelId?: string): BuiltinMatch | null {
  const [result, setResult] = useState<{ endpoint: string; id: string; match: BuiltinMatch } | null>(null);
  const endpoint = normalizeEndpoint(baseUrl);
  // Keep the original scheme so reconstructing the URL does not erase an
  // explicit port that is non-default for the original scheme.
  const lookup = endpoint ? `${new URL(baseUrl!.trim()).protocol}//${endpoint}` : undefined;
  const id = modelId?.trim() ?? "";
  useEffect(() => {
    if (!endpoint || !lookup) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      // The catalogue matches only host/port/path. Do not put userinfo, query
      // strings or fragments from the draft URL into a GET request.
      const params = new URLSearchParams({ baseUrl: lookup, modelId: id });
      fetch(`/api/models-config/builtin-match?${params}`, { signal: controller.signal })
        .then((res) => res.ok ? res.json() as Promise<BuiltinMatch> : null)
        .then((data) => {
          if (!controller.signal.aborted && data && Array.isArray(data.providers)) setResult({ endpoint, id, match: data });
        })
        .catch(() => undefined);
    }, LOOKUP_DELAY_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [endpoint, id, lookup]);
  return result && result.endpoint === endpoint && result.id === id ? result.match : null;
}

/**
 * Under a custom provider's Base URL: the endpoint is one pi ships as a built-in
 * provider, which carries each model's thinking levels and compat and follows pi's
 * updates. Opening it needs only an API key there.
 */
export function BuiltinProviderNotice({
  baseUrl,
  openableIds,
  onOpen,
}: {
  baseUrl: string | undefined;
  /** Built-in providers the Models panel can open (API-key providers). */
  openableIds: ReadonlySet<string>;
  onOpen: (providerId: string) => void;
}) {
  const { t } = useI18n();
  const match = useBuiltinMatch(baseUrl);
  if (!match || match.providers.length === 0) return null;
  const names = match.providers.map((p) => p.name).join(t("models.builtinNameSeparator"));
  return (
    <div className="builtin-match-notice" role="note">
      <div>{t("models.builtinProviderNotice", { names })}</div>
      <div className="builtin-match-actions">
        {match.providers.filter((p) => openableIds.has(p.id)).map((p) => (
          <ConfigButton key={p.id} size="small" onClick={() => onOpen(p.id)}>
            {t("models.builtinProviderOpen", { name: p.name })}
          </ConfigButton>
        ))}
      </div>
    </div>
  );
}

interface DraftModel {
  id: string;
  reasoning?: boolean;
  thinkingLevelMap?: ThinkingLevelMap;
  compat?: Record<string, unknown>;
}

/**
 * At the top of a custom model: pi lists this model at this endpoint with other
 * reasoning / thinking level / compat settings. Apply copies them into the draft.
 */
export function BuiltinModelNotice<T extends DraftModel>({
  baseUrl,
  model,
  effectiveCompat,
  onApply,
}: {
  baseUrl: string | undefined;
  model: T;
  effectiveCompat: Record<string, unknown>;
  onApply: (next: T) => void;
}) {
  const { t } = useI18n();
  const match = useBuiltinMatch(baseUrl, model.id);
  const builtin = match?.model;
  if (!builtin) return null;
  const diff = diffBuiltinSettings(builtin, model, effectiveCompat);
  if (!hasBuiltinDiff(diff)) return null;

  const changes = [
    diff.reasoning ? t("models.builtinChangeReasoning") : null,
    diff.thinkingLevelMap ? t("models.builtinChangeLevels") : null,
    diff.compatKeys.length ? t("models.builtinChangeCompat", { keys: diff.compatKeys.join(", ") }) : null,
  ].filter((part): part is string => Boolean(part));
  const provider = builtin.providers[0];

  return (
    <div className="builtin-match-notice" role="note">
      <div>{t("models.builtinModelNotice", { provider: provider?.name ?? "", model: builtin.modelName ?? model.id })}</div>
      <ul className="builtin-match-changes">
        {changes.map((change) => <li key={change}>{change}</li>)}
      </ul>
      <div className="builtin-match-actions">
        <ConfigButton size="small" variant="primary" onClick={() => onApply(applyBuiltinSettings(model, builtin))}>
          {t("models.builtinModelApply")}
        </ConfigButton>
      </div>
    </div>
  );
}
