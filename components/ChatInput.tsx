"use client";

import React, { useRef, useState, useCallback, useEffect, useImperativeHandle, forwardRef, KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { BuiltinSlashCommandResult, CompactResultInfo, QueuedMessages, SlashCommandInfo } from "@/hooks/useAgentSession";
import type { SkillsResponse } from "@/lib/api-types";
import type { ModelScopeWarning } from "@/lib/model-scope-warnings";
import type { TextContent, UserMessage } from "@/lib/types";
import { clearDraft, getDraft, setDraft, loadDraft, subscribeDrafts, getDraftStatus, retryDraft, type ChatDraftImage } from "@/lib/draft-store";
import {
  buildPasteToken,
  normalizePastedText,
  shouldChipPastedText,
  splicePastedTexts,
  type ChatDraftText,
  type PastedTextChip,
} from "@/lib/pasted-text";
import {
  MAX_ATTACHED_IMAGE_BYTES,
  MAX_ATTACHED_IMAGES,
  isBase64ImageWithinLimits,
} from "@/lib/image-attachments";
import {
  buildEntriesFromFiles, buildAtInsertText, buildSessionMentionText, extractAtQuery, extractHashQuery,
  filterFileEntries, filterSessionEntries,
  type AtQueryMatch, type FileIndexEntry, type HashQueryMatch, type SessionMentionEntry,
} from "@/lib/file-fuzzy";
import { SESSION_REFERENCE_PATTERN } from "@/lib/session-reference";
import { prepareOutgoingMessage, type PreparedOutgoing, type ReferenceSelection } from "@/lib/prepare-outgoing";
import type { ChatDraft } from "@/lib/draft-store";
import type { TaskSetup } from "@/lib/task-types";
import { BranchControl } from "./workbench/BranchControl";
import { selectableThinkingLevels } from "@/lib/thinking-level-options";
import { ImageLightbox } from "./ImageLightbox";
import type { SessionInfo } from "@/lib/types";
import { FolderIcon, getFileIcon } from "./FileIcons";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useI18n } from "@/hooks/useI18n";
import type { ExtensionStatusItem } from "@/lib/types";
import type { ContextUsage, SessionStatsInfo } from "@/lib/pi-types";
import { ExtensionStatusBar } from "./ExtensionStatusBar";
import { ContextUsageRing } from "./ContextUsageRing";

export interface AttachedImage {
  data: string;   // base64, no prefix
  mimeType: string;
  previewUrl: string; // object URL for display
}

interface ModelOption {
  provider: string;
  modelId: string;
  name: string;
}

interface Props {
  onSend: (message: string, images?: AttachedImage[]) => void;
  onDraftChange?: () => void;
  onSetupChange?: (setup: TaskSetup) => void;
  sendPreview?: React.ReactNode;
  onOpenTasks?: () => void;
  onBranchNavigate?: (cwd: string) => void;
  onAbort: () => void;
  onSteer?: (message: string, images?: AttachedImage[]) => void;
  onFollowUp?: (message: string, images?: AttachedImage[]) => void;
  onPromptWithStreamingBehavior?: (message: string, behavior: "steer" | "followUp", images?: AttachedImage[]) => void;
  isStreaming: boolean;
  model?: { provider: string; modelId: string } | null;
  isAutoModelSelection?: boolean;
  modelNames?: Record<string, string>;
  modelList?: { id: string; name: string; provider: string }[];
  modelError?: string | null;
  /** Diagnostics from resolving `enabledModels`, e.g. a pattern that matched nothing. */
  modelScopeWarnings?: ModelScopeWarning[];
  /** Dismiss the current scope warnings for this conversation only. */
  onDismissModelScopeWarnings?: () => void;
  /** Open the provider/auth configuration modal (offered for unauthenticated-provider warnings). */
  onOpenModelsConfig?: () => void;
  onModelChange?: (provider: string, modelId: string) => void;
  onCompact?: () => void;
  onAbortCompaction?: () => void;
  isCompacting?: boolean;
  compactError?: string | null;
  compactResult?: CompactResultInfo | null;
  toolPreset?: "none" | "default" | "full";
  onToolPresetChange?: (preset: "none" | "default" | "full") => void;
  thinkingLevel?: "auto" | "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
  onThinkingLevelChange?: (level: "auto" | "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max") => void;
  availableThinkingLevels?: string[] | null;
  thinkingLevelMap?: Record<string, string | null> | null;
  retryInfo?: { attempt: number; maxAttempts: number; errorMessage?: string } | null;
  queuedMessages?: QueuedMessages | null;
  inputHistory?: string[];
  onRecallQueue?: () => void;
  slashCommands?: SlashCommandInfo[];
  slashCommandsLoading?: boolean;
  onLoadSlashCommands?: () => Promise<SlashCommandInfo[]> | SlashCommandInfo[];
  onBuiltinCommand?: (message: string) => Promise<BuiltinSlashCommandResult>;
  draftKey?: string;
  /** Session working directory — enables the @ file autocomplete menu */
  cwd?: string | null;
  /** Project root shown in the composer so the session context is always visible. */
  projectPath?: string | null;
  /** Open the project chooser and switch the active project. */
  onSelectProject?: () => void;
  /** Active project roots available to a new-session composer. */
  projectOptions?: string[];
  /** Switch the new-session composer to one of the active projects. */
  onProjectChange?: (projectRoot: string) => void;
  /** Focus the textarea on mount / when this becomes true (e.g. New task page). */
  autoFocus?: boolean;
  /** Extension footer statuses (tools/err/last, etc.) shown next to the model selector */
  extensionStatuses?: ExtensionStatusItem[];
  /** Live context-window usage (numerator) for the usage ring next to the model selector */
  contextUsage?: ContextUsage | null;
  /** Session token summary shown when hovering the usage ring */
  sessionStats?: SessionStatsInfo | null;
  /** Open the top-bar session-stats panel when the usage ring is clicked */
  onSessionStatsPanelOpen?: () => void;
}

export interface ChatInputHandle {
  snapshot: () => ChatDraft;
  currentSetup: () => TaskSetup;
  prepare: (refresh?: boolean) => Promise<PreparedOutgoing>;
  removeContextItem: (kind: "paste" | "reference" | "image", id: string) => void;
  selectReference: (label: string, selection: ReferenceSelection) => void;
  insertText: (text: string) => void;
  insertIfEmpty: (text: string) => void;
  replaceMessage: (message: UserMessage) => void;
  prependText: (text: string) => void;
  addImages: (files: File[]) => void;
  focus: () => void;
}

const TOOL_PRESETS = ["off", "default", "full"] as const;
const TOOL_PRESET_MAP: Record<"off" | "default" | "full", "none" | "default" | "full"> = { off: "none", default: "default", full: "full" };
const COMPOSITION_END_ENTER_GRACE_MS = 100;
const MODEL_FILTER_THRESHOLD = 8;
const MODEL_OPTION_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function compareModelOptions(a: ModelOption, b: ModelOption): number {
  return MODEL_OPTION_COLLATOR.compare(a.name || a.modelId, b.name || b.modelId)
    || MODEL_OPTION_COLLATOR.compare(a.provider, b.provider)
    || MODEL_OPTION_COLLATOR.compare(a.modelId, b.modelId);
}

export function filterModelOptions(options: ModelOption[], query: string): ModelOption[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return options;

  return options.filter((option) => (
    `${option.name} ${option.modelId}`
      .toLocaleLowerCase()
      .includes(normalizedQuery)
  ));
}

type ComposerTier = "normal" | "compact" | "narrow";

const THINKING_LEVELS = ["auto", "off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
const THINKING_LEVEL_DESC_KEYS: Record<typeof THINKING_LEVELS[number], string> = {
  auto: "chat.thinkingUseDefault", off: "chat.thinkingOff", minimal: "chat.thinkingMinimal", low: "chat.thinkingLow",
  medium: "chat.thinkingMedium", high: "chat.thinkingHigh", xhigh: "chat.thinkingXhigh", max: "chat.thinkingMax",
};

function getProjectLabel(projectPath: string | null | undefined): string | null {
  const normalized = projectPath?.replace(/[\\/]+$/, "");
  if (!normalized) return null;
  return normalized.split(/[\\/]/).pop() ?? normalized;
}

function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
  return tokens.toLocaleString();
}

type SlashCommandPaletteItem = SlashCommandInfo | {
  name: string;
  description: string;
  source: "builtin";
};

type SlashCommandSource = SlashCommandPaletteItem["source"];

const BUILTIN_SLASH_COMMANDS: SlashCommandPaletteItem[] = [
  { name: "compact", description: "chat.commandCompact", source: "builtin" },
  { name: "reload", description: "chat.commandReload", source: "builtin" },
  { name: "name", description: "chat.commandName", source: "builtin" },
  { name: "session", description: "chat.commandSession", source: "builtin" },
  { name: "copy", description: "chat.commandCopy", source: "builtin" },
];

const SLASH_SOURCES: SlashCommandSource[] = ["builtin", "extension", "prompt", "skill"];

const SLASH_SOURCE_GROUP_LABEL_KEYS: Record<SlashCommandSource, string> = {
  builtin: "chat.builtIn",
  extension: "chat.extensions",
  prompt: "chat.prompts",
  skill: "chat.skills",
};

const SLASH_SOURCE_ORDER: Record<SlashCommandSource, number> = {
  builtin: 0,
  extension: 1,
  prompt: 2,
  skill: 3,
};

function slashMatchRank(command: SlashCommandPaletteItem, query: string, t: (key: string) => string): number {
  const name = command.name.toLowerCase();
  const description = getSlashDescription(command, t).toLowerCase();
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  if (name.includes(query)) return 2;
  if (description.includes(query)) return 3;
  return 4;
}

function getSlashDescription(command: SlashCommandPaletteItem, t: (key: string) => string): string {
  return command.source === "builtin" ? t(command.description) : command.description ?? "";
}

// Skill slash commands are named "skill:<skillName>"; look the skill up in the
// dormancy map fetched from /api/skills. Unknown skills are treated as active.
function isDormantSkillCommand(command: SlashCommandPaletteItem, dormancy: Record<string, boolean>): boolean {
  if (command.source !== "skill" || !command.name.startsWith("skill:")) return false;
  return dormancy[command.name.slice("skill:".length)] === true;
}

export function buildSlashCommandLayout(
  commands: SlashCommandPaletteItem[],
  dormancy: Record<string, boolean>,
) {
  let index = 0;
  const groups = SLASH_SOURCES
    .map((source) => {
      const sourceCommands = commands.filter((command) => command.source === source);
      const orderedCommands = source === "skill"
        ? [
            ...sourceCommands.filter((command) => !isDormantSkillCommand(command, dormancy)),
            ...sourceCommands.filter((command) => isDormantSkillCommand(command, dormancy)),
          ]
        : sourceCommands;
      return {
        source,
        items: orderedCommands.map((command) => ({ command, index: index++ })),
      };
    })
    .filter((group) => group.items.length > 0);

  return {
    commands: groups.flatMap((group) => group.items.map(({ command }) => command)),
    groups,
  };
}

function imageToDraftImage(image: AttachedImage): ChatDraftImage {
  return { data: image.data, mimeType: image.mimeType };
}

function draftImageToAttachedImage(image: ChatDraftImage): AttachedImage {
  return {
    ...image,
    previewUrl: `data:${image.mimeType};base64,${image.data}`,
  };
}

function draftImagesToAttachedImages(images: ChatDraftImage[] | undefined): AttachedImage[] {
  return (images ?? []).map(draftImageToAttachedImage);
}

