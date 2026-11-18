"use client";

import { createContext } from "react";

// Undefined keeps normal conversation behavior. Document surfaces supply their
// explicit handler or null, including every nested fence/artifact fallback.
export const PreviewPromptContext = createContext<((text: string) => void) | null | undefined>(undefined);
