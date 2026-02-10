import { createWriteStream, mkdirSync } from "fs";
import { dirname } from "path";

export type TelemetryEvent = {
  timestamp: string;
  event_type: string;
  runId?: string;
  conversationId?: string;
  dealId?: string;
  sessionId?: string | null;
  payload?: Record<string, unknown>;
};

export function createTelemetryLogger(opts: {
  filePath: string;
  defaults?: Partial<TelemetryEvent>;
}) {
  const { filePath, defaults } = opts;
  try {
    mkdirSync(dirname(filePath), { recursive: true });
  } catch {
    // best effort
  }

  const stream = createWriteStream(filePath, { flags: "a" });

  const log = (event: Omit<TelemetryEvent, "timestamp">) => {
    try {
      const record: TelemetryEvent = {
        timestamp: new Date().toISOString(),
        ...defaults,
        ...event
      };
      stream.write(`${JSON.stringify(record)}\n`);
    } catch {
      // best effort
    }
  };

  const flushAndClose = () => {
    try {
      stream.end();
    } catch {
      // best effort
    }
  };

  return { log, flushAndClose };
}
