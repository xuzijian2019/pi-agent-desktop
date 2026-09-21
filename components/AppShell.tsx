"use client";
import { TranscriptSearchPanel } from "./workbench/TranscriptSearchPanel";
import type { TranscriptResult } from "@/lib/transcript-search";
import type { TranscriptPreview } from "@/lib/transcript-types";
import { PanelModeSelector } from "./workbench/PanelModeSelector";
import { ActivityPanel } from "./workbench/ActivityPanel";
import { SavedTasksPanel, type TaskSeed } from "./workbench/SavedTasksPanel";
import { NewTaskGuide } from "./workbench/NewTaskGuide";
import { PinnedSection } from "./workbench/PinnedSection";
import { ChangesSection } from "./workbench/ChangesSection";
import { panelMode, type PanelMode } from "@/lib/panel-modes";
import { loadDraft, setDraft, getDraftStatus, type ChatDraft } from "@/lib/draft-store";
import { uiFetch } from "@/lib/web-ui-client";
import { taskPromptFromDraft } from "@/lib/prepare-outgoing";
import type { SavedTask } from "@/lib/task-types";


import { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useGlobalKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { SessionSidebar } from "./SessionSidebar";
import type { AppSlashCommand } from "@/lib/web-slash-commands";
import { ChatWindow } from "./ChatWindow";
import { selectProjectDirectoryNative } from "./ProjectPicker";
import { MissingFolderNotice } from "./MissingFolderNotice";
import type { SidebarProjectActions } from "@/lib/missing-folder";
import type { ChatScrollPosition } from "@/lib/chat-scroll-position";

import { TabBar, type Tab } from "./TabBar";

// Heavy, rarely-used surfaces are code-split out of the main bundle. The
// config modals may never be opened at all; FileViewer drags in markdown +
// syntax highlighting a second time and only matters once a file tab opens.
const FileViewer = dynamic(() => import("./FileViewer").then((m) => m.FileViewer), { ssr: false });
const FileExplorer = dynamic(() => import("./FileExplorer").then((m) => m.FileExplorer), { ssr: false });
const AppSettings = dynamic(() => import("./AppSettings").then((m) => m.AppSettings), { ssr: false });
import { ProjectTrustDialog } from "./ProjectTrustDialog";
import { BranchNavigator, hasSessionBranches } from "./BranchNavigator";
import { UpdateReminder } from "./UpdateReminder";
import { useTheme } from "@/hooks/useTheme";
import { useI18n } from "@/hooks/useI18n";
import { useIsMobile, useIsNarrowMobile } from "@/hooks/useIsMobile";
import { APP_PREF_KEYS, getPrefBool, getPrefJson, setPrefJson } from "@/lib/app-prefs";
import { useViewportHeight } from "@/hooks/useViewportHeight";
import { useResizablePanel } from "@/hooks/useResizablePanel";
import { useDesktopConnection } from "@/lib/desktop-connection";
import { isTauriDesktop, setCloseQuitsNative } from "@/lib/desktop-native";
import { encodeFilePathForApi, getFileName } from "@/lib/file-paths";
import { buildAtMentionText, buildFileAtMentionsText, buildFileLineMentionText } from "@/lib/file-fuzzy";
import { PRODUCT_NAME } from "@/lib/branding";
import { hasForks } from "@/lib/session-forks";
import { resolveInitialNavigation, workspaceFileTabsMatchContext, type PersistedWorkspace } from "@/lib/workspace-state";
import { WindowControls, useDesktopChrome, useWindowDrag } from "./desktop";
import { openFileTab, saveFileViewerState } from "./file-tab-state";
import { SettingsPanel, SettingsSectionIcon } from "./SettingsPanel";
import { SystemPromptPanel } from "./SystemPromptPanel";
import { ToolDefinitionsPanel } from "./ToolDefinitionsPanel";
import { AgentSessionPanel } from "./AgentSessionPanel";
import { TerminalPanel } from "./TerminalPanel";
import { newTerminalTab, restoreTerminalTabs, TERMINAL_TABS_KEY, type TerminalTab } from "./terminal-tab-state";
import { sendAgentCommand } from "@/lib/agent-client";
import { claimExtensionAttentionNotification, shouldShowBrowserNotification, showBrowserNotification } from "@/lib/browser-notifications";
import { setupPushSubscription } from "@/lib/push-client";

import { rekeyDraft } from "@/lib/draft-store";
import { clearLastOpen, getLastOpenSession, setLastOpenSession, workspaceKeyOf } from "@/lib/workspace-memory";
import { getDefaultRightPanelWidth, getRightPanelMaxWidth, getSidebarMaxWidth, MOBILE_MAX_WIDTH, RIGHT_PANEL_FALLBACK_WIDTH, RIGHT_PANEL_MAX_WIDTH, RIGHT_PANEL_MIN_WIDTH, SIDEBAR_DEFAULT_WIDTH, SPLIT_PANEL_MIN_WIDTH, SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from "@/lib/panel-layout";
import type { BlockingExtensionUiRequest, SessionInfo, SessionTreeNode } from "@/lib/types";
import type { ProjectTrustStatus } from "@/lib/api-types";
import type { ChatInputHandle } from "./ChatInput";
import type { FileExplorerHandle } from "./FileExplorer";
import type { SessionStatsInfo } from "@/lib/pi-types";
import type { FileViewerState } from "@/lib/file-viewer-state";
import type { ToolEntry } from "@/lib/tool-presets";
import { getSessionFamily } from "@/lib/session-family";
import { getLastSettingsSection, type SettingsSection } from "@/lib/settings-navigation";

type AutoNameStatus =
  | { kind: "idle" }
  | { kind: "naming" }
  | { kind: "success" }
  | { kind: "error"; message: string };
const TOP_BAR_ICON_BUTTON_SIZE = 36;
// Hover peek for the collapsed sidebar: it stays long enough to aim at a
// session, and closes on its own when the pointer never arrives or leaves.
const SIDEBAR_PEEK_IDLE_MS = 2600;
const SIDEBAR_PEEK_LEAVE_MS = 420;
const FILE_TREE_DEFAULT_WIDTH = 300;
const AGENT_PANEL_WIDTH = 420;
const FILE_TREE_MIN_WIDTH = 220;
const FILE_TREE_MAX_WIDTH = 520;
const FILE_TREE_PREVIEW_MIN_WIDTH = 240;

function parkedNewSessionDraftKey(cwd: string): string {
  return `new:${cwd}`;
}

export function AppShell() {
  const router = useRouter();
  const navigationGeneration = useRef(0);
  const searchParams = useSearchParams();
  const [runFeedback, setRunFeedback] = useState({ running: 0, unread: 0 });
  const [extensionWindowTitle, setExtensionWindowTitle] = useState<{ sessionId: string; title: string } | null>(null);
  const [desktopMode] = useState(() => isTauriDesktop());
  const [persistedWorkspace] = useState(() => (
    getPrefJson<PersistedWorkspace>(APP_PREF_KEYS.workspace)
  ));
  const [initialNavigation] = useState(() => resolveInitialNavigation(searchParams, desktopMode ? persistedWorkspace : null));
  const [workspaceHydrated, setWorkspaceHydrated] = useState(false);
  const { isDark, toggleTheme } = useTheme();
  const { locale, t: translate } = useI18n();
  const isMobile = useIsMobile();
  const isNarrowMobile = useIsNarrowMobile();
  useViewportHeight();

  // Once the user has granted notification permission, register a Web Push
  // subscription so the server can notify backgrounded PWAs (notably iOS,
  // which suspends page JS and never receives the SSE completion event).
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    void setupPushSubscription(locale);
  }, [locale]);
  const [quoteSelectionEnabled, setQuoteSelectionEnabled] = useState(false);
  useEffect(() => {
    try {
      setQuoteSelectionEnabled(localStorage.getItem("pi-quote-selection-enabled") === "true");
    } catch {
      // Browser storage is best-effort.
    }
  }, []);
  const handleQuoteSelectionChange = useCallback((enabled: boolean) => {
    setQuoteSelectionEnabled(enabled);
    try {
      localStorage.setItem("pi-quote-selection-enabled", String(enabled));
    } catch {
      // Keep the current page usable when storage is unavailable.
    }
  }, []);
  const notifiedAttentionRequestIdsRef = useRef(new Set<string>());
  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(null);
  const [fileActionsMenuOpen, setFileActionsMenuOpen] = useState(false);
  const [explorerKey, setExplorerKey] = useState(0);
  const [explorerUploadBusy, setExplorerUploadBusy] = useState(false);
  const fileExplorerRef = useRef<FileExplorerHandle>(null);
  const [fileTreeOpen, setFileTreeOpen] = useState(true);
  const [fileExplorerQuery, setFileExplorerQuery] = useState("");
  const [changesCount, setChangesCount] = useState(0);
  const [changesCollapsed, setChangesCollapsed] = useState(true);
  const fileActionsMenuRef = useRef<HTMLDivElement>(null);
  const [sessionCatalog, setSessionCatalog] = useState<SessionInfo[]>([]);
  const [availableProjectRoots, setAvailableProjectRoots] = useState<string[]>([]);
  const handleSessionsChange = useCallback((sessions: SessionInfo[]) => {
    setSessionCatalog(sessions);
  }, []);
  const sessionsWithSelection = useMemo(() => {
    if (!selectedSession) return sessionCatalog;
    return [
      ...sessionCatalog.filter((session) => session.id !== selectedSession.id),
      selectedSession,
    ];
  }, [selectedSession, sessionCatalog]);
  const activeSessionFamily = useMemo(
    () => getSessionFamily(sessionsWithSelection, selectedSession?.id),
    [selectedSession?.id, sessionsWithSelection],
  );
  const hasSubagentSessions = Boolean(activeSessionFamily?.subagents.length);
  const [runningSessionIds, setRunningSessionIds] = useState<Set<string>>(() => new Set());
  const handleRunningSessionIdsChange = useCallback((ids: Set<string>) => {
    setRunningSessionIds((previous) => {
      if (previous.size === ids.size && [...ids].every((id) => previous.has(id))) return previous;
      return ids;
    });
  }, []);
  // The temporary id distinguishes consecutive fresh composers in one cwd.
  const [newSessionCwd, setNewSessionCwd] = useState<string | null>(null);
  const [newSessionDraftId, setNewSessionDraftId] = useState("initial");
  const activeNewSessionDraftKeyRef = useRef<string | null>(null);
  const [initialCwdStatus, setInitialCwdStatus] = useState<"idle" | "validating" | "ready" | "error">(
    () => initialNavigation.requestedCwd ? "validating" : "idle",
  );
  const [initialCwdError, setInitialCwdError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sessionKey, setSessionKey] = useState(0);
  const sessionScrollPositionsRef = useRef(new Map<string, ChatScrollPosition>());
  const handleSessionScrollPositionChange = useCallback((sessionId: string, position: ChatScrollPosition) => {
    sessionScrollPositionsRef.current.set(sessionId, position);
  }, []);
  const [searchTarget, setSearchTarget] = useState<{ sessionId: string; entryId: string; blockIndex?: number } | null>(null);
  const handleSearchTargetHandled = useCallback((target: { sessionId: string; entryId: string }) => {
    setSearchTarget((current) => current === target ? null : current);
  }, []);
  const [explorerRefreshKey, setExplorerRefreshKey] = useState(0);
  const handleExplorerRefresh = useCallback(() => {
    setExplorerRefreshKey((key) => key + 1);
  }, []);
  const [settingsSection, setSettingsSection] = useState<SettingsSection | null>(null);
  const [modelsRefreshKey, setModelsRefreshKey] = useState(0);
  const [topMoreOpen, setTopMoreOpen] = useState(false);
  const topMoreRef = useRef<HTMLDivElement>(null);
  const [appSettingsOpen, setAppSettingsOpen] = useState(false);
  const [projectTrust, setProjectTrust] = useState<ProjectTrustStatus | null>(null);
  const [projectTrustDialogOpen, setProjectTrustDialogOpen] = useState(false);
  const [projectTrustBusy, setProjectTrustBusy] = useState(false);
  const [projectTrustError, setProjectTrustError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => !initialNavigation.sidebarCollapsed);
  const [sidebarPeek, setSidebarPeek] = useState(false);
  const [sidebarPeekExiting, setSidebarPeekExiting] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [rightPanelMode, setRightPanelMode] = useState<PanelMode>("files");
  // Read by the project-switch effect: only the Files view empties on a project change.
  const rightPanelModeRef = useRef(rightPanelMode); rightPanelModeRef.current = rightPanelMode;
  const [transcriptPreview, setTranscriptPreview] = useState<TranscriptPreview>();
  const closeTranscriptPreview = useCallback(() => setTranscriptPreview(undefined), []);
  const [taskSeed, setTaskSeed] = useState<TaskSeed>();
  const [taskConflict, setTaskConflict] = useState<{ task: SavedTask; cwd: string; draft: ChatDraft; generation: number }>();
  const taskConflictRef = useRef<HTMLDivElement>(null);
  const [workbenchError, setWorkbenchError] = useState("");
  const openMode = useCallback((mode: PanelMode) => { setRightPanelMode(mode); setRightPanelOpen(true); }, []);
  // Pinning no longer switches panels: it opens Files with the Pinned section out.
  const revealPins = useCallback(() => { setPinnedExpanded(true); openMode("files"); }, [openMode]);
  const [reviewFilePath, setReviewFilePath] = useState<string | null>(null);
  const [changesExpanded, setChangesExpanded] = useState(false);
  const [pinnedExpanded, setPinnedExpanded] = useState(false);

  const [rightPanelExpanded, setRightPanelExpanded] = useState(false);
  const rightPanelFullWidth = rightPanelOpen && rightPanelExpanded && !isMobile;
  useEffect(() => {
    if (!rightPanelOpen || isMobile) setRightPanelExpanded(false);
  }, [rightPanelOpen, isMobile]);
  const [mobileToolbarMoreOpen, setMobileToolbarMoreOpen] = useState(false);
  const [mobileSidebarReady, setMobileSidebarReady] = useState(false);
  // The desktop window has no native title bar. macOS keeps its traffic lights
  // and only needs the top bar inset for them; other platforms get the buttons
  // from <WindowControls />, which renders nothing in a browser build.
  const desktopChrome = useDesktopChrome();
  const windowDrag = useWindowDrag();
  const sidebarActionsRef = useRef<SidebarProjectActions | null>(null);
  const sidebarWidthRef = useRef(SIDEBAR_DEFAULT_WIDTH);
  const rightPanelWidthRef = useRef(RIGHT_PANEL_FALLBACK_WIDTH);
  const fileTreeWidthRef = useRef(FILE_TREE_DEFAULT_WIDTH);
  const getResponsiveRightPanelWidth = useCallback(
    () => typeof window === "undefined"
      ? RIGHT_PANEL_FALLBACK_WIDTH
      : getDefaultRightPanelWidth(window.innerWidth),
    [],
  );
  const getResponsiveSidebarMaxWidth = useCallback(
    () => typeof window === "undefined"
      ? SIDEBAR_MAX_WIDTH
      : getSidebarMaxWidth({
        viewportWidth: window.innerWidth,
        rightPanelOpen,
        rightPanelWidth: rightPanelWidthRef.current,
      }),
    [rightPanelOpen],
  );
  const getResponsiveRightPanelMaxWidth = useCallback(
    () => typeof window === "undefined"
      ? RIGHT_PANEL_MAX_WIDTH
      : getRightPanelMaxWidth({
        viewportWidth: window.innerWidth,
        sidebarOpen,
        sidebarWidth: sidebarWidthRef.current,
      }),
    [sidebarOpen],
  );
  const sidebarResizer = useResizablePanel({
    ariaLabel: translate("layout.resizeSidebar"),
    cssVariable: "--sidebar-width",
    defaultWidth: SIDEBAR_DEFAULT_WIDTH,
    getMaxWidth: getResponsiveSidebarMaxWidth,
    growthDirection: "right",
    maxWidth: SIDEBAR_MAX_WIDTH,
    minWidth: SIDEBAR_MIN_WIDTH,
    storageKey: "pi-sidebar-width",
    widthRef: sidebarWidthRef,
  });
  const rightPanelResizer = useResizablePanel({
    ariaLabel: translate("layout.resizeFilePanel"),
    cssVariable: "--right-panel-width",
    defaultWidth: RIGHT_PANEL_FALLBACK_WIDTH,
    getDefaultWidth: getResponsiveRightPanelWidth,
    getMaxWidth: getResponsiveRightPanelMaxWidth,
    growthDirection: "left",
    maxWidth: RIGHT_PANEL_MAX_WIDTH,
    minWidth: RIGHT_PANEL_MIN_WIDTH,
    storageKey: "pi-right-panel-width",
    widthRef: rightPanelWidthRef,
  });
  const getFileTreeMaxWidth = useCallback(
    () => {
      const availablePanelWidth = typeof window === "undefined"
        ? rightPanelWidthRef.current
        : window.innerWidth < MOBILE_MAX_WIDTH
          ? window.innerWidth
          : window.innerWidth < SPLIT_PANEL_MIN_WIDTH
            ? Math.min(560, window.innerWidth - 48)
            : rightPanelWidthRef.current;
      return Math.max(
        FILE_TREE_MIN_WIDTH,
        Math.min(
          FILE_TREE_MAX_WIDTH,
          availablePanelWidth - FILE_TREE_PREVIEW_MIN_WIDTH,
        ),
      );
    },
    [],
  );
  const fileTreeResizer = useResizablePanel({
    ariaLabel: translate("layout.resizeFileTree"),
    cssVariable: "--file-tree-width",
    defaultWidth: FILE_TREE_DEFAULT_WIDTH,
    getMaxWidth: getFileTreeMaxWidth,
    growthDirection: "right", // the tree renders left of its handle (CSS order)
    maxWidth: FILE_TREE_MAX_WIDTH,
    minWidth: FILE_TREE_MIN_WIDTH,
    storageKey: "pi-file-tree-width",
    widthRef: fileTreeWidthRef,
  });
  const reclampSidebarWidth = sidebarResizer.reclampWidth;
  const reclampRightPanelWidth = rightPanelResizer.reclampWidth;
  const reclampFileTreeWidth = fileTreeResizer.reclampWidth;
  const rightPanelWidth = rightPanelResizer.width;
  // On mobile the sidebar is an overlay drawer; hide it by default so the chat
  // is visible on load. Runs once the breakpoint resolves after hydration.
  // The desktop open-state lives in its own ref, so closing the drawer on
  // mobile does not leave the sidebar hidden after resizing back to desktop.
  const desktopSidebarOpenRef = useRef(true);
  useEffect(() => {
    setSidebarOpen(isMobile ? false : desktopSidebarOpenRef.current);
  }, [isMobile]);
  // Close right panel when viewport is too narrow for split-panel layout.
  // Uses matchMedia's change event (not just the rightPanelOpen dependency)
  // so it also fires when an already-open panel's viewport is resized narrow,
  // not only when the panel itself is opened.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(`(max-width: ${SPLIT_PANEL_MIN_WIDTH - 1}px)`);
    const checkWidth = () => {
      if (mql.matches) setRightPanelOpen(false);
    };
    checkWidth();
    mql.addEventListener("change", checkWidth);
    return () => mql.removeEventListener("change", checkWidth);
  }, []);
  useEffect(() => {
    setMobileSidebarReady(true);
  }, []);
  useEffect(() => {
    if (!rightPanelOpen) return;
    reclampSidebarWidth();
    reclampRightPanelWidth();
    reclampFileTreeWidth();
  }, [reclampFileTreeWidth, reclampRightPanelWidth, reclampSidebarWidth, rightPanelOpen, rightPanelWidth]);
  const [sideModeOpen, setSideModeOpen] = useState(false);
  const chatInputRef = useRef<ChatInputHandle | null>(null);
  const [pendingQuotePrompt, setPendingQuotePrompt] = useState<{ sessionId: string; text: string } | null>(null);
  const topBarRef = useRef<HTMLDivElement>(null);
  const mobileToolbarRef = useRef<HTMLDivElement>(null);
  // Branch navigator state — populated by ChatWindow via onBranchDataChange
  const [branchTree, setBranchTree] = useState<SessionTreeNode[]>([]);
  const [branchActiveLeafId, setBranchActiveLeafId] = useState<string | null>(null);
  const branchLeafChangeFnRef = useRef<((leafId: string | null) => void) | null>(null);
  const sessionHasBranches = hasSessionBranches(branchTree);

  const handleBranchDataChange = useCallback((tree: SessionTreeNode[], activeLeafId: string | null, onLeafChange: (leafId: string | null) => void) => {
    setBranchTree(tree);
    setBranchActiveLeafId(activeLeafId);
    branchLeafChangeFnRef.current = onLeafChange;
  }, []);

  const handleBranchLeafChange = useCallback((leafId: string | null) => {
    branchLeafChangeFnRef.current?.(leafId);
  }, []);

  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);
  const [systemTools, setSystemTools] = useState<ToolEntry[] | null>(null);
  const [systemInfoLoading, setSystemInfoLoading] = useState(false);
  const systemInfoLoaderRef = useRef<(() => Promise<void>) | null>(null);
  const systemInfoLoadIdRef = useRef(0);

  const handleSystemPromptChange = useCallback((prompt: string | null) => {
    setSystemPrompt(prompt);
    setSystemInfoLoading(false);
  }, []);

  const handleSystemToolsChange = useCallback((tools: ToolEntry[] | null) => {
    setSystemTools(tools);
  }, []);

  const handleSystemInfoLoaderChange = useCallback((loader: (() => Promise<void>) | null) => {
    systemInfoLoadIdRef.current += 1;
    systemInfoLoaderRef.current = loader;
    setSystemInfoLoading(false);
  }, []);

  // Session stats (tokens + cost) — populated by ChatWindow, read by the composer context ring
  const [sessionStats, setSessionStats] = useState<SessionStatsInfo | null>(null);
  const [autoNameStatus, setAutoNameStatus] = useState<AutoNameStatus>({ kind: "idle" });
  const autoNameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSessionIdRef = useRef<string | null>(selectedSession?.id ?? null);
  activeSessionIdRef.current = selectedSession?.id ?? null;
  const handleSessionStatsChange = useCallback((stats: SessionStatsInfo | null) => {
    setSessionStats(stats);
  }, []);

  useEffect(() => {
    if (desktopMode) {
      void setCloseQuitsNative(getPrefBool(APP_PREF_KEYS.closeQuits, false));
    }
  }, [desktopMode]);

  // Single active panel — only one dropdown open at a time
  const [activeTopPanel, setActiveTopPanel] = useState<"agents" | "branches" | "system" | "tools" | null>(null);
  const [topPanelPos, setTopPanelPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const toggleTopPanel = useCallback((panel: "agents" | "branches" | "system" | "tools", keepMobileToolbarOpen = false) => {
    if (isMobile) setSidebarOpen(false);
    setTopMoreOpen(false);
    setActiveTopPanel((cur) => cur === panel ? null : panel);
    if (isMobile && isNarrowMobile && keepMobileToolbarOpen) setMobileToolbarMoreOpen(true);
  }, [isMobile, isNarrowMobile]);

  const handleSystemInfoToggle = useCallback((
    panel: "system" | "tools",
    keepMobileToolbarOpen = false,
  ) => {
    const opening = activeTopPanel !== panel;
    toggleTopPanel(panel, keepMobileToolbarOpen);
    if (!opening || systemInfoLoading) return;

    const load = systemInfoLoaderRef.current;
    if (!load) return;
    const loadId = ++systemInfoLoadIdRef.current;
    setSystemInfoLoading(true);
    void load().catch((error) => {
      console.error("Failed to load system information:", error);
    }).finally(() => {
      if (systemInfoLoadIdRef.current === loadId) {
        setSystemInfoLoading(false);
      }
    });
  }, [activeTopPanel, systemInfoLoading, toggleTopPanel]);

  const handleSidebarToggle = useCallback(() => {
    if (isMobile) setActiveTopPanel(null);
    setSidebarPeek(false);
    setSidebarOpen((open) => {
      const next = !open;
      if (!isMobile) desktopSidebarOpenRef.current = next;
      return next;
    });
  }, [isMobile]);

  // Hover peek: the collapsed sidebar slides over the chat while the pointer is
  // near it, and retreats by itself once the pointer leaves or never arrives.
  const sidebarPeekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sidebarPeekExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdSidebarPeek = useCallback(() => {
    if (sidebarPeekTimerRef.current) clearTimeout(sidebarPeekTimerRef.current);
    sidebarPeekTimerRef.current = null;
  }, []);
  // The peek is an overlay, so it must vanish without animating its width back
  // down: in flow that animation would squeeze the chat for a frame or two.
  const endSidebarPeek = useCallback(() => {
    setSidebarPeekExiting(true);
    setSidebarPeek(false);
    if (sidebarPeekExitTimerRef.current) clearTimeout(sidebarPeekExitTimerRef.current);
    sidebarPeekExitTimerRef.current = setTimeout(() => setSidebarPeekExiting(false), 80);
  }, []);
  const closeSidebarPeekAfter = useCallback((delay: number) => {
    holdSidebarPeek();
    sidebarPeekTimerRef.current = setTimeout(endSidebarPeek, delay);
  }, [endSidebarPeek, holdSidebarPeek]);
  const openSidebarPeek = useCallback(() => {
    setSidebarPeekExiting(false);
    setSidebarPeek(true);
    closeSidebarPeekAfter(SIDEBAR_PEEK_IDLE_MS);
  }, [closeSidebarPeekAfter]);
  useEffect(() => {
    if (sidebarOpen || isMobile) {
      holdSidebarPeek();
      setSidebarPeek(false);
      setSidebarPeekExiting(false);
    }
  }, [sidebarOpen, isMobile, holdSidebarPeek]);
  useEffect(() => () => {
    holdSidebarPeek();
    if (sidebarPeekExitTimerRef.current) clearTimeout(sidebarPeekExitTimerRef.current);
  }, [holdSidebarPeek]);

  const handleRightPanelToggle = useCallback(() => {
    if (isMobile) {
      if (isMobile) setSidebarOpen(false);
      setActiveTopPanel(null);
      setMobileToolbarMoreOpen(false);
    }
    setTopMoreOpen(false);
    setRightPanelOpen((open) => !open);
  }, [isMobile]);

  const handleRightPanelExpandToggle = useCallback(() => {
    setActiveTopPanel(null);
    setRightPanelExpanded((expanded) => !expanded);
  }, []);

  useEffect(() => {
    if (!mobileToolbarMoreOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const toolbar = mobileToolbarRef.current;
      if (toolbar && event.composedPath().includes(toolbar)) return;
      setMobileToolbarMoreOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setMobileToolbarMoreOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [mobileToolbarMoreOpen]);

  useEffect(() => {
    setMobileToolbarMoreOpen(false);
  }, [isMobile, isNarrowMobile, selectedSession?.id, newSessionDraftId]);

  useEffect(() => {
    if (!topMoreOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!topMoreRef.current?.contains(event.target as Node)) setTopMoreOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setTopMoreOpen(false); }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [topMoreOpen]);

  useEffect(() => {
    setTopMoreOpen(false);
  }, [selectedSession?.id]);

  useEffect(() => {
    if (!activeTopPanel) return;

    const handlePointerDown = (event: MouseEvent) => {
      // Panel DOM lives under topBarRef (fixed-position child); treat the whole
      // top bar — including toggle buttons — as inside so toggles stay reliable.
      if (!topBarRef.current?.contains(event.target as Node)) setActiveTopPanel(null);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setActiveTopPanel(null); }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [activeTopPanel]);

  useEffect(() => {
    if (!activeTopPanel || !topBarRef.current) return;
    const update = () => {
      const topBarRect = topBarRef.current!.getBoundingClientRect();
      if (activeTopPanel === "agents") {
        setTopPanelPos({
          top: topBarRect.bottom,
          left: topBarRect.left,
          width: Math.min(AGENT_PANEL_WIDTH, topBarRect.width),
        });
        return;
      }
      setTopPanelPos({ top: topBarRect.bottom, left: topBarRect.left, width: topBarRect.width });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(topBarRef.current);
    return () => ro.disconnect();
  }, [activeTopPanel, isMobile]);

  // Files unmount when inactive; workspace terminals stay mounted until closed.
  const [fileTabs, setFileTabs] = useState<Tab[]>([]);
  const [activeFileTabId, setActiveFileTabId] = useState<string | null>(null);
  // The viewer renders its own controls into this row through a portal, so the
  // panel keeps one toolbar instead of one per component.
  const [viewerControlsSlot, setViewerControlsSlot] = useState<HTMLDivElement | null>(null);
  const [terminalTabs, setTerminalTabs] = useState<TerminalTab[]>([]);
  const [terminalsRestored, setTerminalsRestored] = useState(false);
  const panelTabs: Tab[] = [...fileTabs, ...terminalTabs.map((tab) => ({
    id: tab.id,
    label: getFileName(tab.cwd) || tab.cwd,
    filePath: tab.cwd,
    kind: "terminal" as const,
    closing: Boolean(tab.closing),
  }))];

  useEffect(() => {
    try {
      const saved = restoreTerminalTabs(window.sessionStorage.getItem(TERMINAL_TABS_KEY));
      setTerminalTabs(saved.tabs);
      if (saved.activeId) {
        setActiveFileTabId(saved.activeId);
        setRightPanelOpen(saved.open);
      }
    } catch { /* storage is optional */ }
    setTerminalsRestored(true);
  }, []);

  useEffect(() => {
    if (!terminalsRestored) return;
    try {
      window.sessionStorage.setItem(TERMINAL_TABS_KEY, JSON.stringify({
        tabs: terminalTabs.map(({ id, cwd }) => ({ id, cwd })),
        activeId: activeFileTabId,
        open: rightPanelOpen,
      }));
    } catch { /* storage is optional */ }
  }, [terminalTabs, activeFileTabId, rightPanelOpen, terminalsRestored]);

  const handleFileViewerStateChange = useCallback((
    tabId: string,
    viewerRevision: number,
    viewerState: FileViewerState,
  ) => {
    setFileTabs((prev) => saveFileViewerState(prev, tabId, viewerRevision, viewerState));
  }, []);

  // Same @mention format as the chat input's @ autocomplete, so the agent's
  // read tool resolves it the same way (it strips the @ prefix).
  const handleAtMention = useCallback((relativePath: string, isDir: boolean) => {
    chatInputRef.current?.insertText(buildAtMentionText(relativePath, isDir));
    if (isMobile) { setRightPanelOpen(false); setSidebarOpen(false); }
  }, [isMobile]);

  const handleAtMentions = useCallback((relativePaths: string[]) => {
    const mentions = buildFileAtMentionsText(relativePaths);
    if (mentions) chatInputRef.current?.insertText(mentions);
    if (isMobile) { setRightPanelOpen(false); setSidebarOpen(false); }
  }, [isMobile]);
  useEffect(() => {
    if (!fileActionsMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!fileActionsMenuRef.current?.contains(target)) setFileActionsMenuOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setFileActionsMenuOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => { document.removeEventListener("mousedown", handlePointerDown); document.removeEventListener("keydown", handleEscape); };
  }, [fileActionsMenuOpen]);

  useEffect(() => {
    if (desktopMode) {
      void setCloseQuitsNative(getPrefBool(APP_PREF_KEYS.closeQuits, false));
    }
  }, [desktopMode]);

  const { state: connectionState, retry: retryConnection } = useDesktopConnection();

  const handleFileLineMention = useCallback((relativePath: string, startLine: number, endLine: number) => {
    chatInputRef.current?.insertText(buildFileLineMentionText(relativePath, startLine, endLine));
    if (isMobile) { setRightPanelOpen(false); setSidebarOpen(false); }
  }, [isMobile]);

  const initialSessionId = initialNavigation.sessionId;
  const [activeCwd, setActiveCwd] = useState<string | null>(null);
  const activeProjectKeyRef = useRef<string | null>(null);
  // True once the initial ?session= URL param has been resolved (or confirmed absent)
  const [initialSessionRestored, setInitialSessionRestored] = useState<boolean>(() => !initialSessionId);
  // Suppresses sessionKey bump in handleCwdChange during the initial URL restore
  const suppressCwdBumpRef = useRef(false);
  // Guards the async workspace restore so a slow response from an earlier
  // switch cannot resurrect a session into a project the user already left.
  const workspaceRestoreTokenRef = useRef(0);

  const invalidateWorkspaceRestore = useCallback(() => {
    workspaceRestoreTokenRef.current += 1;
  }, []);

  // Persist every active-session transition, including new and forked sessions
  // that bypass the sidebar selection handler. Transient sessions do not yet
  // carry projectKey, so use the active project identity until hydration.
  useEffect(() => {
    if (!selectedSession) return;
    const projectKey = selectedSession.projectKey
      ?? activeProjectKeyRef.current
      ?? workspaceKeyOf(selectedSession);
    setLastOpenSession(projectKey, selectedSession.id);
  }, [selectedSession]);

  useEffect(() => {
    const requestedCwd = initialNavigation.requestedCwd;
    if (!requestedCwd) return;

    const controller = new AbortController();
    setInitialCwdStatus("validating");
    setInitialCwdError(null);

    void fetch("/api/cwd/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cwd: requestedCwd }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({})) as { cwd?: string; error?: string };
        if (!response.ok || !data.cwd) {
          throw new Error(data.error ?? `HTTP ${response.status}`);
        }

        // The sidebar will notify us when it adopts this cwd. Avoid remounting
        // the just-created empty chat during that initial synchronization.
        suppressCwdBumpRef.current = true;
        const draftId = `initial:${requestedCwd}`;
        setNewSessionDraftId(draftId);
        activeNewSessionDraftKeyRef.current = `new:${data.cwd}`;
        setNewSessionCwd(data.cwd);
        setInitialCwdStatus("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setInitialCwdError(error instanceof Error ? error.message : String(error));
        setInitialCwdStatus("error");
      });

    return () => controller.abort();
  }, [initialNavigation]);

  // Restore the workspace's last open session after switching to it. Called
  // from handleCwdChange once the outgoing context has been reset. The session
  // is looked up against the live list so a deleted or drifted session falls
  // back to the default welcome page instead of erroring.
  const restoreWorkspaceContext = useCallback((projectKey: string, cwd: string) => {
    const token = ++workspaceRestoreTokenRef.current;
    const lastOpenSessionId = getLastOpenSession(projectKey);
    if (!lastOpenSessionId) return;
    void fetch("/api/sessions")
      .then((r) => (r.ok ? (r.json() as Promise<{ sessions: SessionInfo[] }>) : null))
      .then((d) => {
        if (token !== workspaceRestoreTokenRef.current) return; // stale switch
        const s = d?.sessions.find((x) => x.id === lastOpenSessionId);
        if (!s) {
          // The list loaded but the remembered session is gone — forget it.
          // When the list itself failed (d === null) keep the memory so a
          // later switch retries the restore.
          if (d) clearLastOpen(projectKey);
          return;
        }
        if (workspaceKeyOf(s) !== projectKey) {
          // Defensive: the remembered session drifted out of this workspace.
          clearLastOpen(projectKey);
          return;
        }
        // Keep the temporary composer's draft in its cwd, even when the
        // remembered session belongs to another worktree of this project.
        const activeDraftKey = activeNewSessionDraftKeyRef.current;
        if (activeDraftKey) {
          rekeyDraft(activeDraftKey, parkedNewSessionDraftKey(cwd));
        }
        activeNewSessionDraftKeyRef.current = null;
        // Selecting the session must remount the chat with the session
        // present: useAgentSession loads content in a mount-only effect, so
        // the null-session welcome mount from the switch would never load
        // the restored session's messages.
        setSelectedSession(s);
        setSessionKey((k) => k + 1);
        if (new URLSearchParams(window.location.search).get("session") !== s.id) {
          router.replace(`?session=${encodeURIComponent(s.id)}`, { scroll: false });
        }
      })
      .catch(() => {
        // Network hiccup: keep the remembered session for a later retry.
      });
  }, [router]);

  const handleCwdChange = useCallback((
    cwd: string | null,
    projectRoot?: string | null,
    projectKey?: string | null,
  ) => {
    navigationGeneration.current += 1;
    invalidateWorkspaceRestore();
    const currentFreshCwd = newSessionCwd ?? activeCwd;
    setActiveCwd(cwd);
    // Skip if cwd is null (initial mount).
    if (!cwd) return;
    const newProject = projectKey ?? projectRoot ?? cwd;
    const currentProject = activeProjectKeyRef.current
      ?? (selectedSession ? workspaceKeyOf(selectedSession) : null);
    activeProjectKeyRef.current = newProject;

    // Keep the project identity in sync during the initial URL restore without
    // remounting the just-created or restored chat.
    if (suppressCwdBumpRef.current) {
      suppressCwdBumpRef.current = false;
      return;
    }
    // The server may hydrate a normalized key after a custom cwd is already
    // active. Updating identity for the exact same cwd is not a user switch.
    if (currentFreshCwd === cwd && currentProject !== newProject) return;
    // Existing sessions stay open when the worktree selector moves within the
    // same project. A fresh composer must remount when its effective cwd moves,
    // otherwise its already-created runtime would keep sending to the old cwd.
    if (
      currentProject === newProject
      && (selectedSession !== null || currentFreshCwd === cwd)
    ) {
      return;
    }
    // Clicking a session of another project also moves the effective cwd —
    // as a side effect of opening it, not as a project-picker switch. The
    // click has already committed, so `selectedSession` here IS the clicked
    // session: keep it open and only drop file tabs left over from the
    // previous project, instead of blanking the chat into a new session.
    if (selectedSession && (selectedSession.projectRoot ?? selectedSession.cwd) === newProject) {
      setFileTabs([]);
      setActiveFileTabId(null);
      if (rightPanelModeRef.current === "files") setRightPanelOpen(false);
      return;
    }
    // Close any session that belongs to a different project — it no longer
    // matches the selected project directory.
    const previousDraftKey = activeNewSessionDraftKeyRef.current;
    if (previousDraftKey && currentFreshCwd) {
      rekeyDraft(previousDraftKey, parkedNewSessionDraftKey(currentFreshCwd));
    }
    const draftId = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const draftKey = `new:${cwd}`;
    rekeyDraft(parkedNewSessionDraftKey(cwd), draftKey);
    setNewSessionDraftId(draftId);
    activeNewSessionDraftKeyRef.current = draftKey;
    setSelectedSession(null);
    setNewSessionCwd((prev) => {
      if (prev && prev !== cwd) return null;
      return prev;
    });
    setBranchTree([]);
    setBranchActiveLeafId(null);
    setSystemPrompt(null);
    setSystemTools(null);
    setSystemInfoLoading(false);
    setActiveTopPanel(null);
    if (currentProject !== newProject) {
      // File tabs are keyed by absolute path, so tabs opened in the previous
      // project must not linger. Same-project worktree switches keep them.
      setFileTabs([]);
      if (!activeFileTabId || activeFileTabId.startsWith("file:")) {
        setActiveFileTabId(null);
        if (rightPanelModeRef.current === "files") setRightPanelOpen(false);
      }
      // Restore the workspace we switched to: its last open session, or keep
      // the default welcome page when none is remembered.
      restoreWorkspaceContext(newProject, cwd);
    }
    router.replace(typeof window !== "undefined" ? window.location.pathname : "/", { scroll: false });
  }, [activeCwd, activeFileTabId, invalidateWorkspaceRestore, newSessionCwd, router, selectedSession, restoreWorkspaceContext]);

  const handleSelectSession = useCallback((session: SessionInfo, isRestore = false, entryId?: string, blockIndex?: number) => {
    navigationGeneration.current += 1;
    setTranscriptPreview(undefined);
    setSearchTarget(entryId ? { sessionId: session.id, entryId, blockIndex } : null);
    invalidateWorkspaceRestore();
    const activeDraftKey = activeNewSessionDraftKeyRef.current;
    const activeDraftCwd = newSessionCwd ?? (selectedSession === null ? activeCwd : null);
    if (activeDraftKey && activeDraftCwd) {
      rekeyDraft(activeDraftKey, parkedNewSessionDraftKey(activeDraftCwd));
    }
    activeNewSessionDraftKeyRef.current = null;
    // Adopt an explicitly selected session before the sidebar reports its cwd.
    const projectKey = workspaceKeyOf(session);
    if (activeProjectKeyRef.current !== projectKey) {
      setFileTabs([]);
      if (!activeFileTabId || activeFileTabId.startsWith("file:")) {
        setActiveFileTabId(null);
        if (rightPanelModeRef.current === "files") setRightPanelOpen(false);
      }
      setActiveTopPanel(null);
    }
    activeProjectKeyRef.current = projectKey;
    // Re-clicking the already-open session must not remount the chat and
    // re-run the full load/positioning cycle. Only skip when the effective
    // cwd context already matches — otherwise a pending cwd move still needs
    // the full re-select flow.
    if (!isRestore && selectedSession) {
      const sameProject =
        workspaceKeyOf(selectedSession) === workspaceKeyOf(session);
      if (selectedSession.id === session.id && sameProject) {
        if (isMobile) setSidebarOpen(false);
        return;
      }
    }
    setNewSessionCwd(null);
    setSelectedSession(session);
    // Do not bump sessionKey here — ChatWindow stays mounted and swaps
    // session data in place so the fixed input dock does not flash.
    setBranchTree([]);
    setBranchActiveLeafId(null);
    branchLeafChangeFnRef.current = null;
    setSystemPrompt(null);
    setSessionStats(null);
    setActiveTopPanel(null);
    setTopMoreOpen(false);
    setSystemTools(null);
    setSystemInfoLoading(false);
    setInitialSessionRestored(true);
    // On mobile, collapse the overlay drawer so the chat is revealed after pick.
    if (isMobile && !isRestore) setSidebarOpen(false);
    if (isRestore) {
      // Suppress the redundant sessionKey bump that would come from the
      // onCwdChange effect firing after setSelectedCwd in the sidebar
      suppressCwdBumpRef.current = true;
    }
    // Native history preserves the mounted composer. Back/Forward is reconciled below.
    if (!isRestore) {
      window.history.pushState({ ...window.history.state, piSession: session }, "", `?session=${encodeURIComponent(session.id)}`);
    }
  }, [activeCwd, activeFileTabId, invalidateWorkspaceRestore, isMobile, newSessionCwd, selectedSession]);

  const handleNewSession = useCallback((sessionId: string, cwd: string) => {
    invalidateWorkspaceRestore();
    navigationGeneration.current += 1;
    setTranscriptPreview(undefined);
    activeNewSessionDraftKeyRef.current = `new:${cwd}`;
    setNewSessionDraftId(sessionId);
    setSelectedSession(null);
    setNewSessionCwd(cwd);
    // Reset the temporary agent runtime, while the composer restores its
    // persisted new:<cwd> draft even when reopening the same project.
    setSessionKey((key) => key + 1);
    setBranchTree([]);
    setBranchActiveLeafId(null);
    branchLeafChangeFnRef.current = null;
    setSystemPrompt(null);
    setSessionStats(null);
    setActiveTopPanel(null);
    if (isMobile) setSidebarOpen(false);
    window.history.pushState({ ...window.history.state, piSession: null, piCwd: cwd }, "", `?cwd=${encodeURIComponent(cwd)}`);
  }, [invalidateWorkspaceRestore, isMobile]);

  useEffect(() => {
    const restore = async () => {
      const generation = ++navigationGeneration.current;
      const params = new URLSearchParams(window.location.search);
      const id = params.get("session");
      if (!id) {
        setSelectedSession(null);
        setNewSessionCwd(params.get("cwd"));
        setActiveCwd(params.get("cwd"));
        return;
      }
      const saved = window.history.state?.piSession as SessionInfo | undefined;
      if (saved?.id === id) { handleSelectSession(saved, true); return; }
      try {
        const response = await fetch("/api/sessions", { signal: AbortSignal.timeout(10_000) });
        const data = await response.json() as { sessions: SessionInfo[] };
        if (generation !== navigationGeneration.current) return;
        const session = data.sessions.find((item) => item.id === id);
        if (session) handleSelectSession(session, true);
      } catch { if (generation === navigationGeneration.current) window.location.reload(); }
    };
    window.addEventListener("popstate", restore);
    return () => { navigationGeneration.current += 1; window.removeEventListener("popstate", restore); };
  }, [handleSelectSession]);

  const handleProjectsChange = useCallback((projectRoots: string[]) => {
    setAvailableProjectRoots((previous) => (
      previous.length === projectRoots.length && previous.every((root, index) => root === projectRoots[index])
        ? previous
        : projectRoots
    ));
  }, []);

  const handleProjectChangeFromComposer = useCallback((projectRoot: string) => {
    if (selectedSession) return;
    handleNewSession(`project-${Date.now()}`, projectRoot);
  }, [handleNewSession, selectedSession]);

  const handleSelectProjectFromComposer = useCallback(async () => {
    if (!desktopMode) return;
    const generation = ++navigationGeneration.current;
    try {
      const cwd = await selectProjectDirectoryNative(
        selectedSession?.cwd ?? newSessionCwd ?? activeCwd,
        "",
      );
      if (cwd && generation === navigationGeneration.current) handleNewSession(`project-${Date.now()}`, cwd);
    } catch (error) {
      console.error("Failed to switch project:", error);
    }
  }, [desktopMode, selectedSession?.cwd, newSessionCwd, activeCwd, handleNewSession]);

  // Global keyboard shortcuts (handles Esc, Ctrl+Alt+N etc.)
  useGlobalKeyboardShortcuts({
    // Via the sidebar, so a cwd whose folder is gone is redirected to one that exists.
    onNewSession: (cwd: string) => sidebarActionsRef.current?.newSession(cwd),
    activeCwd,
  });

  // Client-built transient SessionInfo (new session / fork) lacks the
  // server-computed projectKey, which the same-project check in
  // handleCwdChange relies on. Hydrate it from the session list so switching
  // worktrees right after creating a session doesn't close the chat.
  const hydrateSelectedSession = useCallback((sessionId: string) => {
    void fetch("/api/sessions", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ sessions: SessionInfo[] }>) : null))
      .then((d) => {
        const full = d?.sessions.find((s) => s.id === sessionId);
        if (!full) return;
        setSelectedSession((prev) => (
          prev?.id === sessionId
            ? { ...prev, ...full, transient: full.transient ?? false }
            : prev
        ));
      })
      .catch(() => {});
  }, []);

  const handleOpenSession = useCallback(async (sessionId: string) => {
    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, { cache: "no-store" });
      const data = await response.json() as { info?: SessionInfo; error?: string };
      if (!response.ok || !data.info) throw new Error(data.error ?? `HTTP ${response.status}`);
      handleSelectSession(data.info);
    } catch (error) {
      console.error("[pi-web] failed to open session:", error instanceof Error ? error.message : error);
    }
  }, [handleSelectSession]);

  // Called by ChatWindow when a new session gets its real id from pi
  const handleSessionCreated = useCallback((session: SessionInfo, sourceDraftKey?: string) => {
    setRefreshKey(key => key + 1);
    if (sourceDraftKey && activeNewSessionDraftKeyRef.current !== sourceDraftKey) return;
    invalidateWorkspaceRestore();
    activeNewSessionDraftKeyRef.current = null;
    setTranscriptPreview(undefined);
    setNewSessionCwd(null);
    setSelectedSession(session);
    hydrateSelectedSession(session.id);
    router.replace(`?session=${encodeURIComponent(session.id)}`, { scroll: false });
  }, [invalidateWorkspaceRestore, router, hydrateSelectedSession]);

  const deliverSessionNotification = useCallback(({
    targetSession,
    title,
    body,
    tag,
  }: {
    targetSession: SessionInfo | null;
    title: string;
    body: string;
    tag?: string;
  }) => {
    if (!("Notification" in window)) return;

    const fire = () => {
      const sessionUrl = targetSession ? `/?session=${encodeURIComponent(targetSession.id)}` : "/";
      void showBrowserNotification({
        title,
        body,
        sessionUrl,
        tag,
        onClick: () => {
          window.focus();
          if (targetSession) handleSelectSession(targetSession);
        },
      });
    };

    if (Notification.permission === "granted") {
      fire();
      void setupPushSubscription(locale);
    } else if (Notification.permission === "default") {
      void Notification.requestPermission().then((p) => {
        if (p === "granted") {
          fire();
          void setupPushSubscription(locale);
        }
      });
    }
  }, [handleSelectSession, locale]);

  const handleAgentEnd = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setExplorerRefreshKey((k) => k + 1);
    if (selectedSession) hydrateSelectedSession(selectedSession.id);

    if (selectedSession?.relation?.kind === "subagent") return;
    if (!shouldShowBrowserNotification()) return;
    const targetSession = selectedSession;
    deliverSessionNotification({
      targetSession,
      title: targetSession?.name ?? translate("i18n.sessionComplete"),
      body: translate("i18n.taskFinished"),
      tag: targetSession ? `pi-session-complete:${targetSession.id}` : "pi-session-complete",
    });
  }, [deliverSessionNotification, hydrateSelectedSession, selectedSession, translate]);

  const handleAttentionNeeded = useCallback((request: BlockingExtensionUiRequest) => {
    if (selectedSession?.relation?.kind === "subagent") return;
    if (!shouldShowBrowserNotification()) return;
    if (!claimExtensionAttentionNotification(request, notifiedAttentionRequestIdsRef.current)) return;

    deliverSessionNotification({
      targetSession: selectedSession,
      title: translate("i18n.attentionNeeded"),
      body: request.method === "custom"
        ? translate("i18n.extensionInputNeeded")
        : request.title,
      tag: `pi-extension-ui:${request.id}`,
    });
  }, [deliverSessionNotification, selectedSession, translate]);

  // Server-side renames (first-prompt auto-title, manual regenerate) arrive as
  // session_info_changed events; mirror them into the sidebar and top bar.
  const handleSessionRenamed = useCallback((sessionId: string, name: string) => {
    setRefreshKey((k) => k + 1);
    setSelectedSession((current) => current?.id === sessionId ? { ...current, name } : current);
    setSessionStats((current) => current?.sessionId === sessionId ? { ...current, sessionName: name } : current);
  }, []);

  const handleAutoName = useCallback(async () => {
    const sessionId = selectedSession?.id;
    if (!sessionId || autoNameStatus.kind === "naming") return;
    setAutoNameStatus({ kind: "naming" });

    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/auto-name`, {
        method: "POST",
      });
      const body = (await response.json().catch(() => ({}))) as { title?: string; error?: string };
      if (!response.ok || !body.title) {
        throw new Error(body.error || `HTTP ${response.status}`);
      }

      const title = body.title.trim();
      setRefreshKey((key) => key + 1);
      if (activeSessionIdRef.current !== sessionId) return;
      setSelectedSession((current) => current?.id === sessionId ? { ...current, name: title } : current);
      setSessionStats((current) => current?.sessionId === sessionId ? { ...current, sessionName: title } : current);
      setAutoNameStatus({ kind: "success" });
      autoNameTimerRef.current = setTimeout(() => setAutoNameStatus({ kind: "idle" }), 1800);
    } catch (error) {
      if (activeSessionIdRef.current !== sessionId) return;
      const message = error instanceof Error ? error.message : String(error);
      setAutoNameStatus({ kind: "error", message });
      autoNameTimerRef.current = setTimeout(() => setAutoNameStatus({ kind: "idle" }), 5000);
    }
  }, [autoNameStatus.kind, selectedSession?.id]);

  useEffect(() => {
    if (autoNameTimerRef.current) clearTimeout(autoNameTimerRef.current);
    setAutoNameStatus({ kind: "idle" });
  }, [selectedSession?.id]);

  const handleSessionForked = useCallback((newSessionId: string) => {
    invalidateWorkspaceRestore();
    activeNewSessionDraftKeyRef.current = null;
    setRefreshKey((k) => k + 1);
    setNewSessionCwd(null);
    setSelectedSession((prev) => ({
      ...(prev ?? { path: "", cwd: "", created: "", modified: "", messageCount: 0, firstMessage: "" }),
      id: newSessionId,
      transient: false,
    }));
    hydrateSelectedSession(newSessionId);
    router.replace(`?session=${encodeURIComponent(newSessionId)}`, { scroll: false });
  }, [invalidateWorkspaceRestore, router, hydrateSelectedSession]);

  const handleAskInNewChat = useCallback(async (
    prompt: string,
    sourceSessionId: string,
    sourceEntryId: string,
  ) => {
    const result = await sendAgentCommand<{ newSessionId?: string }>(sourceSessionId, {
      type: "fork_branch",
      entryId: sourceEntryId,
    });
    if (!result?.newSessionId) throw new Error(translate("chat.quoteForkFailed"));
    setPendingQuotePrompt({ sessionId: result.newSessionId, text: prompt });
    handleSessionForked(result.newSessionId);
  }, [handleSessionForked, translate]);

  const handleInitialRestoreDone = useCallback(() => {
    setInitialSessionRestored(true);
  }, []);

  const handleSessionDeleted = useCallback((sessionId: string) => {
    invalidateWorkspaceRestore();
    setRefreshKey((k) => k + 1);
    if (selectedSession?.id === sessionId) {
      const cwd = selectedSession.cwd;
      const draftId = typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      setNewSessionDraftId(draftId);
      activeNewSessionDraftKeyRef.current = cwd ? `new:${cwd}` : null;
      setSelectedSession(null);
      setNewSessionCwd(cwd ?? null);
      setBranchTree([]);
      setBranchActiveLeafId(null);
      setSystemPrompt(null);
      setSystemTools(null);
      setSystemInfoLoading(false);
      setActiveTopPanel(null);
      router.replace(typeof window !== "undefined" ? window.location.pathname : "/", { scroll: false });
    }
  }, [invalidateWorkspaceRestore, selectedSession, router]);

  const handleOpenFile = useCallback((
    filePath: string,
    fileName: string,
    options?: { sourceSessionId?: string | null; modeHint?: "diff" },
  ) => {
    const sourceSessionId = options?.sourceSessionId;
    const modeHint = options?.modeHint;
    if (modeHint === "diff") {
      setReviewFilePath(filePath); setChangesExpanded(true); setRightPanelMode("files"); setRightPanelOpen(true);
      if (isMobile) setSidebarOpen(false);
      return;
    }
    const tabId = `file:${filePath}`;
    setFileTabs((prev) => openFileTab(prev, {
      fileName,
      filePath,
      modeHint,
      sourceSessionId,
      tabId,
    }));
    setActiveFileTabId(tabId);
    setRightPanelOpen(true);
    setRightPanelMode("files");
    // On mobile the file panel is full-screen; close the drawer so it shows.
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);


  const handleOpenTerminal = useCallback((cwd: string) => {
    const existing = terminalTabs.find((tab) => tab.cwd === cwd);
    const tab = existing ?? newTerminalTab(cwd);
    if (!existing) setTerminalTabs((tabs) => [...tabs, tab]);
    setActiveFileTabId(tab.id);
    setRightPanelMode("files");
    setRightPanelOpen(true);
    if (isMobile) setSidebarOpen(false);
  }, [terminalTabs, isMobile]);

  const handleTerminalClosed = (tab: TerminalTab) => {
    const replacement = tab.closing === "restart" ? newTerminalTab(tab.cwd) : null;
    const remaining = terminalTabs.filter((item) => item.id !== tab.id);
    setTerminalTabs((tabs) => tabs.flatMap((item) => item.id !== tab.id ? [item] : replacement ? [replacement] : []));
    setActiveFileTabId((current) => current !== tab.id ? current : replacement?.id ?? remaining.at(-1)?.id ?? fileTabs.at(-1)?.id ?? null);
    if (!replacement && !remaining.length && !fileTabs.length) setRightPanelOpen(false);
  };

  const handleCloseFileTab = useCallback((tabId: string) => {
    if (terminalTabs.some((tab) => tab.id === tabId)) {
      setTerminalTabs((tabs) => tabs.map((tab) => tab.id === tabId && !tab.closing ? { ...tab, closing: "close" } : tab));
      return;
    }
    setFileTabs((prev) => {
      const next = prev.filter((t) => t.id !== tabId);
      if (next.length === 0 && terminalTabs.length === 0) setRightPanelOpen(false);
      return next;
    });
    setActiveFileTabId((cur) => {
      if (cur !== tabId) return cur;
      const remaining = fileTabs.filter((t) => t.id !== tabId);
      return remaining.at(-1)?.id ?? terminalTabs.at(-1)?.id ?? null;
    });
  }, [fileTabs, terminalTabs]);

  // More → Export HTML. The only entry point to the session HTML export since
  // the "Full history" toolbar button was removed (ui-refresh decision 7).
  const handleExportHtml = useCallback(() => {
    if (!selectedSession) return;
    // Absolute URL so Tauri's open_external_url (http/https only) can hand the
    // page to the system browser for inline viewing — not a save dialog.
    const exportUrl = new URL(
      `/api/sessions/${encodeURIComponent(selectedSession.id)}/export?inline=1`,
      window.location.origin,
    ).href;
    void import("@/lib/desktop-native").then(({ openExternal }) => {
      void openExternal(exportUrl).catch((error) => {
        console.error("Failed to open the session HTML export:", error);
      });
    });
  }, [selectedSession]);

  const handleAppCommand = (command: AppSlashCommand): string | void => {
    switch (command) {
      case "new": {
        const cwd = selectedSession?.cwd ?? newSessionCwd ?? activeCwd;
        if (!cwd) return translate("chat.commandUnavailable");
        handleNewSession("", cwd); return;
      }
      case "resume":
        setSidebarOpen(true);
        requestAnimationFrame(() => sidebarResizer.panelRef.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus());
        return;
      case "tree":
        if (!selectedSession) return translate("chat.commandNeedsSession");
        setActiveTopPanel("branches"); return;
      case "export":
        if (!selectedSession) return translate("chat.commandNeedsSession");
        handleExportHtml(); return;
      case "settings": setAppSettingsOpen(true); return;
      case "login":
      case "logout": setSettingsSection("models"); return;
      case "trust":
        if (!projectTrustCwd) return translate("chat.commandUnavailable");
        setProjectTrustDialogOpen(true); return;
    }
  };

  // Show chat area if a session is selected, or if we have a cwd to start a new session in
  const effectiveNewSessionCwd = newSessionCwd ?? (selectedSession === null && activeCwd ? activeCwd : null);
  const newSessionDraftKey = selectedSession === null && effectiveNewSessionCwd
    ? `new:${effectiveNewSessionCwd}`
    : null;
  useLayoutEffect(() => {
    activeNewSessionDraftKeyRef.current = newSessionDraftKey;
  }, [newSessionDraftKey]);
  const showChat = selectedSession !== null || effectiveNewSessionCwd !== null;
  const projectTrustCwd = selectedSession?.cwd ?? effectiveNewSessionCwd;
  // A deleted folder 403s every cwd-scoped call, so the composer and file tree
  // give way to one calm state. The session list already knows; a new-session
  // cwd falls back to the trust probe, which reports it as a status not an error.
  const activeCwdMissing = selectedSession ? selectedSession.cwdMissing === true : projectTrust?.cwdMissing === true;
  // While restoring initial session from URL, don't show the placeholder
  const showPlaceholder = initialSessionRestored && !showChat;

  const branchNavigate = useCallback((cwd: string) => { handleNewSession("", cwd); }, [handleNewSession]);
  const applySavedTask = useCallback(async (task: SavedTask, cwd: string, append: boolean, generation: number) => {
    const draftKey = `new:${cwd}`;
    if (generation !== navigationGeneration.current) { setTaskConflict(undefined); return; }
    // The active composer is authoritative, including edits not yet persisted.
    // Only an inactive project's draft needs an asynchronous storage read.
    const draft = !selectedSession && effectiveNewSessionCwd === cwd && chatInputRef.current
      ? chatInputRef.current.snapshot()
      : await loadDraft(draftKey);
    if (generation !== navigationGeneration.current || getDraftStatus(draftKey) === "conflict") { setTaskConflict(undefined); return; }
    const setup = { model: task.model ?? draft?.setup?.model ?? null, effort: task.effort === "inherit" ? draft?.setup?.effort ?? "inherit" : task.effort, tools: task.tools === "inherit" ? draft?.setup?.tools ?? "inherit" : task.tools };
    setDraft(draftKey, { value: append && draft?.value ? `${draft.value}\n\n${task.prompt}` : task.prompt, images: append ? draft?.images ?? [] : [], texts: append ? draft?.texts : [], references: append ? draft?.references : {}, setup });
    setTaskConflict(undefined); handleNewSession("", cwd);
  }, [handleNewSession, selectedSession, effectiveNewSessionCwd]);
  const handleSavedTask = useCallback(async (task: SavedTask, revealConflict = false) => {
    const cwd = selectedSession?.cwd ?? effectiveNewSessionCwd;
    if (!cwd) throw new Error(translate("wb.selectProject"));
    const generation = navigationGeneration.current;
    const current = await uiFetch<{ tasks: SavedTask[] }>(`/api/saved-tasks?cwd=${encodeURIComponent(cwd)}`);
    if (!current.tasks.some(t => t.id === task.id && t.revision === task.revision)) throw new Error(translate("wb.taskChanged"));
    const draft = await loadDraft(`new:${cwd}`);
    if (getDraftStatus(`new:${cwd}`) === "conflict") throw new Error(translate("wb.draftConflict"));
    if (generation !== navigationGeneration.current) return;
    if (draft && (draft.value || draft.images.length)) {
      setTaskConflict({ task, cwd, draft, generation });
      if (revealConflict) openMode("tasks");
    }
    else await applySavedTask(task, cwd, false, generation);
  }, [selectedSession, effectiveNewSessionCwd, applySavedTask, translate, openMode]);
  useEffect(() => {
    if (!taskConflict || !rightPanelOpen || rightPanelMode !== "tasks") return;
    requestAnimationFrame(() => taskConflictRef.current?.querySelector<HTMLButtonElement>("button")?.focus());
  }, [taskConflict, rightPanelOpen, rightPanelMode]);
  const handleGuideSavedTask = useCallback((task: SavedTask) => handleSavedTask(task, true), [handleSavedTask]);
  const openTranscriptResult = useCallback(async (result: TranscriptResult, query: string, signal: AbortSignal) => {
    const generation = ++navigationGeneration.current;
    const params = new URLSearchParams({ q: query, session: result.sessionId, entryId: result.entryId, field: result.field });
    const data = await uiFetch<{ session: SessionInfo; target: Omit<TranscriptPreview, "nonce"> }>(`/api/transcript-search?${params}`, undefined, undefined, signal);
    if (generation !== navigationGeneration.current || signal.aborted) return;
    handleSelectSession(data.session);
    setTranscriptPreview({ ...data.target, nonce: generation });
    openMode("search");
  }, [handleSelectSession, openMode]);
  const captureTask = useCallback(() => {
    const input = chatInputRef.current; if (!input) return;
    const draft = input.snapshot();
    const prompt = taskPromptFromDraft(draft);
    setTaskSeed({ nonce: Date.now(), prompt, ...input.currentSetup() }); openMode("tasks");
    if (draft.images.length || Object.keys(draft.references ?? {}).length) setWorkbenchError(translate("wb.taskAttachmentsHint"));
  }, [openMode, translate]);
  useEffect(() => {
    const save = (event: Event) => { const text = (event as CustomEvent).detail.text; const setup = chatInputRef.current?.currentSetup() ?? { model: null, effort: "inherit" as const, tools: "inherit" as const }; setTaskSeed({ nonce: Date.now(), prompt: taskPromptFromDraft({ value: text, images: [] }), ...setup }); openMode("tasks"); };
    const pin = async (event: Event) => { if (!selectedSession) { setWorkbenchError(translate("wb.selectSession")); return; } try { await uiFetch(`/api/sessions/${selectedSession.id}/outputs`, { path: (event as CustomEvent).detail.path, pinned: true, leafId: branchActiveLeafId }); window.dispatchEvent(new Event("pi-output-changed")); revealPins(); } catch (e) { setWorkbenchError(String(e)); } };
    window.addEventListener("pi-save-task-message", save); window.addEventListener("pi-pin-output", pin);
    return () => { window.removeEventListener("pi-save-task-message", save); window.removeEventListener("pi-pin-output", pin); };
  }, [openMode, revealPins, selectedSession, branchActiveLeafId, translate]);
  const openActivitySession = useCallback(async (id: string, focus = false) => {
    const generation = ++navigationGeneration.current;
    try { const data = await uiFetch<{ sessions: SessionInfo[] }>("/api/sessions"); const session = data.sessions.find(s => s.id === id); if (generation !== navigationGeneration.current) return; if (!session) throw new Error(translate("wb.sessionMissing")); handleSelectSession(session); if (focus) requestAnimationFrame(() => chatInputRef.current?.focus()); }
    catch (e) { setWorkbenchError(String(e)); }
  }, [handleSelectSession, translate]);
  const pinActiveOutput = useCallback(async () => {
    const file = fileTabs.find(tab => tab.id === activeFileTabId);
    if (!selectedSession || !file) return;
    try { await uiFetch(`/api/sessions/${selectedSession.id}/outputs`, { path: file.filePath, pinned: true, leafId: branchActiveLeafId }); window.dispatchEvent(new Event("pi-output-changed")); revealPins(); }
    catch (e) { setWorkbenchError(String(e)); }
  }, [selectedSession, fileTabs, activeFileTabId, branchActiveLeafId, revealPins]);
  useEffect(() => {
    const refresh = () => setExplorerRefreshKey(k => k + 1);
    window.addEventListener("pi-git-changed", refresh); return () => window.removeEventListener("pi-git-changed", refresh);
  }, []);

  // Reopen the last file tabs after the cold-start session/cwd restore settles.
  useEffect(() => {
    if (!initialSessionRestored || workspaceHydrated) return;

    const cwd = selectedSession?.cwd ?? newSessionCwd ?? activeCwd;
    const canMatch = workspaceFileTabsMatchContext(
      persistedWorkspace,
      selectedSession?.id ?? null,
      cwd,
    );
    const hasSavedTabs = Boolean(persistedWorkspace?.fileTabs?.length);

    // Wait for sidebar auto-select before giving up on tab restore.
    if (hasSavedTabs && !canMatch && !cwd && !showPlaceholder) return;

    if (canMatch && persistedWorkspace) {
      const tabs: Tab[] = persistedWorkspace.fileTabs.map((tab) => ({
        id: `file:${tab.filePath}`,
        label: tab.label,
        filePath: tab.filePath,
        sourceSessionId: tab.sourceSessionId,
        initialDisplayMode: tab.initialDisplayMode,
      }));
      setFileTabs(tabs);
      const activeId = persistedWorkspace.activeFileTabId;
      setActiveFileTabId((prev) => {
        if (activeId && tabs.some((tab) => tab.id === activeId)) return activeId;
        // Keep a workspace terminal restored from sessionStorage selected.
        if (prev && !prev.startsWith("file:")) return prev;
        return tabs[0]?.id ?? null;
      });
      setRightPanelOpen(Boolean(persistedWorkspace.rightPanelOpen));
    }
    setRightPanelMode(panelMode(persistedWorkspace?.panelMode));
    if (persistedWorkspace?.rightPanelOpen && panelMode(persistedWorkspace.panelMode) !== "files") setRightPanelOpen(true);
    setWorkspaceHydrated(true);
  }, [
    initialSessionRestored,
    desktopMode,
    workspaceHydrated,
    persistedWorkspace,
    selectedSession?.id,
    selectedSession?.cwd,
    newSessionCwd,
    activeCwd,
    showPlaceholder,
  ]);

  // Persist workspace so the next desktop cold start can restore chat + files.
  useEffect(() => {
    if (!workspaceHydrated) return;
    setPrefJson(APP_PREF_KEYS.workspace, {
      sessionId: selectedSession?.id ?? null,
      cwd: selectedSession?.cwd ?? newSessionCwd ?? activeCwd,
      fileTabs: fileTabs.map((tab) => ({
        filePath: tab.filePath,
        label: tab.label,
        sourceSessionId: tab.sourceSessionId,
        initialDisplayMode: tab.initialDisplayMode,
      })),
      activeFileTabId,
      rightPanelOpen,
      panelMode: rightPanelMode,
    } satisfies PersistedWorkspace);
  }, [
    workspaceHydrated,
    desktopMode,
    selectedSession?.id,
    selectedSession?.cwd,
    newSessionCwd,
    activeCwd,
    fileTabs,
    activeFileTabId,
    rightPanelOpen,
    rightPanelMode,
  ]);

  useEffect(() => {
    setProjectTrust(null);
    setProjectTrustDialogOpen(false);
    setProjectTrustError(null);
    if (!projectTrustCwd) return;

    const controller = new AbortController();
    fetch(`/api/project-trust?cwd=${encodeURIComponent(projectTrustCwd)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        // Stale session/workspace cwds (directory deleted since) are expected:
        // degrade to "nothing to trust" instead of a console error.
        if (response.status === 400 || response.status === 404) {
          setProjectTrust(null);
          return;
        }
        const data = await response.json() as ProjectTrustStatus & { error?: string };
        if (!response.ok || data.error) throw new Error(data.error ?? `HTTP ${response.status}`);
        // A cwdMissing payload already reads as "nothing to trust", and keeping
        // it is what tells the chat area the folder is gone.
        setProjectTrust(data);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("Failed to load project trust:", error);
      });
    return () => controller.abort();
  }, [projectTrustCwd]);

  const handleTrustProject = useCallback(async () => {
    if (!projectTrustCwd || projectTrustBusy) return;
    setProjectTrustBusy(true);
    setProjectTrustError(null);
    try {
      const response = await fetch("/api/project-trust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: projectTrustCwd }),
      });
      const data = await response.json() as ProjectTrustStatus & { error?: string };
      if (!response.ok || data.error) throw new Error(data.error ?? `HTTP ${response.status}`);
      setProjectTrust(data);
      setProjectTrustDialogOpen(false);
      setModelsRefreshKey((key) => key + 1);
      setSessionKey((key) => key + 1);
    } catch (error) {
      setProjectTrustError(error instanceof Error ? error.message : String(error));
    } finally {
      setProjectTrustBusy(false);
    }
  }, [projectTrustBusy, projectTrustCwd]);

  const activeFileTab = fileTabs.find((t) => t.id === activeFileTabId) ?? null;
  const newTaskGuide = selectedSession ? undefined : <NewTaskGuide cwd={effectiveNewSessionCwd} onUseTask={handleGuideSavedTask} onOpenTasks={() => openMode("tasks")} />;

  const copyActiveFilePath = useCallback(async () => {
    if (!activeFileTab?.filePath) return;
    await navigator.clipboard?.writeText(activeFileTab.filePath);
    setFileActionsMenuOpen(false);
  }, [activeFileTab?.filePath]);

  const copyActiveFileContent = useCallback(async () => {
    if (!activeFileTab?.filePath) return;
    try {
      const response = await fetch(`/api/files/${encodeFilePathForApi(activeFileTab.filePath)}?type=read`);
      const data = await response.json() as { content?: string; error?: string };
      if (!response.ok || typeof data.content !== "string") throw new Error(data.error ?? `HTTP ${response.status}`);
      await navigator.clipboard?.writeText(data.content);
      setFileActionsMenuOpen(false);
    } catch (error) {
      console.error("Failed to copy file content:", error);
    }
  }, [activeFileTab?.filePath]);
  const activeCwdName = activeCwd ? getFileName(activeCwd) || activeCwd : null;
  const windowTitle = [selectedSession ? (selectedSession.name || selectedSession.firstMessage || "Untitled task").slice(0, 70) : "New task", activeCwdName, PRODUCT_NAME].filter(Boolean).join(" - ");
  const topBarTitle = selectedSession
    ? selectedSession.name || selectedSession.firstMessage || translate("appshell.untitledTask")
    : showChat
      ? translate("appshell.newTask")
      : PRODUCT_NAME;
  const topBarSubtitle = activeCwdName ?? translate("appshell.subtitle");

  useEffect(() => {
    const feedback = (event: Event) => setRunFeedback((event as CustomEvent<{ running: number; unread: number }>).detail);
    const extension = (event: Event) => setExtensionWindowTitle((event as CustomEvent<{ sessionId: string; title: string }>).detail);
    window.addEventListener("pi-run-feedback", feedback);
    window.addEventListener("pi-extension-title", extension);
    return () => { window.removeEventListener("pi-run-feedback", feedback); window.removeEventListener("pi-extension-title", extension); };
  }, []);
  useEffect(() => {
    const prefix = runFeedback.running ? "◉ " : runFeedback.unread ? "● " : "";
    const title = extensionWindowTitle?.sessionId === selectedSession?.id && extensionWindowTitle
      ? `${extensionWindowTitle.title.slice(0, 70)} - ${activeCwdName ?? PRODUCT_NAME}` : windowTitle;
    document.title = `${prefix}${title}`;
  }, [windowTitle, runFeedback, extensionWindowTitle, selectedSession?.id, activeCwdName]);

  // Theme + collapse controls at the sidebar's own top-right (Claude Desktop
  // style). When the sidebar is closed, the topbar shows a reopen button.
  const sidebarHeaderControls = (
    <>
      <button
        className="sidebar-chrome-button"
        onClick={() => toggleTheme()}
        title={isDark ? translate("theme.light") : translate("theme.dark")}
        aria-label={isDark ? translate("theme.light") : translate("theme.dark")}
        aria-pressed={isDark}
      >
        {isDark ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
      </button>
      <button
        className="sidebar-chrome-button"
        onClick={handleSidebarToggle}
        // While peeking the same button pins the sidebar open again.
        title={sidebarOpen ? translate("sidebar.hide") : translate("sidebar.show")}
        aria-label={sidebarOpen ? translate("sidebar.hide") : translate("sidebar.show")}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" />
        </svg>
      </button>
    </>
  );

  const sidebarContent = (
    <>
      <SessionSidebar
        selectedSessionId={selectedSession?.id ?? null}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        initialSessionId={initialSessionId}
        skipInitialProjectSelection={initialNavigation.requestedCwd !== null}
        onInitialRestoreDone={handleInitialRestoreDone}
        refreshKey={refreshKey}
        onSessionDeleted={handleSessionDeleted}
        selectedCwd={selectedSession?.cwd ?? newSessionCwd ?? null}
        onCwdChange={handleCwdChange}
        onProjectsChange={handleProjectsChange}
        actionsRef={sidebarActionsRef}
        headerControls={sidebarHeaderControls}
        onOpenFile={handleOpenFile}
        onOpenTerminal={handleOpenTerminal}
        explorerRefreshKey={explorerRefreshKey}
        onExplorerRefresh={handleExplorerRefresh}
        onAtMention={handleAtMention}
        onAtMentions={handleAtMentions}

        onRunningSessionIdsChange={handleRunningSessionIdsChange}
        onSessionsChange={handleSessionsChange}
      />
      <div className="sidebar-footer" style={{ padding: "8px", flexShrink: 0, display: "flex", justifyContent: "space-between", gap: 4 }}>
        {([
          ["models", translate("common.models")],
          ["skills", translate("common.skills")],
        ] as const).map(([section, label]) => {
          const disabled = section !== "models" && !projectTrustCwd;
          return (
            <button
              key={section}
              type="button"
              onClick={() => setSettingsSection(section)}
              disabled={disabled}
              title={disabled ? translate("settings.projectRequired") : label}
              aria-label={label}
              style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                height: 32, padding: 0, background: "none", border: "none",
                borderRadius: 9, color: "var(--text-muted)", cursor: disabled ? "default" : "pointer",
                fontSize: 12, opacity: disabled ? 0.35 : 1,
                transition: "background 0.12s, color 0.12s",
              }}
              onMouseEnter={(event) => { if (!disabled) { event.currentTarget.style.background = "var(--bg-hover)"; event.currentTarget.style.color = "var(--text)"; } }}
              onMouseLeave={(event) => { event.currentTarget.style.background = "none"; event.currentTarget.style.color = "var(--text-muted)"; }}
            >
              <SettingsSectionIcon section={section} size={14} strokeWidth={2} />
              <span>{label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setSettingsSection(getLastSettingsSection(projectTrustCwd))}
          title={translate("common.settings")}
          aria-label={translate("common.settings")}
          style={{
            flex: "0 0 32px", display: "flex", alignItems: "center", justifyContent: "center",
            height: 32, padding: 0, background: "none", border: "none",
            borderRadius: 9, color: "var(--text-muted)", cursor: "pointer",
          }}
          onMouseEnter={(event) => { event.currentTarget.style.background = "var(--bg-hover)"; event.currentTarget.style.color = "var(--text)"; }}
          onMouseLeave={(event) => { event.currentTarget.style.background = "none"; event.currentTarget.style.color = "var(--text-muted)"; }}
        >
          <SettingsSectionIcon section="general" size={14} strokeWidth={2} />
        </button>
      </div>
    </>
  );

  const renderProjectTrustWarning = (mobileBanner: boolean) => {
    if (!showChat || !projectTrust?.requiresTrust || projectTrust.trusted) return null;
    return (
      <button
        type="button"
        onClick={() => {
          setProjectTrustError(null);
          setProjectTrustDialogOpen(true);
        }}
        title={translate("trust.resourcesNotLoaded")}
        aria-label={translate("trust.resourcesNotLoaded")}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: mobileBanner ? "flex-start" : "center",
          gap: 6,
          width: mobileBanner ? "100%" : undefined,
          minHeight: mobileBanner ? 32 : undefined,
          height: mobileBanner ? undefined : "100%",
          padding: mobileBanner ? "6px 12px" : "0 12px",
          background: mobileBanner ? "color-mix(in srgb, #d97706 8%, var(--bg-panel))" : "none",
          border: "none",
          borderRight: mobileBanner ? "none" : "1px solid var(--border)",
          borderBottom: mobileBanner ? "1px solid var(--border)" : "none",
          color: "#d97706",
          cursor: "pointer",
          flexShrink: 0,
          fontSize: 11,
          lineHeight: 1.35,
          textAlign: "left",
        }}
        data-mobile-trust-banner={mobileBanner ? "true" : undefined}
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
          aria-hidden="true"
          style={{ flexShrink: 0 }}
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
          <path d="M12 8v4" />
          <path d="M12 16h.01" />
        </svg>
        <span>{translate("trust.resourcesNotLoaded")}</span>
      </button>
    );
  };

  return (
    <>
    <style>{`
      @media (max-width: 640px) {
        .sidebar-overlay-backdrop.sidebar-mobile-pending {
          opacity: 0 !important;
          pointer-events: none !important;
        }
        .sidebar-container.sidebar-mobile-pending.sidebar-open {
          transform: translateX(calc(-100% - env(safe-area-inset-left)));
          box-shadow: none;
        }
      }
    `}</style>
    <div
      className="app-shell"
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "var(--app-viewport-height, 100dvh)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
        overflow: "hidden",
        background: "var(--bg)",
      } as React.CSSProperties}
    >
      {connectionState === "offline" && (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            flexShrink: 0,
            padding: "7px 12px",
            background: "color-mix(in srgb, var(--danger) 14%, var(--bg-panel))",
            borderBottom: "1px solid color-mix(in srgb, var(--danger) 35%, var(--border))",
            color: "var(--text)",
            fontSize: 12,
            zIndex: 300,
          }}
        >
          <span>{translate("connection.offline")}</span>
          <button
            type="button"
            onClick={retryConnection}
            style={{
              height: 24,
              padding: "0 10px",
              border: "1px solid var(--border)",
              borderRadius: 5,
              background: "var(--bg)",
              color: "var(--accent)",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {translate("connection.retry")}
          </button>
        </div>
      )}
      <div style={{ position: "relative", display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
      {/* Mobile overlay backdrop */}
      <div
        className={`sidebar-overlay-backdrop${mobileSidebarReady ? "" : " sidebar-mobile-pending"}`}
        onClick={() => setSidebarOpen(false)}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 199,
          background: "rgba(0,0,0,0.4)",
          opacity: sidebarOpen ? 1 : 0,
          pointerEvents: sidebarOpen ? "auto" : "none",
          transition: "opacity 0.25s ease",
        }}
      />

      {/* Left sidebar */}
      <div
        ref={sidebarResizer.panelRef}
        id="session-sidebar"
        inert={rightPanelFullWidth || (!sidebarOpen && !sidebarPeek)}
        onMouseEnter={sidebarPeek ? holdSidebarPeek : undefined}
        onMouseMove={sidebarPeek ? holdSidebarPeek : undefined}
        onMouseLeave={sidebarPeek ? () => closeSidebarPeekAfter(SIDEBAR_PEEK_LEAVE_MS) : undefined}
        onFocusCapture={sidebarPeek ? holdSidebarPeek : undefined}
        className={`app-sidebar sidebar-container${sidebarOpen ? " sidebar-open" : " sidebar-closed"}${sidebarPeek ? " sidebar-peek" : ""}${sidebarPeekExiting ? " sidebar-peek-exit" : ""}${mobileSidebarReady ? "" : " sidebar-mobile-pending"}${sidebarResizer.isResizing ? " sidebar-resizing" : ""}`}
        style={{
          "--sidebar-width": `${sidebarResizer.width}px`,
          background: "var(--bg-panel)",
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
          zIndex: 200,
        } as React.CSSProperties}
      >
        {sidebarContent}
      </div>
      {sidebarOpen && (
        <div
          {...sidebarResizer.separatorProps}
          inert={rightPanelFullWidth}
          aria-controls="session-sidebar"
          className={`panel-resize-handle sidebar-resize-handle${sidebarResizer.isResizing ? " is-resizing" : ""}`}
          data-resize-handle="sidebar"
          title={`${translate("layout.resizeSidebar")}: ${translate("layout.resizeHint")}`}
        />
      )}

      {/* Center: chat */}
      <div inert={rightPanelFullWidth} style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {/* Top bar with sidebar toggle */}
        <div
          ref={topBarRef}
          className={`app-topbar${desktopChrome.isMacOS && (!sidebarOpen || isMobile) ? " app-topbar--mac-inset" : ""}${!rightPanelOpen ? " app-topbar--panel-closed" : ""}`}
          {...desktopChrome.dragRegionProps}
          {...windowDrag}
          style={{ display: "flex", alignItems: "center", flexShrink: 0, borderBottom: "1px solid var(--border)", height: "calc(36px + env(safe-area-inset-top))", paddingTop: "env(safe-area-inset-top)", background: "var(--bg-panel)" }}
        >
          {/* Sidebar reopen — whenever the sidebar (and its own toggle) is hidden */}
          {!sidebarOpen && (
            <button
              className="native-icon-button"
              onClick={handleSidebarToggle}
              title={translate("sidebar.show")}
              aria-label={translate("sidebar.show")}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: TOP_BAR_ICON_BUTTON_SIZE, height: TOP_BAR_ICON_BUTTON_SIZE, padding: 0,
                background: "none", border: "none", borderRight: "1px solid var(--border)",
                color: "var(--text-muted)", cursor: "pointer", flexShrink: 0, transition: "color 0.12s",
              }}
              // Hovering this button peeks the sidebar; clicking it pins it open.
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; if (!isMobile) openSidebarPeek(); }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            </button>
          )}
          <div className="app-topbar-title" title={topBarTitle}>
            <span>{topBarTitle}</span>
            <small>{topBarSubtitle}</small>
          </div>
          {showChat && projectTrust?.requiresTrust && !projectTrust.trusted && (
            <button
              type="button"
              onClick={() => {
                setProjectTrustError(null);
                setProjectTrustDialogOpen(true);
              }}
              title={translate("trust.resourcesNotLoaded")}
              aria-label={translate("trust.resourcesNotLoaded")}
              style={{
                position: "relative",
                display: "flex",
                alignItems: "stretch",
                flex: 1,
                minWidth: 0,
                height: "100%",
              }}
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
                aria-hidden="true"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
                <path d="M12 8v4" />
                <path d="M12 16h.01" />
              </svg>
              {!isMobile && <span>{translate("trust.resourcesNotLoaded")}</span>}
            </button>
          )}
          {showChat && (
            <div inert={sideModeOpen} className="app-topbar-actions" style={{ opacity: sideModeOpen ? 0.45 : undefined, display: "flex", alignItems: "stretch", height: "100%" }}>
              {hasSubagentSessions && <button className="native-toolbar-button" onClick={() => toggleTopPanel("agents")}>{translate("agentSwitcher.title")}</button>}
              <button className="native-toolbar-button" onClick={() => handleSystemInfoToggle("tools", isMobile)} disabled={!showChat}>{translate("tools.label")}</button>
              {(hasForks(branchTree) || activeTopPanel === "branches") && (
                <BranchNavigator
                  tree={branchTree}
                  activeLeafId={branchActiveLeafId}
                  onLeafChange={handleBranchLeafChange}
                  inline
                  compact={isMobile}
                  containerRef={topBarRef}
                  open={activeTopPanel === "branches"}
                  onToggle={() => toggleTopPanel("branches")}
                  hasSession
                />
              )}
              {(() => {
                const hasMessages = Boolean(
                  selectedSession
                  && ((sessionStats?.userMessages ?? 0) > 0 || selectedSession.messageCount > 0),
                );
                const nameDisabled = !selectedSession || selectedSession.transient || !hasMessages || autoNameStatus.kind === "naming";
                const isSuccess = autoNameStatus.kind === "success";
                const isError = autoNameStatus.kind === "error";
                const nameLabel = autoNameStatus.kind === "naming"
                  ? translate("title.generating")
                  : isSuccess
                    ? translate("title.updated")
                    : isError
                      ? translate("title.failed")
                      : translate("title.generate");
                const nameDescription = !hasMessages
                  ? translate("appshell.afterFirstMessage")
                  : isError
                    ? autoNameStatus.message
                    : translate("title.generateSession");

                return (
                  <div className="app-topbar-more" ref={topMoreRef}>
                    <button
                      className="native-toolbar-button app-topbar-more-trigger"
                      type="button"
                      onClick={() => {
                        setActiveTopPanel(null);
                        setTopMoreOpen((open) => !open);
                      }}
                      title={translate("appshell.moreActions")}
                      aria-label={translate("appshell.moreActions")}
                      aria-expanded={topMoreOpen}
                      aria-haspopup="menu"
                      style={{
                        display: "flex", alignItems: "center", gap: 5,
                        height: "100%", padding: "0 12px",
                        background: topMoreOpen ? "var(--bg-selected)" : "none",
                        border: "none",
                        borderTop: topMoreOpen ? "2px solid var(--accent)" : "2px solid transparent",
                        color: topMoreOpen ? "var(--text)" : "var(--text-muted)",
                        cursor: "pointer",
                        fontSize: 11, whiteSpace: "nowrap",
                        transition: "color 0.1s, background 0.1s",
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <circle cx="5" cy="12" r="1.65" />
                        <circle cx="12" cy="12" r="1.65" />
                        <circle cx="19" cy="12" r="1.65" />
                      </svg>
                      {!isMobile && <span>{translate("appshell.more")}</span>}
                    </button>
                    {topMoreOpen && (
                      <div className="native-popover app-topbar-more-menu" role="menu" aria-label={translate("appshell.moreActions")}>
                        <button
                          className="app-topbar-more-item"
                          type="button"
                          role="menuitem"
                          disabled={nameDisabled}
                          onClick={() => {
                            setTopMoreOpen(false);
                            void handleAutoName();
                          }}
                        >
                          <span
                            className="app-topbar-more-icon"
                            style={{
                              color: isError
                                ? "var(--danger)"
                                : isSuccess
                                  ? "var(--accent)"
                                  : nameDisabled
                                    ? "var(--text-dim)"
                                    : "var(--text-muted)",
                            }}
                          >
                            {autoNameStatus.kind === "naming" ? (
                              <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.25" />
                                <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                              </svg>
                            ) : isSuccess ? (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            ) : (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="m15 4 5 5L7 22l-5-5Z" />
                                <path d="m14 5 5 5" />
                                <path d="M6 4V2M5 3H3M19 19v3M17.5 20.5h3" />
                              </svg>
                            )}
                          </span>
                          <span className="app-topbar-more-copy">
                            <span>{nameLabel}</span>
                            <small>{nameDescription}</small>
                          </span>
                        </button>
                        <button
                          className="app-topbar-more-item"
                          type="button"
                          role="menuitem"
                          onClick={() => handleSystemInfoToggle("system", isMobile)}
                        >
                          <span
                            className="app-topbar-more-icon"
                            style={{ color: systemPrompt !== null ? "var(--accent)" : "var(--text-muted)" }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                              <line x1="8" y1="13" x2="16" y2="13" />
                              <line x1="8" y1="17" x2="13" y2="17" />
                            </svg>
                          </span>
                          <span className="app-topbar-more-copy">
                            <span>{translate("system.prompt")}</span>
                            <small>{systemPrompt === null ? translate("appshell.systemLoads") : systemPrompt ? translate("appshell.viewInstructions") : translate("appshell.toolsDisabled")}</small>
                          </span>
                        </button>
                        <button
                          className="app-topbar-more-item"
                          type="button"
                          role="menuitem"
                          disabled={!selectedSession}
                          onClick={() => {
                            setTopMoreOpen(false);
                            handleExportHtml();
                          }}
                        >
                          <span
                            className="app-topbar-more-icon"
                            style={{ color: selectedSession ? "var(--text-muted)" : "var(--text-dim)" }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="7 10 12 15 17 10" />
                              <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                          </span>
                          <span className="app-topbar-more-copy">
                            <span>{translate("appshell.exportHtml")}</span>
                            <small>{selectedSession ? translate("appshell.exportHtmlHint") : translate("appshell.exportHtmlUnsaved")}</small>
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
          {!isMobile && (
            <>
              {renderProjectTrustWarning(false)}


            </>
          )}
          {isMobile && sessionHasBranches && (
            <BranchNavigator
              tree={branchTree}
              activeLeafId={branchActiveLeafId}
              onLeafChange={handleBranchLeafChange}
              inline
              compact
              containerRef={topBarRef}
              open={activeTopPanel === "branches"}
              onToggle={() => toggleTopPanel("branches")}
              hasSession={showChat}
              hideInlineButton
            />
          )}
          {/* Top panel dropdown — shared, only one active at a time */}
          {activeTopPanel && topPanelPos && (
            <div role="dialog" style={{
              position: "fixed",
              top: topPanelPos.top,
              left: topPanelPos.left,
              width: topPanelPos.width,
              maxHeight: `calc(100dvh - ${topPanelPos.top}px)`,
              overflowY: "auto",
              zIndex: 500,
            }}>
              {activeTopPanel === "agents" && activeSessionFamily && selectedSession && (
                <AgentSessionPanel
                  rootSession={activeSessionFamily.root}
                  subagents={activeSessionFamily.subagents}
                  selectedSessionId={selectedSession.id}
                  runningSessionIds={runningSessionIds}
                  onSelectSession={handleSelectSession}
                />
              )}
              {activeTopPanel === "system" && (
                <SystemPromptPanel
                  loading={systemInfoLoading}
                  prompt={systemPrompt}
                  translate={translate}
                />
              )}
              {activeTopPanel === "tools" && (
                <ToolDefinitionsPanel
                  loading={systemInfoLoading}
                  tools={systemTools}
                  translate={translate}
                />
              )}

            </div>
          )}

          <WindowControls />
        </div>
        {isMobile && renderProjectTrustWarning(true)}

        {/* Chat content */}
        <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          {showChat && activeCwdMissing && projectTrustCwd ? (
            <MissingFolderNotice
              cwd={projectTrustCwd}
              onRemoveProject={() => {
                sidebarActionsRef.current?.removeProject(selectedSession?.projectRoot ?? projectTrustCwd);
                setSelectedSession(null);
                setNewSessionCwd(null);
                setActiveCwd(null);
                router.replace("/", { scroll: false });
              }}
              onPickFolder={() => sidebarActionsRef.current?.addProject()}
            />
          ) : showChat ? (
            <ChatWindow
              transcriptPreview={transcriptPreview}
              onCloseTranscript={closeTranscriptPreview}
              key={sessionKey}
              onOpenTasks={() => openMode("tasks")}
              emptyStateSlot={newTaskGuide}
              onBranchNavigate={branchNavigate}
              session={selectedSession}
              searchTarget={searchTarget?.sessionId === selectedSession?.id ? searchTarget : null}
              onSearchTargetHandled={handleSearchTargetHandled}
              initialScrollPosition={selectedSession ? sessionScrollPositionsRef.current.get(selectedSession.id) ?? null : null}
              onScrollPositionChange={handleSessionScrollPositionChange}
              sessionRunning={Boolean(selectedSession && runningSessionIds.has(selectedSession.id))}
              newSessionCwd={effectiveNewSessionCwd}
              newSessionDraftKey={newSessionDraftKey}
              onAgentEnd={handleAgentEnd}
              onAttentionNeeded={handleAttentionNeeded}
              onSessionCreated={handleSessionCreated}
              onSessionForked={handleSessionForked}
              onSessionRenamed={handleSessionRenamed}
              modelsRefreshKey={modelsRefreshKey}
              chatInputRef={chatInputRef}
              onBranchDataChange={handleBranchDataChange}
              onSystemPromptChange={handleSystemPromptChange}
              onSystemToolsChange={handleSystemToolsChange}
              onSystemInfoLoaderChange={handleSystemInfoLoaderChange}
              onSessionStatsChange={handleSessionStatsChange}
              onSelectProject={desktopMode ? () => void handleSelectProjectFromComposer() : undefined}
              projectOptions={selectedSession ? [] : availableProjectRoots}
              onProjectChange={selectedSession ? undefined : handleProjectChangeFromComposer}
              onOpenFile={(filePath) => handleOpenFile(filePath, getFileName(filePath), { sourceSessionId: selectedSession?.id })}
              onOpenModelsConfig={() => setSettingsSection("models")}
              onAppCommand={handleAppCommand}
              onSideModeChange={setSideModeOpen}
              onOpenSession={handleOpenSession}
              onAskInNewChat={handleAskInNewChat}
              quoteSelectionEnabled={quoteSelectionEnabled}
              initialPrompt={pendingQuotePrompt?.sessionId === selectedSession?.id ? pendingQuotePrompt?.text : undefined}
              onInitialPromptConsumed={() => setPendingQuotePrompt(null)}
            />
          ) : initialCwdStatus === "validating" ? (
            <div
              role="status"
              style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: 24, color: "var(--text-muted)", textAlign: "center" }}
            >
               <div style={{ fontSize: 14, color: "var(--text)" }}>{translate("workspace.opening")}</div>
              <div style={{ maxWidth: "min(720px, 100%)", overflowWrap: "anywhere", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                {initialNavigation.requestedCwd}
              </div>
            </div>
          ) : initialCwdStatus === "error" ? (
            <div
              role="alert"
              style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: 24, color: "var(--text-muted)", textAlign: "center" }}
            >
               <div style={{ fontSize: 14, color: "#dc2626" }}>{translate("workspace.unable")}</div>
              <div style={{ maxWidth: "min(720px, 100%)", overflowWrap: "anywhere", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                {initialNavigation.requestedCwd}
              </div>
              <div style={{ maxWidth: 720, fontSize: 12 }}>{initialCwdError}</div>
            </div>
          ) : showPlaceholder ? (
            activeCwd ? (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 15 }}>
                 {translate("workspace.selectSession")}
              </div>
            ) : (
              <div style={{ position: "absolute", top: 12, left: 12, display: "flex", alignItems: "flex-start", gap: 8, userSelect: "none", pointerEvents: "none" }}>
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7, flexShrink: 0 }}>
                  <line x1="20" y1="12" x2="4" y2="12" /><polyline points="10 6 4 12 10 18" />
                </svg>
                <div>
                   <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>{translate("workspace.getStarted")}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.8 }}>
                     <span style={{ color: "var(--text-dim)", marginRight: 6 }}>1.</span>{translate("workspace.selectProject")}<br />
                     <span style={{ color: "var(--text-dim)", marginRight: 6 }}>2.</span>{translate("workspace.addModels")}
                  </div>
                </div>
              </div>
            )
          ) : null}
        </div>
      </div>

      <button
        type="button"
        className={`right-panel-toggle-button${rightPanelOpen ? " is-open" : ""}`}
        onClick={handleRightPanelToggle}
        title={rightPanelOpen ? translate("files.hidePanel") : translate("files.showPanel")}
        aria-label={rightPanelOpen ? translate("files.hidePanel") : translate("files.showPanel")}
        aria-pressed={rightPanelOpen}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="15" y1="3" x2="15" y2="21" />
        </svg>
      </button>

      <div
        aria-hidden="true"
        className={`right-panel-overlay-backdrop${rightPanelOpen ? " is-open" : ""}`}
        onClick={() => setRightPanelOpen(false)}
      />
      {rightPanelOpen && (
        <div
          {...rightPanelResizer.separatorProps}
          inert={rightPanelFullWidth}
          aria-controls="file-panel"
          className={`panel-resize-handle right-panel-resize-handle${rightPanelResizer.isResizing ? " is-resizing" : ""}`}
          data-resize-handle="right-panel"
          title={`${translate("layout.resizeFilePanel")}: ${translate("layout.resizeHint")}`}
        />
      )}

      {/* Right panel: local files, browser, or diff — width animated via CSS */}
      <div
        ref={rightPanelResizer.panelRef}
        id="file-panel"
        onKeyDown={event => { if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); setRightPanelOpen(false); } }}
        inert={!rightPanelOpen}
        className={`right-panel-container${rightPanelOpen ? " right-panel-open" : " right-panel-closed"}${rightPanelFullWidth ? " right-panel-full-width" : ""}${rightPanelResizer.isResizing ? " right-panel-resizing" : ""}`}
        style={{
          "--right-panel-width": `${rightPanelResizer.width}px`,
          display: "flex",
          flexDirection: "column",
          borderLeft: "1px solid var(--border)",
          background: "var(--bg)",
        } as React.CSSProperties}
      >
        <PanelModeSelector mode={rightPanelMode} onChange={openMode} onClose={() => setRightPanelOpen(false)}>
          {rightPanelMode === "files" && (
            <div className="file-tab-bar-slot">
              <TabBar
                tabs={panelTabs}
                activeTabId={activeFileTabId ?? ""}
                onSelectTab={setActiveFileTabId}
                onCloseTab={handleCloseFileTab}
              />
            </div>
          )}
        <button type="button" className="file-panel-expand-button" onClick={handleRightPanelExpandToggle} aria-label={translate(rightPanelFullWidth ? "files.restorePanelWidth" : "files.expandPanel")} aria-pressed={rightPanelFullWidth}>↔</button>
        <button type="button" className="file-panel-expand-button" disabled={!activeCwd || activeCwdMissing} onClick={() => { if (activeCwd) handleOpenTerminal(activeCwd); }} aria-label={translate("terminal.open")}>＋</button>
        </PanelModeSelector>
        {workbenchError && <div className="workbench-error" role="alert">{workbenchError}<button onClick={() => setWorkbenchError("")}>×</button></div>}
        <div hidden={rightPanelMode !== "activity"} className="workbench-mode-body"><ActivityPanel visible={rightPanelOpen && rightPanelMode === "activity"} cwd={activeCwd} onOpen={openActivitySession} /></div>
        <div hidden={rightPanelMode !== "search"} className="workbench-mode-body"><TranscriptSearchPanel visible={rightPanelOpen && rightPanelMode === "search"} onOpen={openTranscriptResult} /></div>
        <div hidden={rightPanelMode !== "tasks"} className="workbench-mode-body">
          {taskConflict && <div ref={taskConflictRef} className="workbench-content workbench-card" role="dialog" aria-label={translate("wb.existingDraft")}><p>{translate("wb.existingDraft")}</p><div className="workbench-actions"><button onClick={() => setTaskConflict(undefined)}>{translate("wb.keepDraft")}</button><button onClick={() => void applySavedTask(taskConflict.task, taskConflict.cwd, false, taskConflict.generation)}>{translate("wb.replaceDraft")}</button><button onClick={() => void applySavedTask(taskConflict.task, taskConflict.cwd, true, taskConflict.generation)}>{translate("wb.appendPrompt")}</button></div></div>}
          <SavedTasksPanel visible={rightPanelOpen && rightPanelMode === "tasks"} cwd={activeCwd} seed={taskSeed} onUse={handleSavedTask} onCapture={captureTask} />
        </div>
        <div hidden={rightPanelMode !== "files"} className="workbench-files-body">
        <PinnedSection visible={rightPanelOpen && rightPanelMode === "files"} sessionId={selectedSession?.id ?? null} leafId={branchActiveLeafId} expanded={pinnedExpanded} onExpandedChange={setPinnedExpanded} refreshKey={refreshKey} onOpen={path => handleOpenFile(path, getFileName(path), { sourceSessionId: selectedSession?.id })} onMessage={(entryId, leafId) => { if (leafId !== branchActiveLeafId) handleBranchLeafChange(leafId); window.dispatchEvent(new CustomEvent("pi-reveal-entry", { detail: { sessionId: selectedSession?.id, entryId } })); }} />
        {/* Local files: project tree on the left, preview on the right (CSS order). */}
        <div className="file-panel-split">
          {/* Viewer column */}
          <div className="file-panel-viewer">
            {/* Everything that acts on a file or on the tree sits here, one row
                below the tabs: the viewer's own controls portal into the slot,
                panel actions stay right-aligned. */}
            <div className="file-panel-viewer-bar">
            <ChangesSection visible={rightPanelOpen && rightPanelMode === "files"} cwd={activeCwdMissing ? null : activeCwd} expanded={changesExpanded} onExpandedChange={setChangesExpanded} selectedFilePath={reviewFilePath} refreshKey={explorerRefreshKey} />
            <div className="file-viewer-controls-slot" ref={setViewerControlsSlot} />
            <div className="file-workbench-actions">
            <div className="file-actions-menu-anchor" ref={fileActionsMenuRef}>
              <button
                type="button"
                className="file-workbench-icon-button"
                onClick={() => {
                  setFileActionsMenuOpen((open) => !open);
                }}
                title={translate("contextPanel.fileActions")}
                aria-label={translate("contextPanel.fileActions")}
                aria-haspopup="menu"
                aria-expanded={fileActionsMenuOpen}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>
              </button>
              {fileActionsMenuOpen && (
                <div className="native-popover file-actions-menu" role="menu" aria-label={translate("contextPanel.fileActions")}>
                  <button type="button" role="menuitem" disabled={!activeFileTab || !selectedSession} onClick={() => void pinActiveOutput()}>{translate("wb.pinOutputs")}</button>
                  <button type="button" role="menuitem" disabled={!activeFileTab} onClick={() => void copyActiveFilePath()}>
                    <span className="file-action-menu-icon" aria-hidden="true">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="8" y="8" width="11" height="11" rx="2" />
                        <path d="M16 8V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h1" />
                      </svg>
                    </span>
                    <span>{translate("contextPanel.copyPath")}</span>
                  </button>
                  <button type="button" role="menuitem" disabled={!activeFileTab} onClick={() => void copyActiveFileContent()}>
                    <span className="file-action-menu-icon" aria-hidden="true">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="8" y="8" width="11" height="11" rx="2" />
                        <path d="M16 8V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h1" />
                      </svg>
                    </span>
                    <span>{translate("contextPanel.copyContents")}</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!activeFileTab}
                    onClick={() => {
                      window.dispatchEvent(new Event("pi:file-toggle-wrap"));
                      setFileActionsMenuOpen(false);
                    }}
                  >
                    <span className="file-action-menu-icon" aria-hidden="true">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 7h11a4 4 0 0 1 4 4v1" />
                        <path d="m16 9 3 3-3 3" />
                        <path d="M4 17h8" />
                      </svg>
                    </span>
                    <span>{translate("contextPanel.wordWrap")}</span>
                  </button>
                  {/* Native file actions used to sit in the viewer's own
                      toolbar; they belong with the other file actions. */}
                  {desktopMode && (
                    <>
                      <button
                        type="button"
                        role="menuitem"
                        disabled={!activeFileTab?.filePath}
                        onClick={() => {
                          const path = activeFileTab?.filePath;
                          if (!path) return;
                          setFileActionsMenuOpen(false);
                          void import("@/lib/desktop-native").then(({ openPathNative }) => openPathNative(path));
                        }}
                      >
                        <span className="file-action-menu-icon" aria-hidden="true">
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                        </span>
                        <span>{translate("contextPanel.openExternally")}</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        disabled={!activeFileTab?.filePath}
                        onClick={() => {
                          const path = activeFileTab?.filePath;
                          if (!path) return;
                          setFileActionsMenuOpen(false);
                          void import("@/lib/desktop-native").then(({ revealItemInDirNative }) => revealItemInDirNative(path));
                        }}
                      >
                        <span className="file-action-menu-icon" aria-hidden="true">
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
                          </svg>
                        </span>
                        <span>{translate("contextPanel.revealInFinder")}</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              className={`file-workbench-icon-button${fileTreeOpen ? " is-active" : ""}`}
              onClick={() => setFileTreeOpen((open) => !open)}
              title={fileTreeOpen ? translate("contextPanel.hideFileList") : translate("contextPanel.showFileList")}
              aria-label={fileTreeOpen ? translate("contextPanel.hideFileList") : translate("contextPanel.showFileList")}
              aria-pressed={fileTreeOpen}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /><path d="M15 7v10" /></svg>
            </button>
            </div>
            </div>
            <div className="file-panel-viewer-body">
              {activeFileTab?.filePath ? (
                <FileViewer
                  key={`${activeFileTab.id}:${activeFileTab.viewerRevision ?? 0}`}
                  initialState={activeFileTab.viewerState}
                  watchEnabled={rightPanelOpen}
                  onStateChange={state => handleFileViewerStateChange(activeFileTab.id, activeFileTab.viewerRevision ?? 0, state)}
                  onAtMention={handleAtMention}
                  filePath={activeFileTab.filePath}
                  cwd={activeCwd ?? undefined}
                  sourceSessionId={activeFileTab.sourceSessionId}
                  gitRefreshKey={explorerRefreshKey}
                  controlsSlot={viewerControlsSlot}
                  initialDisplayMode={activeFileTab.initialDisplayMode}
                  onReviewDiff={() => handleOpenFile(activeFileTab.filePath!, activeFileTab.label, { modeHint: "diff" })}
                  onMentionLines={rightPanelOpen ? handleFileLineMention : undefined}
                  onOpenFile={(filePath) => handleOpenFile(
                    filePath,
                    getFileName(filePath),
                    { sourceSessionId: activeFileTab.sourceSessionId },
                  )}
                />
              ) : !terminalTabs.some(tab => tab.id === activeFileTabId) ? (
                <div className="file-panel-empty-state">
                  <span className="file-panel-empty-icon" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5Z" />
                    </svg>
                  </span>
                  <strong>{translate("files.noneOpen")}</strong>
                  <span>{translate("files.choosePreview")}</span>
                </div>
              ) : null}
          {terminalTabs.map((tab) => (
            <div key={tab.id} hidden={tab.id !== activeFileTabId} style={{ width: "100%", height: "100%" }}>
              <TerminalPanel
                tab={tab}
                active={rightPanelOpen && tab.id === activeFileTabId}
                onRestart={() => setTerminalTabs((tabs) => tabs.map((item) => item.id === tab.id ? { ...item, closing: "restart" } : item))}
                onClosed={() => handleTerminalClosed(tab)}
                onCloseError={() => setTerminalTabs((tabs) => tabs.map((item) => item.id === tab.id ? { ...item, closing: undefined } : item))}
              />
            </div>
          ))}
          </div>
        </div>

        {/* Explorer column — always-on project file tree */}
          {activeCwd && !activeCwdMissing && fileTreeOpen && (
            <>
              <div
                {...fileTreeResizer.separatorProps}
                aria-controls="file-tree-panel"
                className={`panel-resize-handle file-tree-resize-handle${fileTreeResizer.isResizing ? " is-resizing" : ""}`}
                data-resize-handle="file-tree"
                title={`${translate("layout.resizeFileTree")}: ${translate("layout.resizeHint")}`}
              />
              <div
                ref={fileTreeResizer.panelRef}
                id="file-tree-panel"
                className="file-tree-panel file-panel-tree"
                style={{ "--file-tree-width": `${fileTreeResizer.width}px` } as React.CSSProperties}
              >
              <div className="context-panel-files-toolbar">
                <div className="context-panel-file-filter-wrap">
                  <input
                    className="context-panel-file-filter"
                    value={fileExplorerQuery}
                    onChange={(event) => setFileExplorerQuery(event.target.value)}
                    placeholder={translate("sidebar.filterFiles")}
                    aria-label={translate("sidebar.filterFiles")}
                    spellCheck={false}
                  />
                </div>
                {changesCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setChangesCollapsed((v) => !v)}
                    title={translate("sidebar.changedFiles", { count: changesCount })}
                    aria-pressed={!changesCollapsed}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 26, height: 26, padding: 0,
                      background: changesCollapsed ? "none" : "var(--bg-selected)",
                      border: "none",
                      color: changesCollapsed ? "var(--text-dim)" : "var(--accent)",
                      cursor: "pointer", borderRadius: 5,
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M3 12h6" />
                      <path d="M15 12h6" />
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => fileExplorerRef.current?.openUploadPicker()}
                  disabled={explorerUploadBusy}
                  title={translate("sidebar.uploadFilesTitle")}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 26, height: 26, padding: 0,
                    background: "none", border: "none",
                    color: "var(--text-dim)", cursor: "pointer", borderRadius: 5,
                    opacity: explorerUploadBusy ? 0.6 : 1,
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <path d="m17 8-5-5-5 5" />
                    <path d="M12 3v12" />
                  </svg>
                </button>
              </div>
              <div className="file-panel-tree-scroll">
                <FileExplorer
                  ref={fileExplorerRef}
                  cwd={activeCwd}
                  onOpenFile={handleOpenFile}
                  selectedFilePath={activeFileTab?.filePath ?? null}
                  refreshKey={explorerKey}
                  searchQuery={fileExplorerQuery}
                  onAtMention={(rel, isDir) => {
                    chatInputRef.current?.insertText(buildAtMentionText(rel, isDir));
                  }}
                  onAtMentions={(rels) => {
                    const mentions = buildFileAtMentionsText(rels);
                    if (mentions) chatInputRef.current?.insertText(mentions);
                  }}
                  onUploadBusyChange={setExplorerUploadBusy}
                  changesCollapsed={changesCollapsed}
                  onChangesCountChange={setChangesCount}
                />
              </div>
              </div>
            </>
          )}
        </div>
        </div>
      </div>
      </div>
    </div>
    {settingsSection && (
      <SettingsPanel
        cwd={projectTrustCwd}
        sessionId={selectedSession?.id ?? null}
        initialSection={settingsSection}
        quoteSelectionEnabled={quoteSelectionEnabled}
        onQuoteSelectionChange={handleQuoteSelectionChange}
        onClose={() => {
          setSettingsSection(null);
          setModelsRefreshKey((key) => key + 1);
        }}
        onSessionReloaded={() => setSessionKey((key) => key + 1)}
      />
    )}
    {projectTrustDialogOpen && projectTrustCwd && (
      <ProjectTrustDialog
        cwd={projectTrustCwd}
        busy={projectTrustBusy}
        error={projectTrustError}
        onCancel={() => {
          if (!projectTrustBusy) setProjectTrustDialogOpen(false);
        }}
        onConfirm={() => void handleTrustProject()}
      />
    )}
    {appSettingsOpen && <AppSettings onClose={() => setAppSettingsOpen(false)} />}
    <UpdateReminder onOpenSettings={() => setAppSettingsOpen(true)} />
    </>
  );
}
