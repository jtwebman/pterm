import type { PtermBridge } from "../shared/types.js";

export const bridge = (window as any).ptermBridge as PtermBridge;
