"use client";
import { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import { createPortal } from "react-dom";
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
import { ProjectTrustDialog } from "./ProjectTrustDialog";
import { BranchNavigator, hasSessionBranches } from "./BranchNavigator";
import { UpdateReminder } from "./UpdateReminder";
import { useTheme } from "@/hooks/useTheme";
import { useI18n } from "@/hooks/useI18n";
import { useIsMobile } from "@/hooks/useIsMobile";
import { APP_PREF_KEYS, getPrefBool, getPrefJson, setPref, setPrefJson } from "@/lib/app-prefs";
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
import { SETTINGS_SECTION_ITEMS, SettingsPanel, SettingsSectionIcon } from "./SettingsPanel";
import { AgentSessionPanel } from "./AgentSessionPanel";
import { TerminalPanel } from "./TerminalPanel";
import { newTerminalTab, restoreTerminalTabs, TERMINAL_TABS_KEY, type TerminalTab } from "./terminal-tab-state";
import { sendAgentCommand } from "@/lib/agent-client";
import { claimExtensionAttentionNotification, shouldShowBrowserNotification, showBrowserNotification } from "@/lib/browser-notifications";
import { setupPushSubscription } from "@/lib/push-client";
import { withTabOpen } from "@/lib/initial-navigation";
import { clearTabOpenSession, getTabOpen, setTabOpenNewSession, setTabOpenSession } from "@/lib/tab-session";
import { mergeCatalogRow } from "./session-catalog-helpers";
import { rekeyDraft } from "@/lib/draft-store";
import { clearLastOpen, getLastOpenSession, setLastOpenSession, workspaceKeyOf } from "@/lib/workspace-memory";
import { getDefaultRightPanelWidth, getRightPanelMaxWidth, getSidebarMaxWidth, MOBILE_MAX_WIDTH, RIGHT_PANEL_FALLBACK_WIDTH, RIGHT_PANEL_MAX_WIDTH, RIGHT_PANEL_MIN_WIDTH, SIDEBAR_DEFAULT_WIDTH, SPLIT_PANEL_MIN_WIDTH, SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from "@/lib/panel-layout";
import type { BlockingExtensionUiRequest, SessionInfo, SessionTreeNode } from "@/lib/types";
import type { ProjectTrustStatus } from "@/lib/api-types";
import type { ChatInputHandle } from "./ChatInput";
import type { FileExplorerHandle } from "./FileExplorer";
import type { FileViewerState } from "@/lib/file-viewer-state";
import { getSessionFamily } from "@/lib/session-family";
import { type SettingsSection } from "@/lib/settings-navigation";

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
  const [initialNavigation, setInitialNavigation] = useState(() => resolveInitialNavigation(searchParams, desktopMode ? persistedWorkspace : null));
  const [workspaceHydrated, setWorkspaceHydrated] = useState(() => !desktopMode);
  // Subscribed for its side effects only: this hook installs the shared theme
  // store's listener for the app's lifetime, so an "auto" preference keeps
  // following OS scheme changes and the resolved palette keeps being mirrored
  // into the desktop config while the settings dialog is closed. The sidebar's
  // sun/moon toggle was removed — theme selection lives in Settings → General.
  useTheme();
  const { locale, t: translate } = useI18n();
  const isMobile = useIsMobile();
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
    // Opt-out pref: absent storage means enabled (default on).
    setQuoteSelectionEnabled(getPrefBool(APP_PREF_KEYS.quoteSelectionEnabled, true));
  }, []);
  const handleQuoteSelectionChange = useCallback((enabled: boolean) => {
    setQuoteSelectionEnabled(enabled);
    setPref(APP_PREF_KEYS.quoteSelectionEnabled, String(enabled));
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
    // The sidebar hydrates metadata after the selected session has already
    // mounted. Merge that update into the active session without changing the
    // ChatWindow key or restarting its history load.
    setSelectedSession((current) => {
      if (!current) return current;
      const refreshed = sessions.find((session) => session.id === current.id);
      return refreshed ? mergeCatalogRow(current, refreshed) : current;
    });
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
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [settingsMenuPos, setSettingsMenuPos] = useState<{ top: number; left: number } | null>(null);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const settingsMenuButtonRef = useRef<HTMLButtonElement>(null);
  const closeSettingsMenu = useCallback(() => {
    setSettingsMenuOpen(false);
    setSettingsMenuPos(null);
  }, []);
  const toggleSettingsMenu = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    if (settingsMenuOpen) {
      closeSettingsMenu();
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 184;
    const menuHeight = 236;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8));
    const below = rect.bottom + 6;
    const top = below + menuHeight > window.innerHeight - 8
      ? Math.max(8, rect.top - menuHeight - 6)
      : below;
    setSettingsMenuPos({ top, left });
    setSettingsMenuOpen(true);
  }, [settingsMenuOpen, closeSettingsMenu]);
  useEffect(() => {
    if (!settingsMenuOpen) return;
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (settingsMenuRef.current?.contains(target)) return;
      // Clicks on the toggle button fall through to its onClick, which closes.
      if (settingsMenuButtonRef.current?.contains(target)) return;
      closeSettingsMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) closeSettingsMenu();
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [settingsMenuOpen, closeSettingsMenu]);
  const [modelsRefreshKey, setModelsRefreshKey] = useState(0);

  const [projectTrust, setProjectTrust] = useState<ProjectTrustStatus | null>(null);
  const [projectTrustDialogOpen, setProjectTrustDialogOpen] = useState(false);
  const [projectTrustBusy, setProjectTrustBusy] = useState(false);
  const [projectTrustError, setProjectTrustError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => !initialNavigation.sidebarCollapsed);
  const [sidebarPeek, setSidebarPeek] = useState(false);
  const [sidebarPeekExiting, setSidebarPeekExiting] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);

  const [rightPanelExpanded, setRightPanelExpanded] = useState(false);
  const rightPanelFullWidth = rightPanelOpen && rightPanelExpanded && !isMobile;
  // The open desktop panel runs full height, so it owns the window's top-right corner.
  const panelOwnsTopRight = rightPanelOpen && !isMobile;
  useEffect(() => {
    if (!rightPanelOpen || isMobile) setRightPanelExpanded(false);
  }, [rightPanelOpen, isMobile]);
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
      setWideSplitLayout(!mql.matches);
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

  useEffect(() => {
    if (desktopMode) {
      void setCloseQuitsNative(getPrefBool(APP_PREF_KEYS.closeQuits, false));
    }
  }, [desktopMode]);

  // Single active panel — only one dropdown open at a time
  const [activeTopPanel, setActiveTopPanel] = useState<"agents" | "branches" | null>(null);
  const [topPanelPos, setTopPanelPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [wideSplitLayout, setWideSplitLayout] = useState(false);

  useEffect(() => {
    if (!sessionHasBranches) {
      setActiveTopPanel((panel) => panel === "branches" ? null : panel);
    }
  }, [sessionHasBranches]);

  useEffect(() => {
    if (!hasSubagentSessions) {
      setActiveTopPanel((panel) => panel === "agents" ? null : panel);
    }
  }, [hasSubagentSessions]);

  useEffect(() => {
    if (rightPanelFullWidth) setActiveTopPanel(null);
  }, [rightPanelFullWidth]);

  const toggleTopPanel = useCallback((panel: "agents" | "branches") => {
    if (isMobile) setSidebarOpen(false);
    setActiveTopPanel((cur) => cur === panel ? null : panel);
  }, [isMobile]);

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
    }
    setRightPanelOpen((open) => !open);
  }, [isMobile]);

  const handleRightPanelExpandToggle = useCallback(() => {
    setActiveTopPanel(null);
    setRightPanelExpanded((expanded) => !expanded);
  }, []);

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
      // The dropdowns are fixed children of the top bar's stacking context
      // (z-index 90), so the wide-desktop file panel paints over them — keep
      // them clear of that column. The top bar itself already starts at the
      // sidebar's right edge (the sidebar is a full-height column of the
      // shell), so its rect is already the sidebar-cleared region; reserving
      // the sidebar width again here shifted the dropdown a second time and
      // left a sidebar-wide dead band on its left.
      const panelReserved = rightPanelOpen && !isMobile && wideSplitLayout ? rightPanelWidth : 0;
      const left = topBarRect.left;
      const available = Math.max(0, topBarRect.width - panelReserved);
      if (activeTopPanel === "agents") {
        setTopPanelPos({ top: topBarRect.bottom, left, width: Math.min(AGENT_PANEL_WIDTH, available) });
        return;
      }
      setTopPanelPos({ top: topBarRect.bottom, left, width: available });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(topBarRef.current);
    return () => ro.disconnect();
  }, [activeTopPanel, isMobile, rightPanelOpen, rightPanelWidth, wideSplitLayout]);

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
  // sessionStorage is empty during SSR. Applying the tab's remembered session
  // in the useState initializer made the first client tree differ from the
  // server HTML (sidebar "select project" vs ""). Restore after mount instead.
  useLayoutEffect(() => {
    const next = withTabOpen(initialNavigation, getTabOpen());
    if (next === initialNavigation) return;
    setInitialNavigation(next);
    if (next.sessionId) setInitialSessionRestored(false);
  }, [initialNavigation]);
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
  // The workspace memory is shared by every tab; the tab memory keeps this
  // tab's own session so a reload does not follow another tab's last pick.
  // New session is a selection too: remember the composer cwd so reload stays
  // on that UI instead of resurrecting the previous chat.
  useEffect(() => {
    if (selectedSession) {
      const projectKey = selectedSession.projectKey
        ?? activeProjectKeyRef.current
        ?? workspaceKeyOf(selectedSession);
      setLastOpenSession(projectKey, selectedSession.id);
      setTabOpenSession(selectedSession.id);
      return;
    }
    if (newSessionCwd) setTabOpenNewSession(newSessionCwd);
  }, [newSessionCwd, selectedSession]);

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
        if (!new URLSearchParams(window.location.search).get("cwd")) {
          router.replace(`?cwd=${encodeURIComponent(data.cwd)}`, { scroll: false });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setInitialCwdError(error instanceof Error ? error.message : String(error));
        setInitialCwdStatus("error");
      });

    return () => controller.abort();
  }, [initialNavigation, router]);

  // Restore the workspace's last open session after switching to it. Called
  // from handleCwdChange once the outgoing context has been reset. The session
  // is looked up against the live list so a deleted or drifted session falls
  // back to the default welcome page instead of erroring.
  const restoreWorkspaceContext = useCallback((projectKey: string, cwd: string) => {
    const token = ++workspaceRestoreTokenRef.current;
    const lastOpenSessionId = getLastOpenSession(projectKey);
    if (!lastOpenSessionId) return;
    const adopt = (d: { sessions: SessionInfo[] } | null) => {
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
    };
    // Fast path: the sidebar already delivered the catalogue — restore
    // without waiting on a fresh /api/sessions round trip.
    if (sessionCatalog.length > 0) {
      adopt({ sessions: sessionCatalog });
      return;
    }
    void fetch("/api/sessions")
      .then((r) => (r.ok ? (r.json() as Promise<{ sessions: SessionInfo[] }>) : null))
      .then(adopt)
      .catch(() => {
        // Network hiccup: keep the remembered session for a later retry.
      });
  }, [router, sessionCatalog]);

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
      setRightPanelOpen(false);
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
    setActiveTopPanel(null);
    if (currentProject !== newProject) {
      // File tabs are keyed by absolute path, so tabs opened in the previous
      // project must not linger. Same-project worktree switches keep them.
      setFileTabs([]);
      if (!activeFileTabId || activeFileTabId.startsWith("file:")) {
        setActiveFileTabId(null);
        setRightPanelOpen(false);
      }
      // Restore the workspace we switched to: its last open session, or keep
      // the default welcome page when none is remembered.
      restoreWorkspaceContext(newProject, cwd);
    }
    router.replace(typeof window !== "undefined" ? window.location.pathname : "/", { scroll: false });
  }, [activeCwd, activeFileTabId, invalidateWorkspaceRestore, newSessionCwd, router, selectedSession, restoreWorkspaceContext]);

  const handleSelectSession = useCallback((session: SessionInfo, isRestore = false, entryId?: string, blockIndex?: number) => {
    navigationGeneration.current += 1;
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
        setRightPanelOpen(false);
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
    setActiveTopPanel(null);
    setInitialSessionRestored(true);
    // On mobile, collapse the overlay drawer so the chat is revealed after pick.
    if (isMobile && !isRestore) setSidebarOpen(false);
    if (isRestore) {
      // Suppress the redundant sessionKey bump that would come from the
      // onCwdChange effect firing after setSelectedCwd in the sidebar
      suppressCwdBumpRef.current = true;
    }
    // Native history preserves the mounted composer. Back/Forward is reconciled below.
    // Tab-memory restore lands on `/` and must still write `?session=` so reload
    // and copy-link keep this session. replaceState, not router.replace: calling
    // replace in production Next.js triggers a Suspense remount loop.
    if (!isRestore) {
      window.history.pushState({ ...window.history.state, piSession: session }, "", `?session=${encodeURIComponent(session.id)}`);
    } else if (new URLSearchParams(window.location.search).get("session") !== session.id) {
      window.history.replaceState({ ...window.history.state, piSession: session }, "", `?session=${encodeURIComponent(session.id)}`);
    }
  }, [activeCwd, activeFileTabId, invalidateWorkspaceRestore, isMobile, newSessionCwd, selectedSession]);

  const handleNewSession = useCallback((sessionId: string, cwd: string) => {
    invalidateWorkspaceRestore();
    navigationGeneration.current += 1;
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
    // Prefer the catalogue the sidebar already delivered: selecting from it
    // avoids a full detail round trip just to obtain the SessionInfo.
    const catalogued = sessionCatalog.find((s) => s.id === sessionId);
    if (catalogued && !catalogued.transient) {
      handleSelectSession(catalogued);
      return;
    }
    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, { cache: "no-store" });
      const data = await response.json() as { info?: SessionInfo; error?: string };
      if (!response.ok || !data.info) throw new Error(data.error ?? `HTTP ${response.status}`);
      handleSelectSession(data.info);
    } catch (error) {
      console.error("[pi-web] failed to open session:", error instanceof Error ? error.message : error);
    }
  }, [handleSelectSession, sessionCatalog]);

  // Called by ChatWindow when a new session gets its real id from pi
  const handleSessionCreated = useCallback((session: SessionInfo, sourceDraftKey?: string) => {
    setRefreshKey(key => key + 1);
    if (sourceDraftKey && activeNewSessionDraftKeyRef.current !== sourceDraftKey) return;
    invalidateWorkspaceRestore();
    activeNewSessionDraftKeyRef.current = null;
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
  }, []);

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
      clearTabOpenSession(sessionId);
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
      setActiveTopPanel(null);
      router.replace(cwd ? `?cwd=${encodeURIComponent(cwd)}` : (typeof window !== "undefined" ? window.location.pathname : "/"), { scroll: false });
    }
  }, [invalidateWorkspaceRestore, selectedSession, router]);

  const handleOpenFile = useCallback((
    filePath: string,
    fileName: string,
    options?: { sourceSessionId?: string | null; modeHint?: "diff"; page?: number },
  ) => {
    const sourceSessionId = options?.sourceSessionId;
    const modeHint = options?.modeHint;
    const page = options?.page;
    const tabId = `file:${filePath}`;
    setFileTabs((prev) => openFileTab(prev, {
      fileName,
      filePath,
      modeHint,
      page,
      sourceSessionId,
      tabId,
    }));
    setActiveFileTabId(tabId);
    setRightPanelOpen(true);
    // On mobile the file panel is full-screen; close the drawer so it shows.
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);


  const handleOpenTerminal = useCallback((cwd: string) => {
    const existing = terminalTabs.find((tab) => tab.cwd === cwd);
    const tab = existing ?? newTerminalTab(cwd);
    if (!existing) setTerminalTabs((tabs) => [...tabs, tab]);
    setActiveFileTabId(tab.id);
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
      case "settings": setSettingsSection("general"); return;
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

  // Settings + collapse controls at the sidebar's own top-right (Claude Desktop
  // style). When the sidebar is closed, the topbar shows a reopen button.
  const sidebarHeaderControls = (
    <>
      <button
        ref={settingsMenuButtonRef}
        className="sidebar-chrome-button"
        onClick={toggleSettingsMenu}
        title={translate("common.settings")}
        aria-label={translate("common.settings")}
        aria-haspopup="menu"
        aria-expanded={settingsMenuOpen}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
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

      {/* Main column: everything right of the sidebar. The topbar starts at the
          center column so the sidebar runs the full window height. */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
        {/* Top bar with sidebar toggle */}
        <div
          ref={topBarRef}
          className={`app-topbar${desktopChrome.isMacOS && (!sidebarOpen || isMobile) ? " app-topbar--mac-inset" : ""}${!rightPanelOpen ? " app-topbar--panel-closed" : ""}`}
          {...desktopChrome.dragRegionProps}
          {...windowDrag}
          style={{ display: "flex", alignItems: "center", flexShrink: 0, height: "calc(36px + env(safe-area-inset-top))", paddingTop: "env(safe-area-inset-top)", background: "var(--bg-panel)" }}
        >
          {/* Sidebar reopen — while the sidebar (and its own toggle) is hidden.
              A wide-panel split keeps this reachable; the full-width panel covers
              the window, so there the sidebar stays closed until it is restored. */}
          {!sidebarOpen && !rightPanelFullWidth && (
            <button
              className="native-icon-button"
              onClick={handleSidebarToggle}
              title={translate("sidebar.show")}
              aria-label={translate("sidebar.show")}
              // Size, hover colour and background come from .native-icon-button, which
              // declares them with !important — inline overrides here would be dead.
              style={{ order: -2, flexShrink: 0 }}
              // Hovering this button peeks the sidebar; clicking it pins it open.
              onMouseEnter={() => { if (!isMobile) openSidebarPeek(); }}
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
                  reserveRight={rightPanelOpen && !isMobile && wideSplitLayout ? rightPanelWidth : 0}
                />
              )}
            </div>
          )}
          {!isMobile && renderProjectTrustWarning(false)}
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

            </div>
          )}

          {!panelOwnsTopRight && <WindowControls />}
        </div>
        <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
      {/* Center: chat */}
      <div inert={rightPanelFullWidth} style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
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
              key={sessionKey}
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
        </div>
      </div>

      <button
        type="button"
        className={`right-panel-toggle-button${rightPanelOpen ? " is-open" : ""}`}
        onClick={handleRightPanelToggle}
        aria-controls="file-panel"
        aria-expanded={rightPanelOpen}
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
        <div className="right-panel-tab-strip" {...desktopChrome.dragRegionProps} {...windowDrag}>
          <div className="file-tab-bar-slot" data-no-drag>
            <TabBar
              tabs={panelTabs}
              activeTabId={activeFileTabId ?? ""}
              onSelectTab={setActiveFileTabId}
              onCloseTab={handleCloseFileTab}
              onNewTerminal={activeCwd && !activeCwdMissing ? () => handleOpenTerminal(activeCwd) : undefined}
            />
          </div>
          <div className="file-workbench-actions">
            {activeCwd && !activeCwdMissing && (
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
            )}
            <button
              type="button"
              className="file-panel-expand-button"
              onClick={handleRightPanelExpandToggle}
              aria-controls="file-panel"
              aria-pressed={rightPanelFullWidth}
              title={translate(rightPanelFullWidth ? "files.restorePanelWidth" : "files.expandPanel")}
              aria-label={translate(rightPanelFullWidth ? "files.restorePanelWidth" : "files.expandPanel")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={rightPanelFullWidth
                  ? "M9 3v6H3m12-6v6h6M9 21v-6H3m12 6v-6h6M3 3l6 6m12-6-6 6M3 21l6-6m12 6-6-6"
                  : "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M3 3l6 6m12-6-6 6M3 21l6-6m12 6-6-6"} />
              </svg>
            </button>
            <button
              type="button"
              className="file-workbench-icon-button"
              onClick={() => setRightPanelOpen(false)}
              aria-controls="file-panel"
              aria-expanded={rightPanelOpen}
              title={translate("files.hidePanel")}
              aria-label={translate("files.hidePanel")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="15" y1="3" x2="15" y2="21" /></svg>
            </button>
          </div>
          {panelOwnsTopRight && <WindowControls />}
        </div>
        {/* Local files: project tree on the left, preview on the right (CSS order). */}
        <div className="file-panel-split">
          {/* Viewer column */}
          <div className="file-panel-viewer">
            {/* File controls: the viewer's own controls portal into the slot, file actions right-aligned. */}
            {activeFileTab?.filePath && (
            <div className="file-panel-viewer-bar">
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
            </div>
            </div>
            )}
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
                  initialPage={activeFileTab.page}
                  onOpenFile={(filePath, page) => handleOpenFile(
                    filePath,
                    getFileName(filePath),
                    { sourceSessionId: activeFileTab.sourceSessionId, page },
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
    {settingsMenuOpen && settingsMenuPos && createPortal(
      <div
        ref={settingsMenuRef}
        className="sidebar-project-context-menu settings-entry-menu native-popover"
        style={{ top: settingsMenuPos.top, left: settingsMenuPos.left }}
        role="menu"
        aria-label={translate("common.settings")}
      >
        {SETTINGS_SECTION_ITEMS.map((item) => {
          const label = translate(item.labelKey);
          const disabled = item.requiresProject && !projectTrustCwd;
          return (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={disabled}
              title={disabled ? translate("settings.projectRequired") : label}
              onClick={() => {
                closeSettingsMenu();
                setSettingsSection(item.id);
              }}
            >
              <SettingsSectionIcon section={item.id} size={14} strokeWidth={2} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>,
      document.body,
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
    <UpdateReminder onOpenSettings={() => setSettingsSection("general")} />
    </>

  );
}
