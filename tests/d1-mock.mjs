import { DatabaseSync } from "node:sqlite";

export class D1DatabaseMock {
  constructor() {
    this.sqlite = new DatabaseSync(":memory:");
    this.sqlite.exec("PRAGMA foreign_keys = ON");
  }

  prepare(sql) {
    return new D1PreparedStatementMock(this.sqlite, sql);
  }

  async batch(statements) {
    this.sqlite.exec("BEGIN");
    try {
      const results = statements.map((statement) => statement.executeForBatch());
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  close() {
    this.sqlite.close();
  }
}

class D1PreparedStatementMock {
  constructor(sqlite, sql, params = []) {
    this.sqlite = sqlite;
    this.sql = sql;
    this.params = params;
  }

  bind(...params) {
    return new D1PreparedStatementMock(this.sqlite, this.sql, params);
  }

  async all() {
    return this.executeForBatch();
  }

  async raw() {
    const rawSelectRows = this.selectRowsAsArrays();
    return rawSelectRows ?? this.rows().map((row) => Object.values(row));
  }

  async first(column) {
    const row = this.rows()[0] ?? null;
    return column && row ? row[column] ?? null : row;
  }

  async run() {
    const statement = this.sqlite.prepare(this.sql);
    const result = statement.run(...this.params);
    return {
      success: true,
      results: [],
      meta: {
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid),
      },
    };
  }

  executeForBatch() {
    const results = this.rows();
    return { success: true, results, meta: { changes: 0 } };
  }

  rows() {
    return this.sqlite.prepare(this.sql).all(...this.params);
  }

  /**
   * D1's `raw()` preserves duplicate column names as positional values. Node
   * 22.13's experimental SQLite API returns objects only, which would collapse
   * `clubs.name, events.name` into one property. Wrapping the projection in
   * SQLite's JSON array keeps the real D1 positional behavior without relying
   * on newer `setReturnArrays()` APIs.
   */
  selectRowsAsArrays() {
    const select = /^\s*select\s+/i.exec(this.sql);
    if (!select) return null;
    const fromIndex = findTopLevelFrom(this.sql, select[0].length);
    if (fromIndex < 0) return null;

    const projection = this.sql.slice(select[0].length, fromIndex).trim();
    const remainder = this.sql.slice(fromIndex);
    const wrappedSql = `${this.sql.slice(0, select.index)}SELECT json_array(${projection}) AS __d1_raw ${remainder}`;
    return this.sqlite
      .prepare(wrappedSql)
      .all(...this.params)
      .map((row) => JSON.parse(row.__d1_raw));
  }
}

function findTopLevelFrom(sql, startIndex) {
  let quote = "";
  let depth = 0;

  for (let index = startIndex; index < sql.length; index += 1) {
    const character = sql[index];
    if (quote) {
      if (quote === "]") {
        if (character === "]") quote = "";
      } else if (character === quote) {
        if (sql[index + 1] === quote) index += 1;
        else quote = "";
      }
      continue;
    }

    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }
    if (character === "[") {
      quote = "]";
      continue;
    }
    if (character === "(") {
      depth += 1;
      continue;
    }
    if (character === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (
      depth === 0 &&
      sql.slice(index, index + 4).toLowerCase() === "from" &&
      /\s/.test(sql[index - 1] ?? " ") &&
      /\s/.test(sql[index + 4] ?? " ")
    ) {
      return index;
    }
  }

  return -1;
}

export function workerEnvironment(db) {
  return {
    DB: db,
    ASSETS: {
      fetch: async () => new Response("Not found", { status: 404 }),
    },
  };
}

export const executionContext = {
  waitUntil() {},
  passThroughOnException() {},
};
