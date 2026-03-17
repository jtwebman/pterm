import fs from "node:fs";
import path from "node:path";
import { DatabaseSync, StatementSync } from "node:sqlite";
import type { SavedSession } from "../shared/types.js";

interface ScrollbackBuffer {
  chunks: Buffer[];
  size: number;
  seq: number;
  timer: ReturnType<typeof setTimeout>;
}

const FLUSH_INTERVAL_MS = 500;
const FLUSH_SIZE_BYTES = 64 * 1024;

export class SessionStore {
  private db: DatabaseSync | null;
  private buffers = new Map<string, ScrollbackBuffer>();

  // Cached prepared statements
  private stmtSaveSession: StatementSync;
  private stmtUpdateStatus: StatementSync;
  private stmtUpdateAiSessionId: StatementSync;
  private stmtDeleteSession: StatementSync;
  private stmtLoadAllSessions: StatementSync;
  private stmtMarkAllRunning: StatementSync;
  private stmtInsertScrollback: StatementSync;
  private stmtLoadScrollback: StatementSync;
  private stmtDeleteScrollback: StatementSync;
  private stmtGetMeta: StatementSync;
  private stmtSetMeta: StatementSync;
  private stmtPruneOld: StatementSync;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.createTables();

    this.stmtSaveSession = this.db.prepare(`
      INSERT INTO sessions
        (terminal_id, project_id, command_id, branch_id, command_name, command_type, cwd, cols, rows)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(terminal_id) DO UPDATE SET
        project_id = excluded.project_id,
        command_id = excluded.command_id,
        branch_id = excluded.branch_id,
        command_name = excluded.command_name,
        command_type = excluded.command_type,
        status = 'running',
        exit_code = NULL,
        cwd = excluded.cwd,
        cols = excluded.cols,
        rows = excluded.rows,
        updated_at = unixepoch()
    `);
    this.stmtUpdateStatus = this.db.prepare(`
      UPDATE sessions SET status = ?, exit_code = ?, updated_at = unixepoch()
      WHERE terminal_id = ?
    `);
    this.stmtUpdateAiSessionId = this.db.prepare(`
      UPDATE sessions SET ai_session_id = ?, updated_at = unixepoch()
      WHERE terminal_id = ?
    `);
    this.stmtDeleteSession = this.db.prepare("DELETE FROM sessions WHERE terminal_id = ?");
    this.stmtLoadAllSessions = this.db.prepare("SELECT * FROM sessions ORDER BY created_at ASC");
    this.stmtMarkAllRunning = this.db.prepare(`
      UPDATE sessions SET status = 'exited', exit_code = -1, updated_at = unixepoch()
      WHERE status = 'running'
    `);
    this.stmtInsertScrollback = this.db.prepare(
      "INSERT INTO scrollback (terminal_id, seq, data) VALUES (?, ?, ?)",
    );
    this.stmtLoadScrollback = this.db.prepare(
      "SELECT data FROM scrollback WHERE terminal_id = ? ORDER BY seq ASC",
    );
    this.stmtDeleteScrollback = this.db.prepare("DELETE FROM scrollback WHERE terminal_id = ?");
    this.stmtGetMeta = this.db.prepare("SELECT value FROM meta WHERE key = ?");
    this.stmtSetMeta = this.db.prepare(
      "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    );
    this.stmtPruneOld = this.db.prepare(`
      DELETE FROM sessions WHERE created_at < unixepoch() - ? * 86400
    `);
  }

  private createTables(): void {
    this.db!.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        terminal_id   TEXT PRIMARY KEY,
        project_id    TEXT NOT NULL,
        command_id    TEXT,
        branch_id     TEXT,
        command_name  TEXT NOT NULL,
        command_type  TEXT NOT NULL DEFAULT 'shell',
        status        TEXT NOT NULL DEFAULT 'running',
        exit_code     INTEGER,
        cwd           TEXT NOT NULL,
        cols          INTEGER NOT NULL DEFAULT 80,
        rows          INTEGER NOT NULL DEFAULT 24,
        ai_session_id TEXT,
        created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
      );

