import type { PtermBridge } from "../shared/types.js";

export const bridge = (window as unknown as { ptermBridge: PtermBridge }).ptermBridge;
