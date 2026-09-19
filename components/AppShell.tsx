"use client";
import { TranscriptSearchPanel } from "./workbench/TranscriptSearchPanel";
import type { TranscriptResult } from "@/lib/transcript-search";
import type { TranscriptPreview } from "@/lib/transcript-types";
import { PanelModeSelector } from "./workbench/PanelModeSelector";
import { ActivityPanel } from "./workbench/ActivityPanel";
import { SavedTasksPanel, type TaskSeed } from "./workbench/SavedTasksPanel";
import { NewTaskGuide } from "./workbench/NewTaskGuide";
import { PinnedSection } from "./workbench/PinnedSection";
import { SendPreview } from "./workbench/SendPreview";
import { ChangesSection } from "./workbench/ChangesSection";
import { panelMode, type PanelMode } from "@/lib/panel-modes";
import { loadDraft, setDraft, getDraftStatus, type ChatDraft } from "@/lib/draft-store";
import { uiFetch } from "@/lib/web-ui-client";
import { taskPromptFromDraft } from "@/lib/prepare-outgoing";
import type { SavedTask } from "@/lib/task-types";


import { useState, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useGlobalKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { SessionSidebar } from "./SessionSidebar";
import type { AppSlashCommand } from "@/lib/web-slash-commands";
import { ChatWindow } from "./ChatWindow";
import { selectProjectDirectoryNative } from "./ProjectPicker";
import { MissingFolderNotice } from "./MissingFolderNotice";
import type { SidebarProjectActions } from "@/lib/missing-folder";
import { TabBar, type Tab } from "./TabBar";

// Heavy, rarely-used surfaces are code-split out of the main bundle. The
// config modals may never be opened at all; FileViewer drags in markdown +
// syntax highlighting a second time and only matters once a file tab opens.
const FileViewer = dynamic(() => import("./FileViewer").then((m) => m.FileViewer), { ssr: false });
const FileExplorer = dynamic(() => import("./FileExplorer").then((m) => m.FileExplorer), { ssr: false });
const ModelsConfig = dynamic(() => import("./ModelsConfig").then((m) => m.ModelsConfig), { ssr: false });
const SkillsConfig = dynamic(() => import("./SkillsConfig").then((m) => m.SkillsConfig), { ssr: false });
const PluginsConfig = dynamic(() => import("./PluginsConfig").then((m) => m.PluginsConfig), { ssr: false });
const AppSettings = dynamic(() => import("./AppSettings").then((m) => m.AppSettings), { ssr: false });
import { ProjectTrustDialog } from "./ProjectTrustDialog";
import { BranchNavigator } from "./BranchNavigator";
import { UpdateReminder } from "./UpdateReminder";
import { useTheme } from "@/hooks/useTheme";
import { useI18n } from "@/hooks/useI18n";
import { useIsMobile } from "@/hooks/useIsMobile";
import { APP_PREF_KEYS, getPrefBool, getPrefJson, setPrefJson } from "@/lib/app-prefs";
import { useViewportHeight } from "@/hooks/useViewportHeight";
import { useResizablePanel } from "@/hooks/useResizablePanel";
import { useDesktopConnection } from "@/lib/desktop-connection";
import { isTauriDesktop, setCloseQuitsNative } from "@/lib/desktop-native";
import { encodeFilePathForApi, getFileName } from "@/lib/file-paths";
import { buildAtMentionText, buildFileAtMentionsText, buildFileLineMentionText } from "@/lib/file-fuzzy";
import { PRODUCT_NAME } from "@/lib/branding";
import { hasForks } from "@/lib/session-forks";
import {
  resolveInitialNavigation,
  workspaceFileTabsMatchContext,
  type PersistedWorkspace,
} from "@/lib/workspace-state";
import { WindowControls, useDesktopChrome, useWindowDrag } from "./desktop";
import {
  getDefaultRightPanelWidth,
  getRightPanelMaxWidth,
  getSidebarMaxWidth,
  MOBILE_MAX_WIDTH,
  RIGHT_PANEL_FALLBACK_WIDTH,
  RIGHT_PANEL_MAX_WIDTH,
  RIGHT_PANEL_MIN_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
  SPLIT_PANEL_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from "@/lib/panel-layout";
import type { SessionInfo, SessionTreeNode } from "@/lib/types";
import type { ProjectTrustStatus } from "@/lib/api-types";
import type { ChatInputHandle } from "./ChatInput";
import type { FileExplorerHandle } from "./FileExplorer";
import type { SessionStatsInfo } from "@/lib/pi-types";

type AutoNameStatus =
  | { kind: "idle" }
  | { kind: "naming" }
  | { kind: "success" }
  | { kind: "error"; message: string };
const TOP_BAR_ICON_BUTTON_SIZE = 36;
const FILE_TREE_DEFAULT_WIDTH = 300;
const FILE_TREE_MIN_WIDTH = 220;
const FILE_TREE_MAX_WIDTH = 520;
const FILE_TREE_PREVIEW_MIN_WIDTH = 240;
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
  const { t: translate } = useI18n();
  const isMobile = useIsMobile();
  useViewportHeight();
  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(null);
  // When user clicks +, we only store the cwd — no fake session id
  const [newSessionCwd, setNewSessionCwd] = useState<string | null>(null);
  const [initialCwdStatus, setInitialCwdStatus] = useState<"idle" | "validating" | "ready" | "error">(
    () => initialNavigation.requestedCwd ? "validating" : "idle",
  );
  const [initialCwdError, setInitialCwdError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sessionKey, setSessionKey] = useState(0);
  const [availableProjectRoots, setAvailableProjectRoots] = useState<string[]>([]);
  const [explorerRefreshKey, setExplorerRefreshKey] = useState(0);
  const [modelsConfigOpen, setModelsConfigOpen] = useState(false);
  const [modelsRefreshKey, setModelsRefreshKey] = useState(0);
  const [skillsConfigOpen, setSkillsConfigOpen] = useState(false);
  const [pluginsConfigOpen, setPluginsConfigOpen] = useState(false);
  const [appSettingsOpen, setAppSettingsOpen] = useState(false);
  const [projectTrust, setProjectTrust] = useState<ProjectTrustStatus | null>(null);
  const [projectTrustDialogOpen, setProjectTrustDialogOpen] = useState(false);
  const [projectTrustBusy, setProjectTrustBusy] = useState(false);
  const [projectTrustError, setProjectTrustError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [rightPanelMode, setRightPanelMode] = useState<PanelMode>("files");
  // Read by the project-switch effect: only the Files view empties on a project change.
  const rightPanelModeRef = useRef(rightPanelMode); rightPanelModeRef.current = rightPanelMode;
  const [transcriptPreview, setTranscriptPreview] = useState<TranscriptPreview>();
  const closeTranscriptPreview = useCallback(() => setTranscriptPreview(undefined), []);
  const [draftRevision, setDraftRevision] = useState(0);
  const handleDraftChange = useCallback(() => setDraftRevision(v => v + 1), []);
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
  const chatInputRef = useRef<ChatInputHandle | null>(null);
  const topBarRef = useRef<HTMLDivElement>(null);
  // Branch navigator state — populated by ChatWindow via onBranchDataChange
  const [branchTree, setBranchTree] = useState<SessionTreeNode[]>([]);
  const [branchActiveLeafId, setBranchActiveLeafId] = useState<string | null>(null);
  const branchLeafChangeFnRef = useRef<((leafId: string | null) => void) | null>(null);

  const handleBranchDataChange = useCallback((tree: SessionTreeNode[], activeLeafId: string | null, onLeafChange: (leafId: string | null) => void) => {
    setBranchTree(tree);
    setBranchActiveLeafId(activeLeafId);
    branchLeafChangeFnRef.current = onLeafChange;
  }, []);

  const handleBranchLeafChange = useCallback((leafId: string | null) => {
    branchLeafChangeFnRef.current?.(leafId);
  }, []);

  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);

  const handleSystemPromptChange = useCallback((prompt: string | null) => {
    setSystemPrompt(prompt);
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
  const [activeTopPanel, setActiveTopPanel] = useState<"branches" | "system" | null>(null);
  const [topMoreOpen, setTopMoreOpen] = useState(false);
  const topMoreRef = useRef<HTMLDivElement>(null);
  const [topPanelPos, setTopPanelPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const toggleTopPanel = useCallback((panel: "branches" | "system") => {
    if (isMobile) setSidebarOpen(false);
    setTopMoreOpen(false);
    setActiveTopPanel((cur) => cur === panel ? null : panel);
  }, [isMobile]);

  const handleSidebarToggle = useCallback(() => {
    if (isMobile) setActiveTopPanel(null);
    setSidebarOpen((open) => {
      const next = !open;
      if (!isMobile) desktopSidebarOpenRef.current = next;
      return next;
    });
  }, [isMobile]);

  const handleRightPanelToggle = useCallback(() => {
    setActiveTopPanel(null);
    setTopMoreOpen(false);
    setRightPanelOpen(!rightPanelOpen);
  }, [rightPanelOpen]);

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
      setTopPanelPos({ top: topBarRect.bottom, left: topBarRect.left, width: topBarRect.width });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(topBarRef.current);
    return () => ro.disconnect();
  }, [activeTopPanel, isMobile]);

  // Right panel — local files, browser, and diff are the three primary tools.
  const [fileTabs, setFileTabs] = useState<Tab[]>([]);
  const [activeFileTabId, setActiveFileTabId] = useState<string | null>(null);
  // FileExplorer state — moved out of SessionSidebar so the right panel
  // can host the same explorer the sidebar used to.
  const [explorerKey] = useState(0);
  const [explorerUploadBusy, setExplorerUploadBusy] = useState(false);
  const [changesCount, setChangesCount] = useState(0);
  const [changesCollapsed, setChangesCollapsed] = useState(true);
  const [fileExplorerQuery, setFileExplorerQuery] = useState("");
  const fileExplorerRef = useRef<FileExplorerHandle>(null);
  const [fileTreeOpen, setFileTreeOpen] = useState(true);
  const [fileActionsMenuOpen, setFileActionsMenuOpen] = useState(false);
  const fileActionsMenuRef = useRef<HTMLDivElement>(null);
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
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [fileActionsMenuOpen]);
  useEffect(() => {
    if (desktopMode) {
      void setCloseQuitsNative(getPrefBool(APP_PREF_KEYS.closeQuits, false));
    }
  }, [desktopMode]);

  const { state: connectionState, retry: retryConnection } = useDesktopConnection();

  const handleFileLineMention = useCallback((relativePath: string, startLine: number, endLine: number) => {
    chatInputRef.current?.insertText(buildFileLineMentionText(relativePath, startLine, endLine));
  }, []);

  const initialSessionId = initialNavigation.sessionId;
  const [activeCwd, setActiveCwd] = useState<string | null>(null);
  const activeProjectRootRef = useRef<string | null>(null);
  // True once the initial ?session= URL param has been resolved (or confirmed absent)
  const [initialSessionRestored, setInitialSessionRestored] = useState<boolean>(() => !initialSessionId);
  // Suppresses sessionKey bump in handleCwdChange during the initial URL restore
  const suppressCwdBumpRef = useRef(false);

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

  const handleCwdChange = useCallback((cwd: string | null, projectRoot?: string | null) => {
    navigationGeneration.current += 1;
    setActiveCwd(cwd);
    // Skip if cwd is null (initial mount).
    if (!cwd) return;
    const newProject = projectRoot ?? cwd;
    const currentProject = activeProjectRootRef.current
      ?? (selectedSession ? (selectedSession.projectRoot ?? selectedSession.cwd) : null);
    activeProjectRootRef.current = newProject;

    // Keep the project identity in sync during the initial URL restore without
    // remounting the just-created or restored chat.
    if (suppressCwdBumpRef.current) {
      suppressCwdBumpRef.current = false;
      return;
    }
    // Worktrees of one repo share a project root. Moving the effective cwd
    // within the same project (e.g. switching worktree, or clicking a session
    // that lives in another worktree) must not close the open session.
    if (currentProject === newProject) {
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
    setSelectedSession(null);
    setNewSessionCwd((prev) => {
      if (prev && prev !== cwd) return null;
      return prev;
    });
    setBranchTree([]);
    setBranchActiveLeafId(null);
    setSystemPrompt(null);
    setActiveTopPanel(null);
    // File tabs are keyed by absolute path, so tabs opened in the previous
    // project would otherwise linger after switching to a different project.
    // Reached only past the same-project early return above, so worktrees of
    // one repo keep their open tabs. Mirror handleCloseFileTab and close the
    // now-empty right panel.
    setFileTabs([]);
    setActiveFileTabId(null);
    if (rightPanelModeRef.current === "files") setRightPanelOpen(false);
    router.replace("/", { scroll: false });
  }, [router, selectedSession]);

  const handleSelectSession = useCallback((session: SessionInfo, isRestore = false) => {
    navigationGeneration.current += 1;
    setTranscriptPreview(undefined);
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
  }, [isMobile]);

  const handleNewSession = useCallback((_sessionId: string, cwd: string) => {
    navigationGeneration.current += 1;
    // Reopen the project's unsent draft. Submission clears it in ChatInput;
    // navigating away and back must never discard it.
    setTranscriptPreview(undefined);
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
  }, [isMobile]);

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
  // server-computed projectRoot, which the same-project check in
  // handleCwdChange relies on. Hydrate it from the session list so switching
  // worktrees right after creating a session doesn't close the chat.
  const hydrateSelectedSession = useCallback((sessionId: string) => {
    void fetch("/api/sessions")
      .then((r) => (r.ok ? (r.json() as Promise<{ sessions: SessionInfo[] }>) : null))
      .then((d) => {
        const full = d?.sessions.find((s) => s.id === sessionId);
        if (!full) return;
        setSelectedSession((prev) => (prev && prev.id === sessionId && !prev.projectRoot ? full : prev));
      })
      .catch(() => {});
  }, []);

  // Called by ChatWindow when a new session gets its real id from pi
  const handleSessionCreated = useCallback((session: SessionInfo) => {
    setTranscriptPreview(undefined);
    setNewSessionCwd(null);
    setSelectedSession(session);
    setRefreshKey((k) => k + 1);
    hydrateSelectedSession(session.id);
    router.replace(`?session=${encodeURIComponent(session.id)}`, { scroll: false });
  }, [router, hydrateSelectedSession]);
  const handleAgentEnd = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setExplorerRefreshKey((k) => k + 1);
  }, []);
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
    setRefreshKey((k) => k + 1);
    setNewSessionCwd(null);
    setSelectedSession((prev) => ({
      ...(prev ?? { path: "", cwd: "", created: "", modified: "", messageCount: 0, firstMessage: "" }),
      id: newSessionId,
    }));
    hydrateSelectedSession(newSessionId);
    router.replace(`?session=${encodeURIComponent(newSessionId)}`, { scroll: false });
  }, [router, hydrateSelectedSession]);

  const handleInitialRestoreDone = useCallback(() => {
    setInitialSessionRestored(true);
  }, []);

  const handleSessionDeleted = useCallback((sessionId: string) => {
    setRefreshKey((k) => k + 1);
    if (selectedSession?.id === sessionId) {
      const cwd = selectedSession.cwd;
      setSelectedSession(null);
      setNewSessionCwd(cwd ?? null);
      setBranchTree([]);
      setBranchActiveLeafId(null);
      setSystemPrompt(null);
      setActiveTopPanel(null);
      router.replace("/", { scroll: false });
    }
  }, [selectedSession, router]);

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
    setFileTabs((prev) => {
      const existing = prev.find((t) => t.id === tabId);
      if (!existing) {
        return [...prev, {
          id: tabId,
          label: fileName,
          filePath,
          sourceSessionId,
          initialDisplayMode: modeHint,
        }];
      }
      const sourceUnchanged = !sourceSessionId || existing.sourceSessionId === sourceSessionId;
      const modeUnchanged = !modeHint || existing.initialDisplayMode === modeHint;
      if (sourceUnchanged && modeUnchanged) return prev;
      return prev.map((t) => {
        if (t.id !== tabId) return t;
        const next: Tab = { ...t };
        if (sourceSessionId) next.sourceSessionId = sourceSessionId;
        if (modeHint) next.initialDisplayMode = modeHint;
        return next;
      });
    });
    setActiveFileTabId(tabId);
    setRightPanelOpen(true);
    setRightPanelMode("files");
    // On mobile the file panel is full-screen; close the drawer so it shows.
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);

  const handleCloseFileTab = useCallback((tabId: string) => {
    setFileTabs((prev) => {
      const next = prev.filter((t) => t.id !== tabId);
      if (next.length === 0) setRightPanelOpen(false);
      return next;
    });
    setActiveFileTabId((cur) => {
      if (cur !== tabId) return cur;
      const remaining = fileTabs.filter((t) => t.id !== tabId);
      return remaining.length > 0 ? remaining[remaining.length - 1].id : null;
    });
  }, [fileTabs]);

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
      case "logout": setModelsConfigOpen(true); return;
      case "trust":
        if (!projectTrustCwd) return translate("chat.commandUnavailable");
        setProjectTrustDialogOpen(true); return;
    }
  };

  // Show chat area if a session is selected, or if we have a cwd to start a new session in
  const effectiveNewSessionCwd = newSessionCwd ?? (selectedSession === null && activeCwd ? activeCwd : null);
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
      setActiveFileTabId(
        activeId && tabs.some((tab) => tab.id === activeId)
          ? activeId
          : (tabs[0]?.id ?? null),
      );
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
  // The composer chip that replaced the Context panel mode; kept out of the
  // ChatWindow call so that element stays one flat attribute list.
  const sendPreview = <SendPreview inputRef={chatInputRef} revision={draftRevision} identity={selectedSession?.id ?? `new:${effectiveNewSessionCwd}`} systemPrompt={systemPrompt} />;
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
        onClick={toggleTheme}
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
        title={translate("sidebar.hide")}
        aria-label={translate("sidebar.hide")}
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
      />
      <div className="sidebar-footer" style={{ padding: "8px", flexShrink: 0, display: "flex", justifyContent: "space-between", gap: 4 }}>
        {([
          {
             label: translate("common.models"),
            onClick: () => setModelsConfigOpen(true),
            disabled: false,
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" />
                <line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" />
                <line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" />
                <line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" />
                <line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" />
              </svg>
            ),
          },
          {
             label: translate("common.skills"),
            onClick: () => setSkillsConfigOpen(true),
            disabled: !activeCwd && !selectedSession?.cwd && !newSessionCwd,
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            ),
          },
          {
             label: translate("common.plugins"),
            onClick: () => setPluginsConfigOpen(true),
            disabled: !activeCwd && !selectedSession?.cwd && !newSessionCwd,
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 7V2" />
                <path d="M15 7V2" />
                <path d="M6 13V8a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v5a6 6 0 0 1-12 0Z" />
                <path d="M12 19v3" />
              </svg>
            ),
          },
          {
            label: "Settings",
            onClick: () => setAppSettingsOpen(true),
            disabled: false,
            iconOnly: true,
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 8.94 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.57 15a1.7 1.7 0 0 0-1.56-1.03H3v-4h.08A1.7 1.7 0 0 0 4.6 8.94a1.7 1.7 0 0 0-.34-1.88L4.2 7l2.83-2.83.06.06A1.7 1.7 0 0 0 8.97 4.6 1.7 1.7 0 0 0 10 3.04V3h4v.08a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06L19.8 7l-.06.06a1.7 1.7 0 0 0-.34 1.88A1.7 1.7 0 0 0 20.96 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z" />
              </svg>
            ),
          },
        ] as { label: string; onClick: () => void; disabled: boolean; iconOnly?: boolean; icon: React.ReactNode }[]).map(({ label, onClick, disabled, iconOnly, icon }) => (
          <button
            key={label}
            onClick={onClick}
            disabled={disabled}
            title={label}
            aria-label={label}
            style={{
              flex: iconOnly ? "0 0 32px" : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              height: 32, padding: 0, background: "none", border: "none",
              borderRadius: 9, color: "var(--text-muted)", cursor: disabled ? "default" : "pointer",
              fontSize: 12, opacity: disabled ? 0.35 : 1,
              transition: "background 0.12s, color 0.12s",
            }}
            onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text)"; } }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            {icon}
            {!iconOnly && label}
          </button>
        ))}
      </div>
    </>
  );

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
      <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
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
        inert={!sidebarOpen}
        className={`app-sidebar sidebar-container${sidebarOpen ? " sidebar-open" : " sidebar-closed"}${mobileSidebarReady ? "" : " sidebar-mobile-pending"}${sidebarResizer.isResizing ? " sidebar-resizing" : ""}`}
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
          aria-controls="session-sidebar"
          className={`panel-resize-handle sidebar-resize-handle${sidebarResizer.isResizing ? " is-resizing" : ""}`}
          data-resize-handle="sidebar"
          title={`${translate("layout.resizeSidebar")}: ${translate("layout.resizeHint")}`}
        />
      )}

      {/* Center: chat */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {/* Top bar with sidebar toggle */}
        <div
          ref={topBarRef}
          className={`app-topbar${desktopChrome.isMacOS && (!sidebarOpen || isMobile) ? " app-topbar--mac-inset" : ""}${!rightPanelOpen ? " app-topbar--panel-closed" : ""}`}
          {...desktopChrome.dragRegionProps}
          {...windowDrag}
          style={{ display: "flex", alignItems: "center", flexShrink: 0, borderBottom: "1px solid var(--border)", height: "calc(36px + env(safe-area-inset-top))", paddingTop: "env(safe-area-inset-top)", background: "var(--bg-panel)" }}
        >
          {/* Sidebar reopen — only while the sidebar (and its own toggle) is hidden */}
          {!sidebarOpen && !rightPanelOpen && (
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
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }}
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
                display: "flex",
                alignItems: "center",
                gap: 6,
                height: "100%",
                padding: isMobile ? "0 10px" : "0 12px",
                background: "none",
                border: "none",
                borderRight: "1px solid var(--border)",
                color: "#d97706",
                cursor: "pointer",
                flexShrink: 0,
                fontSize: 11,
                whiteSpace: "nowrap",
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
            <div className="app-topbar-actions" style={{ display: "flex", alignItems: "stretch", height: "100%" }}>
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
                  && (sessionStats?.userMessages ?? selectedSession.messageCount) > 0,
                );
                const nameDisabled = !selectedSession || !hasMessages || autoNameStatus.kind === "naming";
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
                          onClick={() => toggleTopPanel("system")}
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
              {activeTopPanel === "system" && (
                <div style={{
                  background: "var(--surface-elevated)",
                  borderBottom: "1px solid var(--border)",
                }}>
                  {systemPrompt ? (
                    <div style={{
                      maxHeight: "min(600px, 75vh)",
                      overflowY: "auto",
                      padding: "12px 16px",
                      color: "var(--text-muted)",
                      fontSize: 12,
                      lineHeight: 1.6,
                      whiteSpace: "pre-wrap",
                      fontFamily: "var(--font-mono)",
                    }}>
                      {systemPrompt}
                    </div>
                  ) : systemPrompt === "" ? (
                    <div style={{ padding: "10px 16px", fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                       {translate("system.empty")}
                    </div>
                  ) : (
                    <div style={{ padding: "10px 16px", fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                       {translate("system.load")}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <WindowControls />
        </div>

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
              onDraftChange={handleDraftChange}
              sendPreview={sendPreview}
              onOpenTasks={() => openMode("tasks")}
              emptyStateSlot={newTaskGuide}
              onBranchNavigate={branchNavigate}
              session={selectedSession}
              newSessionCwd={effectiveNewSessionCwd}
              onAgentEnd={handleAgentEnd}
              onSessionCreated={handleSessionCreated}
              onSessionForked={handleSessionForked}
              onSessionRenamed={handleSessionRenamed}
              modelsRefreshKey={modelsRefreshKey}
              chatInputRef={chatInputRef}
              onBranchDataChange={handleBranchDataChange}
              onSystemPromptChange={handleSystemPromptChange}
              onSessionStatsChange={handleSessionStatsChange}
              onSelectProject={desktopMode ? () => void handleSelectProjectFromComposer() : undefined}
              projectOptions={selectedSession ? [] : availableProjectRoots}
              onProjectChange={selectedSession ? undefined : handleProjectChangeFromComposer}
              onOpenFile={(filePath) => handleOpenFile(filePath, getFileName(filePath), { sourceSessionId: selectedSession?.id })}
              onOpenModelsConfig={() => setModelsConfigOpen(true)}
              onAppCommand={handleAppCommand}
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
        className={`right-panel-container${rightPanelOpen ? " right-panel-open" : " right-panel-closed"}${rightPanelResizer.isResizing ? " right-panel-resizing" : ""}`}
        style={{
          "--right-panel-width": `${rightPanelResizer.width}px`,
          display: "flex",
          flexDirection: "column",
          borderLeft: "1px solid var(--border)",
          background: "var(--bg)",
        } as React.CSSProperties}
      >
        <PanelModeSelector mode={rightPanelMode} onChange={openMode} onClose={() => setRightPanelOpen(false)} />
        {workbenchError && <div className="workbench-error" role="alert">{workbenchError}<button onClick={() => setWorkbenchError("")}>×</button></div>}
        <div hidden={rightPanelMode !== "activity"} className="workbench-mode-body"><ActivityPanel visible={rightPanelOpen && rightPanelMode === "activity"} cwd={activeCwd} onOpen={openActivitySession} /></div>
        <div hidden={rightPanelMode !== "search"} className="workbench-mode-body"><TranscriptSearchPanel visible={rightPanelOpen && rightPanelMode === "search"} onOpen={openTranscriptResult} /></div>
        <div hidden={rightPanelMode !== "tasks"} className="workbench-mode-body">
          {taskConflict && <div ref={taskConflictRef} className="workbench-content workbench-card" role="dialog" aria-label={translate("wb.existingDraft")}><p>{translate("wb.existingDraft")}</p><div className="workbench-actions"><button onClick={() => setTaskConflict(undefined)}>{translate("wb.keepDraft")}</button><button onClick={() => void applySavedTask(taskConflict.task, taskConflict.cwd, false, taskConflict.generation)}>{translate("wb.replaceDraft")}</button><button onClick={() => void applySavedTask(taskConflict.task, taskConflict.cwd, true, taskConflict.generation)}>{translate("wb.appendPrompt")}</button></div></div>}
          <SavedTasksPanel visible={rightPanelOpen && rightPanelMode === "tasks"} cwd={activeCwd} seed={taskSeed} onUse={handleSavedTask} onCapture={captureTask} />
        </div>
        <div hidden={rightPanelMode !== "files"} className="workbench-files-body">
        <div className="right-panel-tab-strip">
          <div className="file-tab-bar-slot">
            <TabBar
              tabs={fileTabs}
              activeTabId={activeFileTabId ?? ""}
              onSelectTab={setActiveFileTabId}
              onCloseTab={handleCloseFileTab}
            />
          </div>
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
        <PinnedSection visible={rightPanelOpen && rightPanelMode === "files"} sessionId={selectedSession?.id ?? null} leafId={branchActiveLeafId} expanded={pinnedExpanded} onExpandedChange={setPinnedExpanded} refreshKey={refreshKey} onOpen={path => handleOpenFile(path, getFileName(path), { sourceSessionId: selectedSession?.id })} onMessage={(entryId, leafId) => { if (leafId !== branchActiveLeafId) handleBranchLeafChange(leafId); window.dispatchEvent(new CustomEvent("pi-reveal-entry", { detail: { sessionId: selectedSession?.id, entryId } })); }} />
        <ChangesSection visible={rightPanelOpen && rightPanelMode === "files"} cwd={activeCwdMissing ? null : activeCwd} expanded={changesExpanded} onExpandedChange={setChangesExpanded} selectedFilePath={reviewFilePath} refreshKey={explorerRefreshKey} />
        {/* Local files: project tree on the left, preview on the right (CSS order). */}
        <div className="file-panel-split">
          {/* Viewer column */}
          <div className="file-panel-viewer">
            <div className="file-panel-viewer-body">
              {activeFileTab?.filePath ? (
                <FileViewer
                  filePath={activeFileTab.filePath}
                  cwd={activeCwd ?? undefined}
                  sourceSessionId={activeFileTab.sourceSessionId}
                  gitRefreshKey={explorerRefreshKey}
                  initialDisplayMode={activeFileTab.initialDisplayMode}
                  onReviewDiff={() => handleOpenFile(activeFileTab.filePath!, activeFileTab.label, { modeHint: "diff" })}
                  onMentionLines={rightPanelOpen ? handleFileLineMention : undefined}
                  onOpenFile={(filePath) => handleOpenFile(
                    filePath,
                    getFileName(filePath),
                    { sourceSessionId: activeFileTab.sourceSessionId },
                  )}
                />
              ) : (
                <div className="file-panel-empty-state">
                  <span className="file-panel-empty-icon" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5Z" />
                    </svg>
                  </span>
                  <strong>{translate("files.noneOpen")}</strong>
                  <span>{translate("files.choosePreview")}</span>
                </div>
              )}
            </div>
          </div>
          {/* Tree column — always-on project file tree */}
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
    {modelsConfigOpen && <ModelsConfig onClose={() => { setModelsConfigOpen(false); setModelsRefreshKey((k) => k + 1); }} />}
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
    {skillsConfigOpen && projectTrustCwd && (
      <SkillsConfig cwd={projectTrustCwd} onClose={() => setSkillsConfigOpen(false)} />
    )}
    {pluginsConfigOpen && projectTrustCwd && (
      <PluginsConfig
        cwd={projectTrustCwd}
        sessionId={selectedSession?.id ?? null}
        onClose={() => setPluginsConfigOpen(false)}
        onReloaded={() => setSessionKey((k) => k + 1)}
      />
    )}
    {appSettingsOpen && <AppSettings onClose={() => setAppSettingsOpen(false)} />}
    <UpdateReminder onOpenSettings={() => setAppSettingsOpen(true)} />
    </>
  );
}
