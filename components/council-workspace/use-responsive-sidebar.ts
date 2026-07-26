"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";

export const SIDEBAR_OVERLAY_MEDIA_QUERY = "(max-width: 980px)";

export type ResponsiveSidebarState = {
  mode: "inline" | "overlay";
  inlineOpen: boolean;
  overlayOpen: boolean;
};

export type ResponsiveSidebarAction =
  | { type: "viewport_changed"; overlay: boolean }
  | { type: "open" }
  | { type: "close" };

export const initialResponsiveSidebarState: ResponsiveSidebarState = {
  mode: "inline",
  inlineOpen: true,
  overlayOpen: false
};

export function responsiveSidebarReducer(
  state: ResponsiveSidebarState,
  action: ResponsiveSidebarAction
): ResponsiveSidebarState {
  if (action.type === "viewport_changed") {
    const mode = action.overlay ? "overlay" : "inline";
    if (mode === state.mode) return state;
    return {
      ...state,
      mode,
      overlayOpen: action.overlay ? false : state.overlayOpen
    };
  }

  const open = action.type === "open";
  if (state.mode === "overlay") {
    if (state.overlayOpen === open) return state;
    return { ...state, overlayOpen: open };
  }
  if (state.inlineOpen === open) return state;
  return { ...state, inlineOpen: open };
}

export function isResponsiveSidebarOpen(state: ResponsiveSidebarState) {
  return state.mode === "overlay" ? state.overlayOpen : state.inlineOpen;
}

export function useResponsiveSidebar() {
  const [state, dispatch] = useReducer(responsiveSidebarReducer, initialResponsiveSidebarState);
  const sidebarRef = useRef<HTMLElement>(null);
  const initialFocusRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pendingFocusRef = useRef<"sidebar" | "trigger" | null>(null);
  const open = isResponsiveSidebarOpen(state);
  const overlay = state.mode === "overlay";

  const openSidebar = useCallback(() => {
    pendingFocusRef.current = "sidebar";
    dispatch({ type: "open" });
  }, []);

  const closeSidebar = useCallback(() => {
    pendingFocusRef.current = "trigger";
    dispatch({ type: "close" });
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia(SIDEBAR_OVERLAY_MEDIA_QUERY);
    const updateViewport = (matches: boolean) => {
      dispatch({ type: "viewport_changed", overlay: matches });
    };
    const handleChange = (event: MediaQueryListEvent) => updateViewport(event.matches);

    updateViewport(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    const activeElement = document.activeElement;
    let focusTarget: HTMLElement | null = null;

    if (open) {
      if (pendingFocusRef.current === "sidebar" || activeElement === triggerRef.current) {
        focusTarget = initialFocusRef.current;
      }
    } else if (
      pendingFocusRef.current === "trigger"
      || (activeElement instanceof Node && sidebarRef.current?.contains(activeElement))
    ) {
      focusTarget = triggerRef.current;
    }

    if (!focusTarget) return;
    pendingFocusRef.current = null;
    const animationFrame = window.requestAnimationFrame(() => focusTarget?.focus());
    return () => window.cancelAnimationFrame(animationFrame);
  }, [open, state.mode]);

  useEffect(() => {
    if (!overlay || !open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      closeSidebar();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeSidebar, open, overlay]);

  return {
    open,
    overlayOpen: overlay && open,
    openSidebar,
    closeSidebar,
    sidebarRef,
    initialFocusRef,
    triggerRef
  };
}