export function draftTextsToPastedTexts(texts: ChatDraftText[] | undefined): PastedTextChip[] {
  return (texts ?? []).map((text) => ({
    id: text.id,
    token: buildPasteToken(text.id, text.content),
    content: text.content,
  }));
}

export function pastedTextsToDraftTexts(chips: PastedTextChip[]): ChatDraftText[] {
  return chips.map(({ id, content }) => ({ id, content }));
}

export function canRestoreUserMessage(
  value: string,
  attachedImageCount: number,
  pendingImageCount: number,
): boolean {
  return !value.trim() && attachedImageCount === 0 && pendingImageCount === 0;
}

export function getUserMessageText(message: UserMessage): string {
  if (typeof message.content === "string") return message.content;
  return message.content
    .filter((block): block is TextContent => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

export function getUserMessageDraftImages(message: UserMessage): ChatDraftImage[] {
  if (typeof message.content === "string") return [];
  return message.content.flatMap((block) => {
    if (block.type !== "image") return [];

    // Support both the current nested image format and older flat pi-ai entries.
    const flat = block as unknown as { data?: unknown; mimeType?: unknown };
    const data = block.source?.type === "base64" ? block.source.data : flat.data;
    const mimeType = block.source?.type === "base64" ? block.source.media_type : flat.mimeType;
    if (typeof data !== "string" || typeof mimeType !== "string") return [];

    const image = { data, mimeType };
    return isBase64ImageWithinLimits(image) ? [image] : [];
  });
}

function revokeImagePreview(image: AttachedImage): void {
  if (image.previewUrl.startsWith("blob:")) {
    URL.revokeObjectURL(image.previewUrl);
  }
}

function QueuedMessageRow({ kind, label, text }: { kind: "steer" | "follow-up"; label: string; text: string }) {
  return (
    <div
      title={text}
      className="composer-queued-row"
    >
      <span
        className={`composer-queued-kind${kind === "steer" ? " is-steer" : ""}`}
      >
        {label}
      </span>
      <span className="composer-ellipsis">{text}</span>
    </div>
  );
}

function ModelNoticeBanner({
  tone,
  title,
  body,
  action,
  onDismiss,
  dismissLabel,
}: {
  tone: "error" | "warning";
  title: string;
  body: string;
  action?: React.ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
}) {
  return (
    <div
      role="alert"
      className={`composer-notice-banner is-${tone}`}
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="composer-notice-icon"
        aria-hidden="true"
      >
        <path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <div className="composer-notice-main">
        <div className="composer-notice-head">
          <div className="composer-notice-title">{title}</div>
          {action}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label={dismissLabel}
              title={dismissLabel}
              className="composer-notice-dismiss"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <line x1="5" y1="5" x2="19" y2="19" />
                <line x1="19" y1="5" x2="5" y2="19" />
              </svg>
            </button>
          )}
        </div>
        <div className="composer-notice-body">{body}</div>
      </div>
    </div>
  );
}

export function ModelErrorBanner({ error }: { error?: string | null }) {
  const { t } = useI18n();
  if (!error) return null;
  return <ModelNoticeBanner tone="error" title={t("chat.modelError")} body={error} />;
}

/**
 * Surfaces `enabledModels` patterns that matched nothing (#307) and patterns
 * whose provider has no usable credentials (#48), with an in-conversation
 * dismiss so a stale warning never becomes permanent wallpaper.
 */
export function ModelScopeWarningBanner({
  warnings,
  onDismiss,
  dismissLabel,
  onOpenModelsConfig,
}: {
  warnings?: ModelScopeWarning[];
  onDismiss?: () => void;
  dismissLabel?: string;
  onOpenModelsConfig?: () => void;
}) {
  const { t } = useI18n();
  if (!warnings || warnings.length === 0) return null;
  const mentionsUnauthenticated = warnings.some(
    (warning) => warning.code === "unauthenticated-provider" && (warning.unauthenticatedProviders?.length ?? 0) > 0,
  );
  const body = warnings.map((warning) => {
    if (warning.code === "unauthenticated-provider" && (warning.unauthenticatedProviders?.length ?? 0) > 0) {
      return t("chat.modelScopeUnauthenticated", {
        pattern: warning.pattern,
        providers: (warning.unauthenticatedProviders ?? []).join(", "),
      });
    }
    return warning.message;
  }).join("\n");
  return (
    <ModelNoticeBanner
      tone="warning"
      title={warnings.length > 1 ? t("chat.modelScopeWarnings") : t("chat.modelScopeWarning")}
      body={body}
      action={mentionsUnauthenticated && onOpenModelsConfig ? (
        <button
          type="button"
          onClick={onOpenModelsConfig}
          className="composer-notice-action"
        >
          {t("chat.modelScopeConfigure")}
        </button>
      ) : undefined}
      onDismiss={onDismiss}
      dismissLabel={dismissLabel}
    />
  );
}

/** Quick commits stay quiet; a slow save never adds a row to the editor. */
function DraftSavingIndicator({ loading }: { loading: boolean }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 600);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <div className="composer-draft-anchor">
      <span role="status" className="composer-draft-status">
        {loading ? "Loading draft…" : "Saving draft…"}
      </span>
    </div>
  );
}