      CREATE TABLE IF NOT EXISTS scrollback (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        terminal_id TEXT NOT NULL REFERENCES sessions(terminal_id) ON DELETE CASCADE,
        seq         INTEGER NOT NULL,
        data        BLOB NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_scrollback_terminal_seq
        ON scrollback(terminal_id, seq);

      CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  saveSession(row: {
    terminalId: string;
    projectId: string;
    commandId?: string;
    branchId?: string;
    commandName: string;
    commandType: string;
    cwd: string;
    cols: number;
    rows: number;
  }): void {
    this.stmtSaveSession.run(
      row.terminalId,
      row.projectId,
      row.commandId ?? null,
      row.branchId ?? null,
      row.commandName,
      row.commandType,
      row.cwd,
      row.cols,
      row.rows,
    );
  }

  updateSessionStatus(terminalId: string, status: string, exitCode?: number): void {
    this.stmtUpdateStatus.run(status, exitCode ?? null, terminalId);
  }

  updateAiSessionId(terminalId: string, sessionId: string): void {
    this.stmtUpdateAiSessionId.run(sessionId, terminalId);
  }

  deleteSession(terminalId: string): void {
    // Discard any pending buffer
    const buf = this.buffers.get(terminalId);
    if (buf) {
      clearTimeout(buf.timer);
      this.buffers.delete(terminalId);
    }
    this.stmtDeleteSession.run(terminalId);
  }

  loadAllSessions(): SavedSession[] {
    const rows = this.stmtLoadAllSessions.all() as any[];
    return rows.map((r) => ({
      terminalId: r.terminal_id,
      projectId: r.project_id,
      commandId: r.command_id ?? undefined,
      branchId: r.branch_id ?? undefined,
      commandName: r.command_name,
      commandType: r.command_type,
      status: r.status,
      exitCode: r.exit_code ?? undefined,
      cwd: r.cwd,
      cols: r.cols,
      rows: r.rows,
      aiSessionId: r.ai_session_id ?? undefined,
    }));
  }

  markAllRunningAsExited(): void {
    this.stmtMarkAllRunning.run();
  }

  appendScrollback(terminalId: string, data: Buffer): void {
    let buf = this.buffers.get(terminalId);
    if (!buf) {
      buf = {
        chunks: [],
        size: 0,
        seq: 0,
        timer: setTimeout(() => this.flushScrollback(terminalId), FLUSH_INTERVAL_MS),
      };
      this.buffers.set(terminalId, buf);
    }

    buf.chunks.push(data);
    buf.size += data.length;

    if (buf.size >= FLUSH_SIZE_BYTES) {
      this.flushScrollback(terminalId);
    }
  }

  flushScrollback(terminalId: string): void {
    const buf = this.buffers.get(terminalId);
    if (!buf || buf.chunks.length === 0) return;

    clearTimeout(buf.timer);

    const combined = Buffer.concat(buf.chunks);
    const seq = buf.seq++;
    buf.chunks = [];
    buf.size = 0;
    buf.timer = setTimeout(() => this.flushScrollback(terminalId), FLUSH_INTERVAL_MS);

    this.stmtInsertScrollback.run(terminalId, seq, combined);
  }

  flushAllScrollback(): void {
    for (const terminalId of this.buffers.keys()) {
      this.flushScrollback(terminalId);
    }
  }

  loadScrollback(terminalId: string): Buffer[] {
    const rows = this.stmtLoadScrollback.all(terminalId) as any[];
    return rows.map((r) => Buffer.from(r.data));
  }

  deleteScrollback(terminalId: string): void {
    this.stmtDeleteScrollback.run(terminalId);
  }

  getMeta(key: string): string | null {
    const row = this.stmtGetMeta.get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  setMeta(key: string, value: string): void {
    this.stmtSetMeta.run(key, value);
  }

  pruneOldSessions(maxAgeDays: number): void {
    this.stmtPruneOld.run(maxAgeDays);
  }

  close(): void {
    if (!this.db) return;
    this.flushAllScrollback();
    // Clear all timers
    for (const buf of this.buffers.values()) {
      clearTimeout(buf.timer);
    }
    this.buffers.clear();
    this.db.close();
    this.db = null;
  }
}