export const ChatInput = forwardRef<ChatInputHandle, Props>(function ChatInput({
  onSend, onAbort, onSteer, onFollowUp, isStreaming, model, isAutoModelSelection, modelNames, modelList, modelError, modelScopeWarnings, onDismissModelScopeWarnings, onOpenModelsConfig, onModelChange,
  onCompact, onAbortCompaction, isCompacting, compactError, compactResult, toolPreset, onToolPresetChange,
  thinkingLevel, onThinkingLevelChange, availableThinkingLevels, thinkingLevelMap,
  retryInfo, queuedMessages, inputHistory = [], onRecallQueue,
  slashCommands, slashCommandsLoading, onLoadSlashCommands,
  onBuiltinCommand,
  onPromptWithStreamingBehavior,
  draftKey,
  cwd,
  projectPath,
  onSelectProject,
  projectOptions = [],
  onProjectChange,
  autoFocus = false,
  extensionStatuses = [],
  contextUsage,
  sessionStats,
  onSessionStatsPanelOpen, onDraftChange, onSetupChange, onBranchNavigate, sendPreview,
}: Props, ref) {
  const { t } = useI18n();
  const isMobile = useIsMobile();
  const composerRef = useRef<HTMLDivElement | null>(null);
  const [composerTier, setComposerTier] = useState<ComposerTier>(() => (isMobile ? "narrow" : "normal"));

  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;

    const updateTier = (width: number) => {
      let nextTier: ComposerTier = "normal";
      if (isMobile || width < 400) {
        nextTier = "narrow";
      } else if (width < 560) {
        nextTier = "compact";
      }
      setComposerTier((prev) => (prev === nextTier ? prev : nextTier));
    };

    updateTier(el.offsetWidth);

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect?.width ?? el.offsetWidth;
        updateTier(width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isMobile]);

  const isNarrow = composerTier === "narrow";
  const isCompact = composerTier === "compact" || isNarrow;
  // Nothing to measure or compact before the session has a transcript.
  const hasTranscript = (sessionStats?.totalMessages ?? 0) > 0;
  const [value, setValue] = useState(() => (draftKey ? getDraft(draftKey)?.value ?? "" : ""));
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [modelDropdownRect, setModelDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const [modelFilter, setModelFilter] = useState("");
  const [toolDropdownOpen, setToolDropdownOpen] = useState(false);
  const [thinkingDropdownOpen, setThinkingDropdownOpen] = useState(false);
  const [controlsMenuOpen, setControlsMenuOpen] = useState(false);
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  // Full-path flyout shown right of a hovered project row (replaces the native title tooltip).
  const [projectPathTip, setProjectPathTip] = useState<{ path: string; top: number; left: number } | null>(null);
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>(() => (

    draftKey ? draftImagesToAttachedImages(getDraft(draftKey)?.images) : []
  ));
  const [pastedTexts, setPastedTexts] = useState<PastedTextChip[]>(() => (
    draftKey ? draftTextsToPastedTexts(getDraft(draftKey)?.texts) : []
  ));
  const projectLabel = getProjectLabel(projectPath);
  const trimmedValue = value.trimStart();
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const bashMode = attachedImages.length === 0 && trimmedValue.startsWith("!");
  const bashExcluded = bashMode && trimmedValue.startsWith("!!");
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const [atQuery, setAtQuery] = useState<AtQueryMatch | null>(null);
  const [atMenuOpen, setAtMenuOpen] = useState(false);
  const [atActiveIndex, setAtActiveIndex] = useState(0);
  const [hashQuery, setHashQuery] = useState<HashQueryMatch | null>(null);
  const [hashMenuOpen, setHashMenuOpen] = useState(false);
  const [hashActiveIndex, setHashActiveIndex] = useState(0);
  const [historyMenuOpen, setHistoryMenuOpen] = useState(false);
  const [historyActiveIndex, setHistoryActiveIndex] = useState(0);
  const [fileIndex, setFileIndex] = useState<{ cwd: string; entries: FileIndexEntry[]; truncated: boolean } | null>(null);
  const [fileIndexLoading, setFileIndexLoading] = useState(false);
  const [atServerResult, setAtServerResult] = useState<{ cwd: string; query: string; matches: FileIndexEntry[] } | null>(null);
  const [sessionIndex, setSessionIndex] = useState<{ entries: SessionMentionEntry[]; fetchedAt: number } | null>(null);
  const [skillDormancyState, setSkillDormancyState] = useState<{
    cwd: string;
    values: Record<string, boolean>;
  } | null>(null);
  const skillDormancy = cwd && skillDormancyState?.cwd === cwd
    ? skillDormancyState.values
    : {};

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const projectDropdownRef = useRef<HTMLDivElement>(null);
  const modelDropdownPanelRef = useRef<HTMLDivElement>(null);
  const toolDropdownRef = useRef<HTMLDivElement>(null);
  const thinkingDropdownRef = useRef<HTMLDivElement>(null);
  const controlsMenuRef = useRef<HTMLDivElement>(null);
  const historyMenuRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);
  const lastCompositionEndAtRef = useRef(0);
  const slashCommandsRequestedRef = useRef(false);
  const slashItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const atItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const hashItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const historyItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const fileIndexMetaRef = useRef<{ cwd: string; fetchedAt: number } | null>(null);
  const fileIndexFetchingRef = useRef<string | null>(null);
  const sessionIndexFetchingRef = useRef(false);
  const sessionMentionTargetsRef = useRef(new Map<string, string>());
  const draftKeyRef = useRef(draftKey);
  const valueRef = useRef(value);
  const attachedImagesRef = useRef(attachedImages);
  const pastedTextsRef = useRef(pastedTexts);
  const pendingImageCountRef = useRef(0);
  valueRef.current = value;
  attachedImagesRef.current = attachedImages;
  pastedTextsRef.current = pastedTexts;

  const [draftSetup, setDraftSetup] = useState<TaskSetup>();
  const [referenceSelections, setReferenceSelections] = useState<Record<string, ReferenceSelection>>({});
  const [preparationError, setPreparationError] = useState("");
  const preparingRef = useRef(false);
  const preparationRef = useRef<{ key: string; result: PreparedOutgoing } | null>(null);
  const preparationController = useRef<AbortController | null>(null);
  const snapshot = useCallback((): ChatDraft => ({ value: valueRef.current, images: attachedImagesRef.current.map(imageToDraftImage), texts: pastedTextsToDraftTexts(pastedTextsRef.current), setup: draftSetup, references: { ...Object.fromEntries([...sessionMentionTargetsRef.current].map(([label, id]) => [label, { id }])), ...referenceSelections } }), [draftSetup, referenceSelections]);
  const snapshotRef = useRef(snapshot); snapshotRef.current = snapshot;
  const prepare = useCallback(async (refresh = false) => {
    const draft = snapshotRef.current(); const owner = draftKeyRef.current;
    const key = JSON.stringify([owner, draft, model, thinkingLevel, toolPreset]);
    if (!refresh && preparationRef.current?.key === key) return preparationRef.current.result;
    preparationController.current?.abort();
    const controller = new AbortController(); preparationController.current = controller;
    const result = await prepareOutgoingMessage(draft, fetch, controller.signal);
    if (owner !== draftKeyRef.current || refresh && JSON.stringify(snapshotRef.current()) !== JSON.stringify(draft)) throw new Error(t("wb.previewChanged"));
    preparationRef.current = { key, result }; return result;
  }, [model, thinkingLevel, toolPreset, t]);
  useEffect(() => { onDraftChange?.(); }, [value, attachedImages, pastedTexts, draftSetup, referenceSelections, model?.provider, model?.modelId, thinkingLevel, toolPreset, draftKey, onDraftChange]);
  useEffect(() => () => { preparationController.current?.abort(); }, [draftKey]);

  useImperativeHandle(ref, () => ({
    snapshot,
    currentSetup: () => ({ model: model ?? null, effort: thinkingLevel ?? "auto", tools: toolPreset ?? "default" }),
    prepare,
    selectReference(label, selection) { setReferenceSelections(prev => ({ ...prev, [label]: selection })); },
    removeContextItem(kind, id) {
      if (kind === "image") { setAttachedImages(prev => prev.filter((image, index) => { if (String(index) === id) { revokeImagePreview(image); return false; } return true; })); }
      if (kind === "paste") { const paste = pastedTextsRef.current.find(p => String(p.id) === id); if (paste) { setValue(v => v.split(paste.token).join("")); setPastedTexts(p => p.filter(i => i.id !== paste.id)); } }
      if (kind === "reference") { setValue(v => v.replace(SESSION_REFERENCE_PATTERN, (token, quoted, bare) => (quoted ?? bare) === id ? "" : token)); sessionMentionTargetsRef.current.delete(id); setReferenceSelections(prev => { const next = { ...prev }; delete next[id]; return next; }); }
    },
    insertIfEmpty(text: string) {
      const ta = textareaRef.current;
      const current = ta ? ta.value : value;
      if (current.trim()) return;
      setValue(text);
      setAtQuery(null);
      setHashQuery(null);
      requestAnimationFrame(() => {
        if (!ta) return;
        ta.focus();
        ta.style.height = "auto";
        ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
      });
    },
    replaceMessage(message: UserMessage) {
      const ta = textareaRef.current;
      const current = ta ? ta.value : value;
      if (!canRestoreUserMessage(current, attachedImagesRef.current.length, pendingImageCountRef.current)) return;

      setValue(getUserMessageText(message));
      setAtQuery(null);
      setHashQuery(null);
      setHistoryMenuOpen(false);
      setAttachedImages((prev) => {
        prev.forEach(revokeImagePreview);
        return draftImagesToAttachedImages(getUserMessageDraftImages(message));
      });
      requestAnimationFrame(() => {
        if (!ta) return;
        ta.focus();
        ta.style.height = "auto";
        ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
      });
    },
    prependText(text: string) {
      if (!text.trim()) return;
      const ta = textareaRef.current;
      const current = ta ? ta.value : value;
      // Mirrors the TUI's queue restore: queued text first, then whatever
      // the user already typed, separated by a blank line.
      const combined = [text, current].filter((t) => t.trim()).join("\n\n");
      setValue(combined);
      setAtQuery(null);
      setHashQuery(null);
      requestAnimationFrame(() => {
        if (!ta) return;
        ta.focus();
        ta.setSelectionRange(combined.length, combined.length);
        ta.style.height = "auto";
        ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
      });
    },
    insertText(text: string) {
      const ta = textareaRef.current;
      if (!ta) {
        setValue((v) => v + (v ? " " : "") + text);
        return;
      }
      const start = ta.selectionStart ?? ta.value.length;
      const end = ta.selectionEnd ?? ta.value.length;
      const before = ta.value.slice(0, start);
      const after = ta.value.slice(end);
      const sep = before.length > 0 && !before.endsWith(" ") ? " " : "";
      const newVal = before + sep + text + after;
      setValue(newVal);
      setAtQuery(null);
      setHashQuery(null);
      requestAnimationFrame(() => {
        if (!ta) return;
        const pos = start + sep.length + text.length;
        ta.setSelectionRange(pos, pos);
        ta.focus();
        ta.style.height = "auto";
        ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
      });
    },
    addImages(files: File[]) {
      processImageFiles(files);
    },
    focus() {
      textareaRef.current?.focus();
    },
  }));

  // Activate the composer so New task / remounted chats are immediately typable
  // without an extra click. Defer past the click that opened the page (⌘N /
  // sidebar button) which would otherwise steal focus back.
  useEffect(() => {
    if (!autoFocus || isMobile) return;
    const id = window.setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [autoFocus, isMobile, draftKey]);

  const appendAttachedImages = useCallback((newImages: AttachedImage[]) => {
    setAttachedImages((prev) => {
      const accepted = newImages.slice(0, Math.max(0, MAX_ATTACHED_IMAGES - prev.length));
      newImages.slice(accepted.length).forEach(revokeImagePreview);
      return [...prev, ...accepted];
    });
  }, []);

  const processImageFiles = useCallback(async (files: File[]) => {
    if (isStreaming) return;
    const remaining = Math.max(
      0,
      MAX_ATTACHED_IMAGES - attachedImagesRef.current.length - pendingImageCountRef.current,
    );
    const imageFiles = files
      .filter((f) => f.type.startsWith("image/") && f.size <= MAX_ATTACHED_IMAGE_BYTES)
      .slice(0, remaining);
    if (!imageFiles.length) return;
    pendingImageCountRef.current += imageFiles.length;
    try {
      const newImages = await Promise.all(
        imageFiles.map(
          (file) =>
            new Promise<AttachedImage>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const result = reader.result as string;
                // result is "data:<mime>;base64,<data>"
                const base64 = result.split(",")[1];
                resolve({ data: base64, mimeType: file.type, previewUrl: URL.createObjectURL(file) });
              };
              reader.onerror = reject;
              reader.readAsDataURL(file);
            })
        )
      );
      appendAttachedImages(newImages);
    } finally {
      pendingImageCountRef.current -= imageFiles.length;
    }
  }, [appendAttachedImages, isStreaming]);

  const removeImage = useCallback((index: number) => {
    setAttachedImages((prev) => {
      const next = [...prev];
      const [removed] = next.splice(index, 1);
      if (removed) revokeImagePreview(removed);
      return next;
    });
  }, []);

  const clearImages = useCallback(() => {
    setAttachedImages((prev) => {
      prev.forEach(revokeImagePreview);
      return [];
    });
  }, []);

  // Large text pastes become a chip token in the composer plus the full
  // content held here; spliced back as a fenced block on send.
  const insertPastedTextChip = useCallback((content: string) => {
    const id = pastedTextsRef.current.reduce((max, chip) => Math.max(max, chip.id), 0) + 1;
    const token = buildPasteToken(id, content);
    const ta = textareaRef.current;
    let inserted = false;
    if (ta) {
      ta.focus();
      // execCommand keeps the textarea's native undo stack intact.
      try {
        inserted = document.execCommand("insertText", false, token);
      } catch {
        inserted = false;
      }
    }
    if (!inserted) {
      const current = valueRef.current;
      const start = ta?.selectionStart ?? current.length;
      const end = ta?.selectionEnd ?? start;
      const next = current.slice(0, start) + token + current.slice(end);
      setValue(next);
      requestAnimationFrame(() => {
        if (!ta) return;
        ta.setSelectionRange(start + token.length, start + token.length);
      });
    }
    setPastedTexts((prev) => [...prev, { id, token, content }]);
  }, []);

  const removePaste = useCallback((id: number) => {
    const removed = pastedTextsRef.current.find((chip) => chip.id === id);
    setPastedTexts((prev) => prev.filter((chip) => chip.id !== id));
    if (removed) setValue((prev) => prev.split(removed.token).join(""));
  }, []);

  const clearInput = useCallback(() => {
    setValue("");
    setAtQuery(null);
    setHashQuery(null);
    setHistoryMenuOpen(false);
    if (draftKey) clearDraft(draftKey);
    clearImages();
    setPastedTexts([]);
    setDraftSetup(undefined);
    setReferenceSelections({});
    sessionMentionTargetsRef.current.clear();
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [clearImages, draftKey]);

  // Chips whose token was deleted from the composer by hand are dropped so
  // state, draft persistence and the chip row all follow the visible text.
  useEffect(() => {
    setPastedTexts((prev) => {
      const next = prev.filter((chip) => value.includes(chip.token));
      return next.length === prev.length ? prev : next;
    });
  }, [value]);

  const [hydratedDraftKey, setHydratedDraftKey] = useState<string>();
  const [, refreshDraftStatus] = useState(0);
  useEffect(() => subscribeDrafts(() => refreshDraftStatus((n) => n + 1)), []);
  useEffect(() => {
    let cancelled = false;
    draftKeyRef.current = draftKey;
    if (!draftKey) return;
    void loadDraft(draftKey).then((draft) => {
      if (cancelled) return;
      setValue(draft?.value ?? "");
      setAttachedImages((prev) => {
        prev.forEach(revokeImagePreview);
        return draftImagesToAttachedImages(draft?.images);
      });
      setPastedTexts(draftTextsToPastedTexts(draft?.texts));
      setDraftSetup(draft?.setup);
      if (draft?.setup) onSetupChange?.(draft.setup);
      setReferenceSelections(draft?.references ?? {});
      sessionMentionTargetsRef.current = new Map(Object.entries(draft?.references ?? {}).map(([label, target]) => [label, target.id]));
      setAtQuery(null);
      setHashQuery(null);
      setHistoryMenuOpen(false);
      setHydratedDraftKey(draftKey);
    });
    return () => { cancelled = true; };
  }, [draftKey, onSetupChange]);
  useEffect(() => {
    if (!draftKey || hydratedDraftKey !== draftKey) return;
    setDraft(draftKey, snapshot());
  }, [attachedImages, draftKey, hydratedDraftKey, value, pastedTexts, snapshot]);
  const restoreSavedDraft = useCallback(async () => {
    if (!draftKey) return;
    setHydratedDraftKey(undefined);
    const draft = await loadDraft(draftKey, true);
    if (draftKeyRef.current !== draftKey) return;
    setValue(draft?.value ?? "");
    clearImages();
    setAttachedImages(draftImagesToAttachedImages(draft?.images));
    setPastedTexts(draftTextsToPastedTexts(draft?.texts));
    setHydratedDraftKey(draftKey);
  }, [draftKey, clearImages]);
  const persistenceStatus = draftKey ? getDraftStatus(draftKey) : "saved";
  const invalidDraftImages = attachedImages.length > MAX_ATTACHED_IMAGES || attachedImages.some((image) => !isBase64ImageWithinLimits(image));
  const orphanedPaste = (value.match(/\[Pasted text \d+ · \d+ lines\]/g) ?? []).some((token) => !pastedTexts.some((paste) => paste.token === token));
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    if (value) ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [value]);

  useEffect(() => {
    return () => {
      attachedImagesRef.current.forEach(revokeImagePreview);
    };
  }, []);

  const handleSend = useCallback(async () => {
    if (invalidDraftImages || orphanedPaste || (draftKey && hydratedDraftKey !== draftKey) || persistenceStatus === "conflict") return;
    const msg = splicePastedTexts(value, pastedTexts).trim();
    if (!msg && !attachedImages.length) return;
    if (isStreaming) return;
    if (!attachedImages.length && msg.startsWith("/") && onBuiltinCommand) {
      const result = await onBuiltinCommand(msg);
      if (draftKeyRef.current !== draftKey) return;
      if (result.handled) {
        if (!result.error) clearInput();
        return;
      }
    }
    if (preparingRef.current) return;
    preparingRef.current = true; setPreparationError("");
    try {
      const original = JSON.stringify(snapshotRef.current());
      const prepared = await prepare();
      if (draftKeyRef.current !== draftKey) return;
      onSend(prepared.text, prepared.images.length ? attachedImages : undefined);
      if (JSON.stringify(snapshotRef.current()) === original) clearInput();
    } catch (e) { setPreparationError(String(e)); } finally { preparingRef.current = false; }
  }, [invalidDraftImages, orphanedPaste, draftKey, hydratedDraftKey, persistenceStatus, value, pastedTexts, attachedImages, isStreaming, onBuiltinCommand, onSend, clearInput, prepare]);

  const slashQuery = value.startsWith("/") && !/\s/.test(value.slice(1))
    ? value.slice(1).toLowerCase()
    : null;

  const filteredSlashCommands = (() => {
    if (slashQuery === null) return [];
    const commands = [...(isStreaming ? [] : BUILTIN_SLASH_COMMANDS), ...(slashCommands ?? [])];
    return [...commands]
      .filter((command) => {
        const name = command.name.toLowerCase();
        const description = getSlashDescription(command, t).toLowerCase();
        return name.includes(slashQuery) || description.includes(slashQuery);
      })
      .sort((a, b) => {
        const rankDelta = slashMatchRank(a, slashQuery, t) - slashMatchRank(b, slashQuery, t);
        if (rankDelta !== 0) return rankDelta;
        return SLASH_SOURCE_ORDER[a.source] - SLASH_SOURCE_ORDER[b.source]
          || MODEL_OPTION_COLLATOR.compare(a.name, b.name);
      });
  })();

  const {
    commands: displayedSlashCommands,
    groups: groupedSlashCommands,
  } = buildSlashCommandLayout(filteredSlashCommands, skillDormancy);

  const slashCommandCountLabel = filteredSlashCommands.length === 1
    ? t(slashQuery ? "chat.match" : "chat.command")
    : t(slashQuery ? "chat.matches" : "chat.commands", { count: filteredSlashCommands.length });
  const hasInputText = Boolean(value.trim());
  const canQueueStreamingMessage = hasInputText && attachedImages.length === 0;

  // ── @ file autocomplete ──────────────────────────────────────────────────
  // Recomputed from the text before the caret on every change/caret move.
  // Disabled entirely when there is no cwd (new session without a directory).
  const updateAtQuery = useCallback((text: string, cursor: number | null) => {
    if (!cwd) {
      setAtQuery(null);
      return;
    }
    const pos = cursor ?? text.length;
    setAtQuery(extractAtQuery(text.slice(0, pos)));
  }, [cwd]);

  const updateHashQuery = useCallback((text: string, cursor: number | null) => {
    if (!cwd) {
      setHashQuery(null);
      return;
    }
    const pos = cursor ?? text.length;
    setHashQuery(extractHashQuery(text.slice(0, pos)));
  }, [cwd]);

  const atQueryText = atQuery?.query ?? null;
  const atLocalFileMatches: FileIndexEntry[] = React.useMemo(() => (
    atQueryText !== null && fileIndex && fileIndex.cwd === cwd
      ? filterFileEntries(fileIndex.entries, atQueryText, 12)
      : []
  ), [atQueryText, fileIndex, cwd]);

  const hashQueryText = hashQuery?.query ?? null;
  const hashMatches: SessionMentionEntry[] = React.useMemo(() => (
    hashQueryText !== null && sessionIndex
      ? filterSessionEntries(sessionIndex.entries, hashQueryText)
      : []
  ), [hashQueryText, sessionIndex]);

  // When the client index is truncated (repo larger than the index cap),
  // local filtering cannot see deep files, so queries are also ranked
  // server-side against the full listing. Local matches render immediately
  // and are replaced when the (debounced) server result for the current
  // query arrives; stale responses are ignored via the query/cwd tag.
  const needsServerSearch = Boolean(atQueryText && fileIndex?.truncated && fileIndex.cwd === cwd);
  useEffect(() => {
    if (!needsServerSearch || !cwd || !atQueryText) return;
    const fetchCwd = cwd;
    const query = atQueryText;
    const timer = setTimeout(() => {
      fetch(`/api/file-index?cwd=${encodeURIComponent(fetchCwd)}&q=${encodeURIComponent(query)}`)
        .then((res) => {
          if (!res.ok) throw new Error(`file search failed: ${res.status}`);
          return res.json() as Promise<{ matches?: FileIndexEntry[] }>;
        })
        .then((data) => setAtServerResult({ cwd: fetchCwd, query, matches: data.matches ?? [] }))
        .catch(() => {
          // Keep showing local matches; the next keystroke retries.
        });
    }, 150);
    return () => clearTimeout(timer);
  }, [needsServerSearch, atQueryText, cwd]);

  const serverResultInUse = needsServerSearch
    && atServerResult !== null
    && atServerResult.cwd === cwd
    && atServerResult.query === atQueryText;
  const atMatches: FileIndexEntry[] = serverResultInUse ? atServerResult.matches : atLocalFileMatches;

  // Open/reset the menu whenever the @token appears or changes (mirrors the
  // slash menu: Escape closes it, the next keystroke re-opens it).
  const atTokenKey = atQuery === null ? null : `${atQuery.start}:${atQuery.quoted ? 1 : 0}:${atQuery.query}`;
  useEffect(() => {
    if (atTokenKey === null) {
      setAtMenuOpen(false);
      setAtActiveIndex(0);
      return;
    }
    setAtMenuOpen(true);
    setAtActiveIndex(0);
  }, [atTokenKey]);

  const hashTokenKey = hashQuery === null ? null : `${hashQuery.start}:${hashQuery.quoted ? 1 : 0}:${hashQuery.query}`;
  useEffect(() => {
    if (hashTokenKey === null) {
      setHashMenuOpen(false);
      setHashActiveIndex(0);
      return;
    }
    setHashMenuOpen(true);
    setHashActiveIndex(0);
  }, [hashTokenKey]);

  // Fetch the file index when the menu opens. The server caches per cwd for
  // ~10s, so re-opening refreshes cheaply; while typing nothing refetches.
  const atTokenActive = atQuery !== null;
  useEffect(() => {
    if (!atTokenActive || !cwd) return;
    const meta = fileIndexMetaRef.current;
    if (meta && meta.cwd === cwd && Date.now() - meta.fetchedAt < 10_000) return;
    if (fileIndexFetchingRef.current === cwd) return;
    fileIndexFetchingRef.current = cwd;
    const fetchCwd = cwd;
    setFileIndexLoading(true);
    fetch(`/api/file-index?cwd=${encodeURIComponent(fetchCwd)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`file index failed: ${res.status}`);
        return res.json() as Promise<{ files?: string[]; truncated?: boolean }>;
      })
      .then((data) => {
        setFileIndex({ cwd: fetchCwd, entries: buildEntriesFromFiles(data.files ?? []), truncated: !!data.truncated });
        fileIndexMetaRef.current = { cwd: fetchCwd, fetchedAt: Date.now() };
      })
      .catch(() => {
        // Leave any previous index in place; next open retries.
        fileIndexMetaRef.current = null;
      })
      .finally(() => {
        fileIndexFetchingRef.current = null;
        setFileIndexLoading(false);
      });
  }, [atTokenActive, cwd]);

  // Sessions use the # palette. Keep this list lightweight by
  // using the existing session summary endpoint; full content is fetched only
  // when a selected session mention is sent.
  useEffect(() => {
    if (!hashQuery || !cwd) return;
    if (sessionIndex && Date.now() - sessionIndex.fetchedAt < 10_000) return;
    if (sessionIndexFetchingRef.current) return;
    sessionIndexFetchingRef.current = true;
    fetch("/api/sessions")
      .then((res) => {
        if (!res.ok) throw new Error(`session index failed: ${res.status}`);
        return res.json() as Promise<{ sessions?: SessionInfo[] }>;
      })
      .then((data) => {
        const entries = (data.sessions ?? []).map((session): SessionMentionEntry => ({
          kind: "session",
          id: session.id,
          name: session.name,
          firstMessage: session.firstMessage,
          modified: session.modified,
          messageCount: session.messageCount,
        }));
        setSessionIndex({ entries, fetchedAt: Date.now() });
      })
      .catch(() => {})
      .finally(() => {
        sessionIndexFetchingRef.current = false;
      });
  }, [hashQuery, cwd, sessionIndex]);

  const applyAtCompletion = useCallback((entry: FileIndexEntry) => {
    if (!atQuery) return;
    const ta = textareaRef.current;
    const cursor = ta?.selectionStart ?? value.length;
    const before = value.slice(0, atQuery.start);
    let after = value.slice(cursor);
    // Completing inside a quoted token (@"my dir/… with the caret before the
    // closing quote): the replacement carries its own closing quote, so drop
    // the old one right after the caret (mirrors the TUI's applyCompletion).
    if (atQuery.quoted && after.startsWith('"')) {
      after = after.slice(1);
    }
    const insert = buildAtInsertText(entry.path, entry.isDir, atQuery.quoted);
    const newValue = before + insert.text + after;
    const newPos = before.length + insert.cursorOffset;
    setValue(newValue);
    // setValue alone does not fire onChange — re-derive the token here. Files
    // end with a space (token closes, menu hides); directories end with "/"
    // before the caret (token stays open for drill-down into the directory).
    setAtQuery(extractAtQuery(newValue.slice(0, newPos)));
    setHashQuery(extractHashQuery(newValue.slice(0, newPos)));
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(newPos, newPos);
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    });
  }, [atQuery, value]);

  const applyHashCompletion = useCallback((entry: SessionMentionEntry) => {
    if (!hashQuery) return;
    const ta = textareaRef.current;
    const cursor = ta?.selectionStart ?? value.length;
    const before = value.slice(0, hashQuery.start);
    let after = value.slice(cursor);
    if (hashQuery.quoted && after.startsWith('"')) after = after.slice(1);
    const sessionDisplayName = entry.name?.trim() || entry.firstMessage.trim() || "Untitled session";
    const visibleSessionName = sessionDisplayName.replace(/"/g, "'").replace(/\n/g, " ");
    sessionMentionTargetsRef.current.set(visibleSessionName, entry.id);
    const text = buildSessionMentionText(visibleSessionName);
    const newValue = before + text + after;
    const newPos = before.length + text.length;
    setValue(newValue);
    setHashQuery(extractHashQuery(newValue.slice(0, newPos)));
    setAtQuery(extractAtQuery(newValue.slice(0, newPos)));
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(newPos, newPos);
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    });
  }, [hashQuery, value]);

  useEffect(() => {
    if (atActiveIndex >= atMatches.length) {
      setAtActiveIndex(Math.max(0, atMatches.length - 1));
    }
  }, [atMatches.length, atActiveIndex]);

  useEffect(() => {
    atItemRefs.current.length = atMatches.length;
  }, [atMatches.length]);

  useEffect(() => {
    if (!atMenuOpen) return;
    atItemRefs.current[atActiveIndex]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [atActiveIndex, atMenuOpen]);

  useEffect(() => {
    hashItemRefs.current.length = hashMatches.length;
  }, [hashMatches.length]);

  useEffect(() => {
    if (!hashMenuOpen) return;
    hashItemRefs.current[hashActiveIndex]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [hashActiveIndex, hashMenuOpen]);

  useEffect(() => {
    if (hashActiveIndex >= hashMatches.length) {
      setHashActiveIndex(Math.max(0, hashMatches.length - 1));
    }
  }, [hashMatches.length, hashActiveIndex]);

  useEffect(() => {
    if (historyActiveIndex >= inputHistory.length) {
      setHistoryActiveIndex(Math.max(0, inputHistory.length - 1));
    }
  }, [inputHistory.length, historyActiveIndex]);

  useEffect(() => {
    historyItemRefs.current.length = inputHistory.length;
  }, [inputHistory.length]);

  useEffect(() => {
    if (!historyMenuOpen) return;
    historyItemRefs.current[historyActiveIndex]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [historyActiveIndex, historyMenuOpen]);

  const applyHistoryInput = useCallback((text: string) => {
    setValue(text);
    setHistoryMenuOpen(false);
    setHistoryActiveIndex(0);
    setAtQuery(null);
    setHashQuery(null);
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(text.length, text.length);
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
    });
  }, []);

  const applySlashCommand = useCallback((command: SlashCommandPaletteItem) => {
    const nextValue = `/${command.name} `;
    setValue(nextValue);
    setSlashMenuOpen(false);
    setSlashActiveIndex(0);
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(nextValue.length, nextValue.length);
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
    });
  }, []);

  const sendQueued = useCallback(async (mode: "steer" | "followup") => {
    if (invalidDraftImages || orphanedPaste || (draftKey && hydratedDraftKey !== draftKey) || persistenceStatus === "conflict") return;
    const msg = splicePastedTexts(value, pastedTexts).trim();
    if (!msg && !attachedImages.length) return;
    if (attachedImages.length) return;
    if (preparingRef.current) return;
    preparingRef.current = true; setPreparationError("");
    try {
      const original = JSON.stringify(snapshotRef.current());
      const prepared = await prepare();
      if (draftKeyRef.current !== draftKey) return;
      const streamingBehavior = mode === "steer" ? "steer" : "followUp";
      if (msg.startsWith("/") && onPromptWithStreamingBehavior) onPromptWithStreamingBehavior(prepared.text, streamingBehavior);
      else if (mode === "steer" && onSteer) onSteer(prepared.text);
      else if (onFollowUp) onFollowUp(prepared.text);
      if (JSON.stringify(snapshotRef.current()) === original) clearInput();
    } catch (e) { setPreparationError(String(e)); } finally { preparingRef.current = false; }
  }, [invalidDraftImages, orphanedPaste, draftKey, hydratedDraftKey, persistenceStatus, value, pastedTexts, attachedImages, onPromptWithStreamingBehavior, onSteer, onFollowUp, clearInput, prepare]);

  const getNextSlashIndex = useCallback((direction: "up" | "down" | "left" | "right") => {
    const lastIndex = displayedSlashCommands.length - 1;
    if (lastIndex < 0) return 0;

    if (direction === "left") return Math.max(0, slashActiveIndex - 1);
    if (direction === "right") return Math.min(lastIndex, slashActiveIndex + 1);

    const currentNode = slashItemRefs.current[slashActiveIndex];
    if (!currentNode) {
      return direction === "down"
        ? Math.min(lastIndex, slashActiveIndex + 1)
        : Math.max(0, slashActiveIndex - 1);
    }

    const currentRect = currentNode.getBoundingClientRect();
    const currentX = currentRect.left + currentRect.width / 2;
    const currentY = currentRect.top + currentRect.height / 2;
    let bestIndex = -1;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let index = 0; index <= lastIndex; index += 1) {
      if (index === slashActiveIndex) continue;
      const node = slashItemRefs.current[index];
      if (!node) continue;
      const rect = node.getBoundingClientRect();
      const candidateY = rect.top + rect.height / 2;
      const verticalDelta = candidateY - currentY;
      if (direction === "down" ? verticalDelta <= 4 : verticalDelta >= -4) continue;

      const candidateX = rect.left + rect.width / 2;
      const score = Math.abs(verticalDelta) * 1000 + Math.abs(candidateX - currentX);
      if (score < bestScore) {
        bestIndex = index;
        bestScore = score;
      }
    }

    if (bestIndex >= 0) return bestIndex;
    return direction === "down"
      ? Math.min(lastIndex, slashActiveIndex + 1)
      : Math.max(0, slashActiveIndex - 1);
  }, [displayedSlashCommands.length, slashActiveIndex]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      const nativeEvent = e.nativeEvent;
      const recentlyComposed = Date.now() - lastCompositionEndAtRef.current < COMPOSITION_END_ENTER_GRACE_MS;
      const isComposing =
        isComposingRef.current ||
        nativeEvent.isComposing ||
        nativeEvent.keyCode === 229;

      if (e.key === "Enter" && !e.shiftKey && (isComposing || recentlyComposed)) {
        if (recentlyComposed) e.preventDefault();
        return;
      }

      if (historyMenuOpen && !isComposing) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setHistoryActiveIndex((i) => Math.min(Math.max(0, inputHistory.length - 1), i + 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setHistoryActiveIndex((i) => Math.max(0, i - 1));
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setHistoryMenuOpen(false);
          return;
        }
        if ((e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) && inputHistory[historyActiveIndex]) {
          e.preventDefault();
          applyHistoryInput(inputHistory[historyActiveIndex]);
          return;
        }
      }

      if (slashMenuOpen && slashQuery !== null) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSlashActiveIndex(getNextSlashIndex("down"));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSlashActiveIndex(getNextSlashIndex("up"));
          return;
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          setSlashActiveIndex(getNextSlashIndex("right"));
          return;
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          setSlashActiveIndex(getNextSlashIndex("left"));
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setSlashMenuOpen(false);
          return;
        }
        if ((e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) && displayedSlashCommands[slashActiveIndex]) {
          e.preventDefault();
          applySlashCommand(displayedSlashCommands[slashActiveIndex]);
          return;
        }
      }

      // @ file menu — skip while composing so IME candidate navigation
      // (arrows/Enter/Tab) is never intercepted.
      if (hashMenuOpen && hashQuery !== null && !isComposing) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setHashActiveIndex((i) => Math.min(Math.max(0, hashMatches.length - 1), i + 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setHashActiveIndex((i) => Math.max(0, i - 1));
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setHashMenuOpen(false);
          return;
        }
        if ((e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) && hashMatches[hashActiveIndex]) {
          e.preventDefault();
          applyHashCompletion(hashMatches[hashActiveIndex]);
          return;
        }
      }

      if (atMenuOpen && atQuery !== null && !isComposing) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setAtActiveIndex((i) => Math.min(Math.max(0, atMatches.length - 1), i + 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setAtActiveIndex((i) => Math.max(0, i - 1));
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setAtMenuOpen(false);
          return;
        }
        if ((e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) && atMatches[atActiveIndex]) {
          e.preventDefault();
          applyAtCompletion(atMatches[atActiveIndex]);
          return;
        }
      }

      if (e.key === "ArrowUp" && !isComposing && !isStreaming && inputHistory.length > 0 && value.trim().length === 0) {
        e.preventDefault();
        setSlashMenuOpen(false);
        setAtMenuOpen(false);
        setHashMenuOpen(false);
        setHistoryActiveIndex(inputHistory.length - 1);
        setHistoryMenuOpen(true);
        return;
      }

      // Esc stops the agent when no slash/@/history menu or IME composition is active.
      if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector('[role="dialog"], [role="menu"]') && !isComposing && isStreaming && onAbort) {
        e.preventDefault();
        onAbort();
        return;
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (isStreaming && (onSteer || onFollowUp)) {
          // Enter queues a non-interrupting follow-up; Ctrl/Cmd+Enter is the
          // explicit steer (interrupts the current run).
          if ((e.ctrlKey || e.metaKey) && onSteer) sendQueued("steer");
          else sendQueued(onFollowUp ? "followup" : "steer");
        } else {
          handleSend();
        }
      }
    },
    [isStreaming, onSteer, onFollowUp, onAbort, slashMenuOpen, slashQuery, displayedSlashCommands, slashActiveIndex, applySlashCommand, sendQueued, handleSend, getNextSlashIndex, hashMenuOpen, hashQuery, hashMatches, hashActiveIndex, applyHashCompletion, atMenuOpen, atQuery, atMatches, atActiveIndex, applyAtCompletion, historyMenuOpen, inputHistory, historyActiveIndex, applyHistoryInput, value]
  );

  const handleInput = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));
    if (imageItems.length) {
      e.preventDefault();
      const files = imageItems.map((item) => item.getAsFile()).filter((f): f is File => f !== null);
      processImageFiles(files);
      return;
    }
    // Large plain-text pastes become a compact chip so the composer stays
    // readable; spliced back as a fenced block on send. Skipped in bash mode:
    // a fence glued into a shell command would corrupt it.
    const text = e.clipboardData?.getData("text/plain") ?? "";
    if (!bashMode && shouldChipPastedText(text)) {
      e.preventDefault();
      insertPastedTextChip(normalizePastedText(text));
      return;
    }
    // WebKitGTK (Linux) delivers an empty clipboardData.items list on paste
    // even when the clipboard holds an image (WebKit bug 320303). Fall back to
    // the Tauri clipboard-manager readImage() only in the desktop shell, and
    // only when the browser gave us nothing — so plain-text paste is untouched.
    if (items.length === 0) {
      e.preventDefault();
      void import("@/lib/desktop-native").then(({ readClipboardImageFileNative }) =>
        readClipboardImageFileNative(),
      ).then((file) => {
        if (file) processImageFiles([file]);
      }).catch(() => {
        /* ignore — nothing to paste */
      });
    }
  }, [processImageFiles, bashMode, insertPastedTextChip]);

  useEffect(() => {
    if (slashQuery === null) {
      setSlashMenuOpen(false);
      setSlashActiveIndex(0);
      slashCommandsRequestedRef.current = false;
      return;
    }
    setSlashMenuOpen(true);
    setSlashActiveIndex(0);
    if (!slashCommandsRequestedRef.current && onLoadSlashCommands) {
      slashCommandsRequestedRef.current = true;
      Promise.resolve(onLoadSlashCommands()).catch(() => {
        slashCommandsRequestedRef.current = false;
      });
    }
  }, [slashQuery, onLoadSlashCommands]);

  // Lazy-load skill dormancy (disable-model-invocation) each time the slash
  // palette opens, so toggles made in the skills panel are reflected on the
  // next open. Failures degrade silently to the unannotated palette.
  useEffect(() => {
    if (!slashMenuOpen || !cwd) return;
    const requestCwd = cwd;
    let cancelled = false;
    setSkillDormancyState({ cwd: requestCwd, values: {} });
    fetch(`/api/skills?cwd=${encodeURIComponent(requestCwd)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`skills fetch failed: ${res.status}`);
        return res.json() as Promise<Partial<SkillsResponse>>;
      })
      .then((data) => {
        if (cancelled) return;
        const dormancy: Record<string, boolean> = {};
        for (const skill of data.skills ?? []) dormancy[skill.name] = skill.disableModelInvocation;
        setSkillDormancyState({ cwd: requestCwd, values: dormancy });
      })
      .catch(() => {
        if (!cancelled) setSkillDormancyState({ cwd: requestCwd, values: {} });
      });
    return () => {
      cancelled = true;
    };
  }, [slashMenuOpen, cwd]);

  useEffect(() => {
    if (slashActiveIndex >= displayedSlashCommands.length) {
      setSlashActiveIndex(Math.max(0, displayedSlashCommands.length - 1));
    }
  }, [displayedSlashCommands.length, slashActiveIndex]);

  useEffect(() => {
    slashItemRefs.current.length = displayedSlashCommands.length;
  }, [displayedSlashCommands.length]);

  useEffect(() => {
    if (!slashMenuOpen) return;
    slashItemRefs.current[slashActiveIndex]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [slashActiveIndex, slashMenuOpen]);

  // Build model options: prefer modelList (has provider info), fallback to modelNames
  const modelOptions: ModelOption[] = (() => {
    if (modelList && modelList.length > 0) {
      return modelList.map((m) => ({ provider: m.provider, modelId: m.id, name: m.name })).sort(compareModelOptions);
    }
    return Object.entries(modelNames ?? {}).map(([modelId, name]) => ({
      provider: model?.provider ?? "unknown",
      modelId,
      name,
    })).sort(compareModelOptions);
  })();
  const filteredModelOptions = filterModelOptions(modelOptions, modelFilter);
  const showModelFilter = modelOptions.length > MODEL_FILTER_THRESHOLD;

  // Group options by provider, preserving insertion order
  const modelsByProvider: { provider: string; options: ModelOption[] }[] = [];
  for (const opt of filteredModelOptions) {
    const group = modelsByProvider.find((g) => g.provider === opt.provider);
    if (group) group.options.push(opt);
    else modelsByProvider.push({ provider: opt.provider, options: [opt] });
  }

  const displayModelName = model
    ? (modelOptions.find((o) => o.modelId === model.modelId && o.provider === model.provider)?.name ?? model.modelId)
    : null;
  const currentName = displayModelName;

  const compactSavedTokens = compactResult
    ? Math.max(0, compactResult.tokensBefore - compactResult.estimatedTokensAfter)
    : 0;
  const compactResultText = compactResult
    ? `${compactResult.reason && compactResult.reason !== "manual" ? `${compactResult.reason[0].toUpperCase()}${compactResult.reason.slice(1)} ` : t("chat.compacted")} ${formatTokenCount(compactResult.tokensBefore)} -> ${formatTokenCount(compactResult.estimatedTokensAfter)} tokens (${t("chat.tokensSaved", { saved: formatTokenCount(compactSavedTokens) })})`
    : null;
  const thinkingDisplayLabel = (() => {
    const lvl = thinkingLevel ?? "auto";
    if (lvl === "auto" || !thinkingLevelMap) return lvl;
    return thinkingLevelMap[lvl] ?? lvl;
  })();
  const toolPresetLabel = Object.entries(TOOL_PRESET_MAP).find(([, v]) => v === (toolPreset ?? "default"))?.[0] ?? "default";

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        modelDropdownPanelRef.current && !modelDropdownPanelRef.current.contains(e.target as Node)
      ) {
        setModelDropdownOpen(false);
        setModelFilter("");
      }
      if (toolDropdownRef.current && !toolDropdownRef.current.contains(e.target as Node)) {
        setToolDropdownOpen(false);
      }
      if (thinkingDropdownRef.current && !thinkingDropdownRef.current.contains(e.target as Node)) {
        setThinkingDropdownOpen(false);
      }
      if (controlsMenuRef.current && !controlsMenuRef.current.contains(e.target as Node)) {
        setControlsMenuOpen(false);
      }
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(e.target as Node)) {
        setProjectDropdownOpen(false);
        setProjectPathTip(null);
      }
      if (historyMenuRef.current && !historyMenuRef.current.contains(e.target as Node) && !textareaRef.current?.contains(e.target as Node)) {
        setHistoryMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!isNarrow) setControlsMenuOpen(false);
  }, [isNarrow]);



  return (
    <div
      className="chat-input-shell"
    >
      <div className="chat-composer-wrap">
        <ModelErrorBanner error={modelError} />
        <ModelScopeWarningBanner
          warnings={modelScopeWarnings}
          onDismiss={onDismissModelScopeWarnings}
          dismissLabel={t("chat.modelScopeDismiss")}
          onOpenModelsConfig={onOpenModelsConfig}
        />
        {/* Queued steering / follow-up messages (delivered by pi on upcoming turns) */}
        {((queuedMessages?.steering.length ?? 0) + (queuedMessages?.followUp.length ?? 0)) > 0 && (
          <div className="composer-queue-strip">
            <div className="composer-queue-header">
              <span className="composer-queue-label">
                {t("chat.queued", { count: (queuedMessages?.steering.length ?? 0) + (queuedMessages?.followUp.length ?? 0) })}
              </span>
              {onRecallQueue && (
                <button
                  onClick={onRecallQueue}
                   title={t("chat.recallTitle")}
                  className="composer-queue-recall"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 14 4 9 9 4" />
                    <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
                  </svg>
                   {t("chat.recall")}
                </button>
              )}
            </div>
            {queuedMessages?.steering.map((text, i) => (
              <QueuedMessageRow key={`steer-${i}`} kind="steer" label={t("chat.steer")} text={text} />
            ))}
            {queuedMessages?.followUp.map((text, i) => (
              <QueuedMessageRow key={`followup-${i}`} kind="follow-up" label={t("chat.followUp")} text={text} />
            ))}
          </div>
        )}
        {/* Retry banner */}
        {retryInfo && (
          <div className="composer-retry-banner">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="composer-icon">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
             {t("chat.retrying", { attempt: retryInfo.attempt, max: retryInfo.maxAttempts })}{retryInfo.errorMessage && <span className="composer-status-detail">— {retryInfo.errorMessage}</span>}
          </div>
        )}
        {compactResultText && (
          <div className="composer-compact-banner">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="composer-icon">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {compactResultText}
          </div>
        )}
        {compactError && (
          <div
            role="alert"
            className="composer-compact-alert"
          >
            {compactError}
          </div>
        )}
        {/* Main input */}
        <div className="composer-input-anchor">
          {historyMenuOpen && inputHistory.length > 0 && (
            <div
              ref={historyMenuRef}
              className="native-popover composer-completion-popover is-history"
            >
              <div
                title={t("chat.inputHistory")}
                className="composer-history-header"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 12a9 9 0 1 0 3-6.7" />
                  <path d="M3 4v5h5" />
                  <path d="M12 7v5l3 2" />
                </svg>
              </div>
              <div className="composer-completion-body is-history">
                {inputHistory.map((item, index) => {
                  const active = index === historyActiveIndex;
                  return (
                    <button
                      key={`${index}:${item}`}
                      ref={(node) => {
                        historyItemRefs.current[index] = node;
                      }}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applyHistoryInput(item);
                      }}
                      onMouseEnter={() => setHistoryActiveIndex(index)}
                      className={`composer-history-item${active ? " is-active" : ""}`}
                    >
                      <span className="composer-history-index">
                        {index + 1}
                      </span>
                      <span className="composer-clamp-2">
                        {item}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {slashMenuOpen && slashQuery !== null && (
            <div
              className="native-popover composer-completion-popover is-slash"
            >
              <div
                className="composer-completion-header"
              >
                 <span>{slashCommandsLoading ? t("chat.loadingCommands") : t("chat.slashCommands", { label: slashCommandCountLabel })}</span>
                 <span className="composer-completion-hint">{t("chat.tabEnter")}</span>
              </div>
              <div className="composer-completion-body is-slash">
                {!slashCommandsLoading && filteredSlashCommands.length === 0 ? (
                  <div className="composer-slash-empty">
                     {t("chat.noCommands")}
                  </div>
                ) : (
                  groupedSlashCommands.map((group) => (
                    <section key={group.source} className="composer-slash-group">
                      <div
                        className="composer-slash-group-header"
                      >
                           <span>{t(SLASH_SOURCE_GROUP_LABEL_KEYS[group.source])}</span>
                        <span className="composer-slash-count">{group.items.length}</span>
                      </div>
                      <div
                        className="composer-slash-grid"
                      >
                        {group.items.map(({ command, index }) => {
                          const active = index === slashActiveIndex;
                          const dormant = isDormantSkillCommand(command, skillDormancy);
                          return (
                            <button
                              key={`${command.source}:${command.name}`}
                              ref={(node) => {
                                slashItemRefs.current[index] = node;
                              }}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                applySlashCommand(command);
                              }}
                              onMouseEnter={() => setSlashActiveIndex(index)}
                              className={`composer-slash-item${active ? " is-active" : ""}`}
                            >
                              <span className={`composer-slash-name${dormant ? " is-dormant" : ""}`}>
                                /{command.name}
                                {dormant && (
                                  <span className="composer-slash-dormant">
                                    {t("chat.dormant")}
                                  </span>
                                )}
                              </span>
                               {command.description && (
                                <span className="composer-slash-desc">
                                   {getSlashDescription(command, t)}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ))
                )}
              </div>
            </div>
          )}
          {hashMenuOpen && hashQuery !== null && (() => {
            const matchCountLabel = hashMatches.length === 1 ? t("chat.match") : t("chat.matches", { count: hashMatches.length });
            return (
              <div
                className="native-popover composer-completion-popover is-front"
              >
                <div className="composer-completion-header">
                  <span>{sessionIndex ? t("chat.sessions", { label: matchCountLabel }) : t("chat.loadingSessions")}</span>
                  <span className="composer-completion-hint">{t("chat.tabEnter")}</span>
                </div>
                <div className="composer-completion-body">
                  {!sessionIndex ? (
                    <div className="composer-completion-empty">{t("chat.loadingSessions")}</div>
                  ) : hashMatches.length === 0 ? (
                    <div className="composer-completion-empty">{t("chat.noMatchingSessions")}</div>
                  ) : hashMatches.map((entry, index) => {
                    const active = index === hashActiveIndex;
                    const name = entry.name?.trim() || entry.firstMessage.trim() || t("chat.untitledSession");
                    return (
                      <button
                        key={`session:${entry.id}`}
                        ref={(node) => {
                          hashItemRefs.current[index] = node;
                        }}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          applyHashCompletion(entry);
                        }}
                        onMouseEnter={() => setHashActiveIndex(index)}
                        className={`composer-completion-item is-session${active ? " is-active" : ""}`}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                        </svg>
                        <span className="composer-ellipsis">
                          <span className="composer-session-name">{name}</span>
                          <span className="composer-session-sub">{entry.firstMessage}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          {atMenuOpen && atQuery !== null && (() => {
            const indexLoading = fileIndexLoading && (!fileIndex || fileIndex.cwd !== cwd);
             const matchCountLabel = atMatches.length === 1 ? t("chat.match") : t("chat.matches", { count: atMatches.length });
            // With a truncated index, local results are provisional — the
            // debounced server search over the full listing replaces them.
            const truncatedHint = fileIndex?.truncated && !serverResultInUse
               ? (atQuery.query ? t("chat.searchingAll") : t("chat.indexTruncated"))
              : "";
            return (
              <div
                className="native-popover composer-completion-popover"
              >
                <div
                  className="composer-completion-header"
                >
                  <span>
                    {indexLoading ? t("chat.loadingFiles") : t("chat.files", { label: matchCountLabel, hint: truncatedHint })}
                  </span>
                   <span className="composer-completion-hint">{t("chat.tabEnter")}</span>
                </div>
                <div className="composer-completion-body">
                  {!indexLoading && atMatches.length === 0 ? (
                    <div className="composer-completion-empty">
                       {needsServerSearch && !serverResultInUse ? t("chat.searching") : t("chat.noMatchingFiles")}
                    </div>
                  ) : (
                    atMatches.map((entry, index) => {
                      const active = index === atActiveIndex;
                      const name = entry.path.split("/").pop() ?? entry.path;
                      const dirPrefix = entry.path.slice(0, entry.path.length - name.length);
                      return (
                        <button
                          key={`${entry.isDir ? "d" : "f"}:${entry.path}`}
                          ref={(node) => {
                            atItemRefs.current[index] = node;
                          }}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            applyAtCompletion(entry);
                          }}
                          onMouseEnter={() => setAtActiveIndex(index)}
                          className={`composer-completion-item is-file${active ? " is-active" : ""}`}
                        >
                          <span className="composer-completion-icon">
                            {entry.isDir ? <FolderIcon size={14} /> : getFileIcon(name, 14)}
                          </span>
                          <span className="composer-ellipsis">
                            {dirPrefix && <span className="composer-path-dim">{dirPrefix}</span>}
                            {name}
                            {entry.isDir && <span className="composer-path-dim">/</span>}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })()}
          <div ref={composerRef} className="chat-composer">
          {draftKey && (persistenceStatus === "pending" || persistenceStatus === "loading") && (
            <DraftSavingIndicator key={draftKey} loading={persistenceStatus === "loading"} />
          )}
          {draftKey && (persistenceStatus === "failed" || persistenceStatus === "conflict") && (
            <div role="status" className="composer-draft-conflict">
              {persistenceStatus === "conflict"
                ? "Draft changed in another tab. Your input is preserved; choose which version to keep."
                : "Draft could not be saved. Keep this tab open and retry."}
              {(persistenceStatus === "failed" || persistenceStatus === "conflict") && (
                <button onClick={() => retryDraft(draftKey)}>Save my version</button>
              )}
              {persistenceStatus === "conflict" && (
                <button onClick={() => void restoreSavedDraft()}>Load saved version</button>
              )}
            </div>
          )}
          {invalidDraftImages && <div role="alert">Some restored images are invalid or exceed the attachment limits. Remove and reattach them before sending.</div>}
          {orphanedPaste && <div role="alert">Pasted text is missing. Paste it again or remove its placeholder before sending.</div>}
          {pastedTexts.length > 0 && (
            <div className="composer-paste-row">
              {pastedTexts.map((chip) => (
                <span
                  key={chip.id}
                  title={chip.content.length > 200 ? `${chip.content.slice(0, 200)}…` : chip.content}
                  className="composer-paste-chip"
                >
                  <span className="composer-ellipsis">{chip.token}</span>
                  <button
                    type="button"
                    onClick={() => removePaste(chip.id)}
                    title={t("chat.removePastedText")}
                    aria-label={t("chat.removePastedText")}
                    className="composer-chip-remove"
                  >
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <line x1="1" y1="1" x2="7" y2="7" /><line x1="7" y1="1" x2="1" y2="7" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}
          {attachedImages.length > 0 && (
            <div className="composer-attachments">
              {attachedImages.map((img, i) => (
                <div key={i} className="composer-attachment">
                  <button
                    type="button"
                    onClick={() => setLightboxSrc(img.previewUrl)}
                    title="View image"
                    aria-label="View image"
                    className="composer-attachment-open"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.previewUrl}
                      alt=""
                      className="composer-attachment-thumb"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeImage(i); }}
                    title="Remove image"
                    aria-label="Remove image"
                    className="composer-chip-remove is-corner"
                  >
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <line x1="1" y1="1" x2="7" y2="7" /><line x1="7" y1="1" x2="1" y2="7" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
          {lightboxSrc && (
            <ImageLightbox src={lightboxSrc} alt="" onClose={() => setLightboxSrc(null)} />
          )}
          <div
            className="chat-composer-editor"
          >
          <textarea
            readOnly={Boolean(draftKey && hydratedDraftKey !== draftKey)}
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setHistoryMenuOpen(false);
              updateAtQuery(e.target.value, e.target.selectionStart);
              updateHashQuery(e.target.value, e.target.selectionStart);
            }}
            onSelect={(e) => {
              const el = e.currentTarget;
              updateAtQuery(el.value, el.selectionStart);
              updateHashQuery(el.value, el.selectionStart);
            }}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => {
              isComposingRef.current = true;
            }}
            onCompositionEnd={(e) => {
              isComposingRef.current = false;
              lastCompositionEndAtRef.current = Date.now();
              const el = e.currentTarget;
              updateAtQuery(el.value, el.selectionStart);
              updateHashQuery(el.value, el.selectionStart);
            }}
            onInput={handleInput}
            onPaste={handlePaste}
            placeholder={
              isStreaming && (onSteer || onFollowUp)
                ? t("chat.steerPlaceholder")
                : isStreaming ? t("chat.agentPlaceholder")
                : isNarrow
                ? (t("chat.messagePlaceholderShort") || "Message…")
                : t("chat.messagePlaceholder")
            }
            rows={1}
            className="composer-textarea"
          />

          {isStreaming ? (
            <div className="composer-send-row">
              {onAbort && (
                <button
                  onClick={onAbort}
                  title={t("chat.stopAgent")}
                  aria-label={t("chat.stopAgent")}
                  className="composer-stop-button"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <rect x="1.5" y="1.5" width="7" height="7" rx="1.5" fill="currentColor" />
                  </svg>
                  {t("chat.stop")}
                </button>
              )}
              <button
                className="native-primary-button composer-send-button"
                onClick={() => {
                  if (isStreaming && (onSteer || onFollowUp)) sendQueued(onFollowUp ? "followup" : "steer");
                  else handleSend();
                }}
                disabled={isStreaming ? !canQueueStreamingMessage : (!value.trim() && !attachedImages.length)}
                title={isStreaming && onFollowUp ? (attachedImages.length ? t("chat.imagesCannotQueue") : t("chat.followUpTitle")) : undefined}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="2" y1="7" x2="11" y2="7" />
                  <polyline points="7.5 3 12 7 7.5 11" />
                </svg>
                {t("chat.send")}
              </button>
            </div>
          ) : (
            <button
              className="native-primary-button composer-send-button"
              onClick={handleSend}
              disabled={!value.trim() && !attachedImages.length}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="2" y1="7" x2="11" y2="7" />
                <polyline points="7.5 3 12 7 7.5 11" />
              </svg>
              {t("chat.send")}
            </button>
          )}
          </div>

        {/* Bash mode status label */}
        {bashMode && (
          <div className={`text-xs px-2 py-1 composer-bash-note${bashExcluded ? " is-muted" : ""}`}>
             {t("chat.shell")} · {bashExcluded ? t("chat.outputLocal") : t("chat.outputModel")}
          </div>
        )}

        {preparationError && <div role="alert">{preparationError}</div>}
        {/* Bottom bar: left | center (context) | right */}
        <div className={`chat-composer-controls${isNarrow ? " is-narrow" : ""}`}>

          {/* LEFT: project context + model selector (idle) or steer/followup toggle (streaming) */}
          <div className="composer-controls-left">
            {projectLabel && (
              <div ref={projectDropdownRef} className="composer-anchor is-static">
                <button
                  type="button"
                  className={`chat-project-context${isCompact ? " is-compact" : ""}`}
                  title={`${t("chat.switchProject")} · ${t("chat.currentProject", { path: projectPath ?? projectLabel })}`}
                  aria-label={t("chat.currentProject", { path: projectPath ?? projectLabel })}
                  aria-haspopup={projectOptions.length > 0 && onProjectChange ? "menu" : undefined}
                  aria-expanded={projectOptions.length > 0 && onProjectChange ? projectDropdownOpen : undefined}
                  onClick={() => {
                    if (projectOptions.length > 0 && onProjectChange) {
                      setProjectPathTip(null);
                      setProjectDropdownOpen((open) => !open);
                    } else onSelectProject?.();
                  }}
                  disabled={!onSelectProject && !(projectOptions.length > 0 && onProjectChange)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
                  </svg>
                  <span>{projectLabel}</span>
                </button>
                {projectDropdownOpen && projectOptions.length > 0 && onProjectChange && (
                  <div
                    className="native-popover composer-project-menu"
                    role="menu"
                    onMouseLeave={() => setProjectPathTip(null)}
                    onScroll={() => setProjectPathTip(null)}
                  >
                    {projectOptions.map((projectRoot) => {
                      const label = getProjectLabel(projectRoot) ?? projectRoot;
                      const isCurrent = projectRoot === projectPath;
                      return (
                        <button
                          key={projectRoot}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setProjectDropdownOpen(false);
                            setProjectPathTip(null);
                            if (!isCurrent) onProjectChange(projectRoot);
                          }}
                          className={`composer-project-option${isCurrent ? " is-current" : ""}`}
                          onMouseEnter={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setProjectPathTip({ path: projectRoot, top: rect.top, left: rect.right + 8 });
                          }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
                          </svg>
                          <span className="composer-ellipsis">{label}</span>
                          {isCurrent && <span className="composer-check">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
                {projectPathTip && projectDropdownOpen && createPortal(
                  (() => {
                    const vh = window.visualViewport?.height ?? window.innerHeight;
                    const top = Math.max(8, Math.min(projectPathTip.top, vh - 40));
                    return (
                      <div
                        role="tooltip"
                        className="composer-path-tooltip"
                        style={{
                          top,
                          left: projectPathTip.left,
                          maxWidth: `calc(100vw - ${projectPathTip.left + 8}px)`,
                          maxHeight: `calc(${vh}px - ${top + 8}px)`,
                        }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="composer-icon">
                          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
                        </svg>
                        <span className="composer-wrap-anywhere">{projectPathTip.path}</span>
                      </div>
                    );
                  })(),
                  document.body,
                )}
              </div>
            )}
            {cwd && onBranchNavigate && <BranchControl key={draftKey} cwd={cwd} onNavigate={onBranchNavigate} />}{sendPreview}
            {/* Model selector — visible always, disabled during streaming */}
            {(modelOptions.length > 0 || currentName || modelError) && onModelChange && (
                <div ref={dropdownRef} className={`composer-anchor composer-model-anchor${isNarrow ? " is-narrow" : ""}`}>
                  <button
                    className={`native-toolbar-button composer-toolbar-chip composer-model-trigger${isNarrow ? " is-narrow" : isCompact ? " is-compact" : ""}${modelDropdownOpen ? " is-open" : ""}`}
                    onClick={(e) => {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setModelDropdownRect({ top: rect.top, left: rect.left, width: rect.width });
                      setModelDropdownOpen((open) => {
                        if (open) setModelFilter("");
                        return !open;
                      });
                    }}
                    disabled={isStreaming}
                    onMouseEnter={(e) => {
                      if (isStreaming) return;
                      e.currentTarget.style.background = "var(--bg-hover)";
                      e.currentTarget.style.color = "var(--text)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = modelDropdownOpen ? "var(--bg-hover)" : "none";
                      e.currentTarget.style.color = "var(--text-muted)";
                    }}
                    title={modelOptions.length > 0 ? "Change model" : "No available models"}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="4" y="4" width="16" height="16" rx="2" />
                      <rect x="9" y="9" width="6" height="6" />
                      <line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" />
                      <line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" />
                      <line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" />
                      <line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" />
                    </svg>
                    <span className="composer-ellipsis">
                      {currentName ?? (modelOptions.length > 0 ? "Select model" : "No models")}
                    </span>
                  </button>
                  {modelDropdownOpen && modelDropdownRect && (() => {
                    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
                    const bottom = viewportHeight - modelDropdownRect.top + 6;
                    const maxH = Math.max(120, Math.min(modelDropdownRect.top - 8, viewportHeight * 0.6));
                    // On mobile, pin to a small left margin and cap width to the
                    // viewport so long model names never push the panel off-screen.
                    const panelPos: React.CSSProperties = isMobile
                      ? { left: 8, right: 8, maxWidth: "calc(100vw - 16px)" }
                      : { left: modelDropdownRect.left, width: "max-content", minWidth: modelDropdownRect.width };
                    return (
                      <div ref={modelDropdownPanelRef} className="native-popover composer-model-panel" style={{ bottom, ...panelPos, maxHeight: maxH }}>
                      {showModelFilter && (
                        <div className="composer-model-filter-row">
                          <input
                            value={modelFilter}
                            onChange={(e) => setModelFilter(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") {
                                setModelFilter("");
                                setModelDropdownOpen(false);
                              }
                            }}
                            placeholder={t("chat.filterModels")}
                            aria-label={t("chat.filterModels")}
                            autoFocus
                            autoComplete="off"
                            spellCheck={false}
                            className={`composer-model-filter-input${isMobile ? " is-mobile" : ""}`}
                          />
                        </div>
                      )}
                      <div className="composer-menu-scroll">
                        {modelsByProvider.length === 0 ? (
                          <div className="composer-menu-empty">
                            {modelFilter.trim() ? t("chat.noMatchingModels") : "No available models"}
                          </div>
                        ) : modelsByProvider.map((group, gi) => (
                          <div key={group.provider}>
                            {(modelsByProvider.length > 1) && (
                              <div className={`composer-model-group-header${gi > 0 ? " is-divided" : ""}`}>
                                {group.provider}
                              </div>
                            )}
                            {group.options.map((opt) => {
                              const isActive = opt.modelId === model?.modelId && opt.provider === model?.provider;
                              return (
                                <button
                                  key={`${opt.provider}:${opt.modelId}`}
                                  onClick={() => {
                                    setModelDropdownOpen(false);
                                    setModelFilter("");
                                    if (!isActive || isAutoModelSelection) { setDraftSetup(previous => previous ? { ...previous, model: { provider: opt.provider, modelId: opt.modelId } } : previous); onModelChange(opt.provider, opt.modelId); }
                                  }}
                                  className={`composer-option-row${isActive ? " is-active" : ""}`}
                                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--bg-hover)"; }}
                                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "none"; }}
                                >
                                  {isActive
                                    ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="composer-icon"><polyline points="1.5 5 4 7.5 8.5 2.5" /></svg>
                                    : <span className="composer-check-spacer" />}
                                  {opt.name}
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                    );
                  })()}
                </div>
            )}
            {hasTranscript && <ContextUsageRing contextUsage={contextUsage} sessionStats={sessionStats} onOpenStats={onSessionStatsPanelOpen} />}
            <ExtensionStatusBar statuses={extensionStatuses} />
          </div>

          {/* spacer */}
          {!isNarrow && <div className="composer-controls-spacer" />}

          {/* RIGHT: thinking + tools preset + compact (idle) */}
          <div ref={controlsMenuRef} className={`composer-controls-right${isNarrow ? " is-narrow" : ""}`}>
            {isNarrow && (
              <button
                type="button"
                 title={controlsMenuOpen ? undefined : t("chat.moreControls")}
                 aria-label={t("chat.moreControls")}
                aria-expanded={controlsMenuOpen}
                aria-hidden={controlsMenuOpen || undefined}
                tabIndex={controlsMenuOpen ? -1 : undefined}
                onClick={() => {
                  setModelDropdownOpen(false);
                  setModelFilter("");
                  setControlsMenuOpen(true);
                }}
                className={`composer-more-button${controlsMenuOpen ? " is-hidden" : ""}`}
                onMouseEnter={(e) => {
                  if (controlsMenuOpen) return;
                  e.currentTarget.style.background = "var(--bg-hover)";
                  e.currentTarget.style.color = "var(--text)";
                }}
                onMouseLeave={(e) => {
                  if (controlsMenuOpen) return;
                  e.currentTarget.style.background = "none";
                  e.currentTarget.style.color = "var(--text-muted)";
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="3" cy="8" r="1.25" /><circle cx="8" cy="8" r="1.25" /><circle cx="13" cy="8" r="1.25" /></svg>
              </button>
            )}
            <div className={`composer-controls-group${isNarrow ? " is-narrow" : ""}${controlsMenuOpen ? " is-open" : ""}`}>
            {!isStreaming && onThinkingLevelChange && (
              <div ref={thinkingDropdownRef} className="composer-anchor">
                <button
                  className={`native-toolbar-button composer-toolbar-chip${isCompact && !controlsMenuOpen ? " is-icon-only" : ""}${thinkingDropdownOpen ? " is-open" : ""}`}
                  onClick={() => !isStreaming && setThinkingDropdownOpen((v) => !v)}
                  disabled={isStreaming}
                   title={t("chat.changeReasoning", { level: thinkingDisplayLabel })}
                   aria-label={t("chat.changeReasoningLabel")}
                  onMouseEnter={(e) => {
                    if (isStreaming) return;
                    e.currentTarget.style.background = "var(--bg-hover)";
                    e.currentTarget.style.color = "var(--text)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = thinkingDropdownOpen ? "var(--bg-hover)" : "none";
                    e.currentTarget.style.color = "var(--text-muted)";
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9.5 2A5.5 5.5 0 0 0 4 7.5c0 1.7.78 3.21 2 4.21V14a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-2.29c1.22-1 2-2.51 2-4.21A5.5 5.5 0 0 0 9.5 2z" />
                    <line x1="7" y1="18" x2="12" y2="18" />
                    <line x1="8" y1="21" x2="11" y2="21" />
                  </svg>
                  {(!isCompact || controlsMenuOpen) && <span className="composer-nowrap">{thinkingDisplayLabel}</span>}
                </button>
                {thinkingDropdownOpen && (
                  <div className="native-popover composer-dropdown-panel is-thinking">
                    <div className="composer-menu-scroll">
                    {selectableThinkingLevels(THINKING_LEVELS, availableThinkingLevels, thinkingLevelMap).map((lvl) => {
                      const isActive = (thinkingLevel ?? "auto") === lvl;
                       const desc = t(THINKING_LEVEL_DESC_KEYS[lvl]);
                      const mappedVal = (lvl !== "auto" && thinkingLevelMap) ? thinkingLevelMap[lvl] : undefined;
                      const displayLabel = (mappedVal != null && mappedVal !== lvl) ? mappedVal : lvl;
                      const showOriginal = mappedVal != null && mappedVal !== lvl;
                      return (
                        <button
                          key={lvl}
                          onClick={() => { setThinkingDropdownOpen(false); if (!isActive) { setDraftSetup(previous => previous ? { ...previous, effort: lvl } : previous); onThinkingLevelChange(lvl); } }}
                          className={`composer-option-row${isActive ? " is-active" : ""}`}
                          onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--bg-hover)"; }}
                          onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "none"; }}
                        >
                          {isActive
                            ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="composer-icon"><polyline points="1.5 5 4 7.5 8.5 2.5" /></svg>
                            : <span className="composer-check-spacer" />}
                          <span className="composer-option-label">
                            {displayLabel}
                            {showOriginal && <span className="composer-option-alias">({lvl})</span>}
                          </span>
                          <span className="composer-option-desc">{desc}</span>
                        </button>
                      );
                    })}
                    </div>
                  </div>
                )}
              </div>
            )}
            {!isStreaming && onToolPresetChange && (
              <div ref={toolDropdownRef} className="composer-anchor">
                <button
                  className={`native-toolbar-button composer-toolbar-chip${isCompact && !controlsMenuOpen ? " is-icon-only" : ""}${toolDropdownOpen ? " is-open" : ""}`}
                  onClick={() => !isStreaming && setToolDropdownOpen((v) => !v)}
                  disabled={isStreaming}
                   title={t("chat.changeToolPreset") + `: ${toolPresetLabel}`}
                   aria-label={t("chat.changeToolPreset")}
                  onMouseEnter={(e) => {
                    if (isStreaming) return;
                    e.currentTarget.style.background = "var(--bg-hover)";
                    e.currentTarget.style.color = "var(--text)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = toolDropdownOpen ? "var(--bg-hover)" : "none";
                    e.currentTarget.style.color = "var(--text-muted)";
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                  </svg>
                  {(!isCompact || controlsMenuOpen) && <span className="composer-nowrap">{toolPresetLabel}</span>}
                </button>
                {toolDropdownOpen && (
                  <div className="native-popover composer-dropdown-panel is-tools">
                    <div className="composer-menu-scroll">
                    {TOOL_PRESETS.map((lvl) => {
                      const preset = TOOL_PRESET_MAP[lvl];
                      const isActive = (toolPreset ?? "default") === preset;
                       const desc = lvl === "off" ? t("chat.noTools") : lvl === "default" ? t("chat.builtInTools", { count: 4 }) : t("chat.allBuiltInTools");
                      return (
                        <button
                          key={lvl}
                          onClick={() => { setToolDropdownOpen(false); if (!isActive) { setDraftSetup(previous => previous ? { ...previous, tools: preset } : previous); onToolPresetChange(preset); } }}
                          className={`composer-option-row${isActive ? " is-active" : ""}`}
                          onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--bg-hover)"; }}
                          onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "none"; }}
                        >
                          {isActive
                            ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="composer-icon"><polyline points="1.5 5 4 7.5 8.5 2.5" /></svg>
                            : <span className="composer-check-spacer" />}
                          <span className="composer-option-label">{lvl}</span>
                          <span className="composer-option-desc">{desc}</span>
                        </button>
                      );
                    })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!isStreaming && onCompact && hasTranscript && (
              <div className="composer-anchor">
                {compactError && (
                  <div className="composer-compact-error">
                    {compactError}
                  </div>
                )}
                <button
                  className={`native-toolbar-button composer-compact-button${(isCompact && !controlsMenuOpen) ? " is-icon-only" : ""}${isCompacting ? " is-compacting" : ""}`}
                  onClick={isCompacting ? onAbortCompaction : onCompact}
                  disabled={isStreaming && !isCompacting}
                  onMouseEnter={(e) => {
                    if (isStreaming && !isCompacting) return;
                    e.currentTarget.style.background = isCompacting ? "color-mix(in srgb, var(--danger) 16%, transparent)" : "var(--bg-hover)";
                    e.currentTarget.style.color = isCompacting ? "var(--danger)" : "var(--text)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = isCompacting ? "color-mix(in srgb, var(--danger) 8%, transparent)" : "none";
                    e.currentTarget.style.color = isCompacting ? "var(--danger)" : "var(--text-muted)";
                  }}
                   title={isCompacting ? t("chat.stopCompaction") : t("chat.compactContext")}
                   aria-label={isCompacting ? t("chat.stopCompaction") : t("chat.compactContext")}
                >
                  {isCompacting ? (
                    <><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="2" y="2" width="6" height="6" rx="1" fill="currentColor" /></svg>{(!isCompact || controlsMenuOpen) && <span className="composer-nowrap">{t("chat.compacting")}</span>}</>
                  ) : (
                    <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
                      <line x1="10" y1="14" x2="3" y2="21" /><line x1="21" y1="3" x2="14" y2="10" />
                    </svg>{(!isCompact || controlsMenuOpen) && <span className="composer-nowrap">{t("chat.compact")}</span>}</>
                  )}
                </button>
              </div>
            )}

            {isNarrow && controlsMenuOpen && (
              <button
                type="button"
                 title={t("chat.collapseControls")}
                 aria-label={t("chat.collapseControls")}
                aria-expanded={true}
                onClick={() => {
                  setToolDropdownOpen(false);
                  setThinkingDropdownOpen(false);
                  setControlsMenuOpen(false);
                }}
                className="composer-collapse-button"
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--bg-selected)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--bg-hover)";
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
            </div>
          </div>

          </div>
        </div>
      </div>
    </div>
    </div>
  );
});
