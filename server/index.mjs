import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) return;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  });
};

loadEnvFile(path.resolve(process.cwd(), ".env"));
loadEnvFile(path.resolve(process.cwd(), ".env.local"));

const PORT = Number(process.env.PORT || process.env.AGENT_API_PORT || 8787);
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

const QUERY_OBJECT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    staffName: {
      type: ["string", "null"],
    },
    staffNames: {
      type: ["array", "null"],
      items: { type: "string" },
    },
    dates: {
      type: ["array", "null"],
      items: { type: "string" },
    },
    weekdayValues: {
      type: ["array", "null"],
      items: {
        type: "integer",
        enum: [0, 1, 2, 3, 4, 5, 6],
      },
    },
    dateRangeStart: {
      type: ["string", "null"],
    },
    dateRangeEnd: {
      type: ["string", "null"],
    },
    timeWindowStart: {
      type: ["string", "null"],
    },
    timeWindowEnd: {
      type: ["string", "null"],
    },
    requiredMinutes: {
      type: ["integer", "null"],
    },
    dateMatchMode: {
      type: ["string", "null"],
      enum: ["all", "any", null],
    },
    includeOffDuty: {
      type: ["boolean", "null"],
    },
    includePotential: {
      type: ["boolean", "null"],
    },
  },
  required: [
    "staffName",
    "staffNames",
    "dates",
    "weekdayValues",
    "dateRangeStart",
    "dateRangeEnd",
    "timeWindowStart",
    "timeWindowEnd",
    "requiredMinutes",
    "dateMatchMode",
    "includeOffDuty",
    "includePotential",
  ],
};

const QUERY_KEYS = QUERY_OBJECT_SCHEMA.required;
const EMPTY_QUERY = Object.freeze(
  Object.fromEntries(QUERY_KEYS.map((key) => [key, null])),
);

const QUERY_SCHEMA = {
  name: "agent_query",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      status: {
        type: "string",
        enum: ["ok", "needs_clarification", "error"],
      },
      intent: {
        type: "string",
        enum: [
          "find_staff_for_dates",
          "find_staff_for_weekly_pattern",
          "check_person_availability",
          "none",
        ],
      },
      explanation: {
        type: "string",
      },
      clarification: {
        type: "string",
      },
      pendingIntent: {
        type: ["string", "null"],
        enum: [
          "find_staff_for_dates",
          "find_staff_for_weekly_pattern",
          "check_person_availability",
          "none",
          null,
        ],
      },
      query: QUERY_OBJECT_SCHEMA,
      partialQuery: QUERY_OBJECT_SCHEMA,
      missingFields: {
        type: ["array", "null"],
        items: { type: "string" },
      },
    },
    required: [
      "status",
      "intent",
      "explanation",
      "clarification",
      "pendingIntent",
      "query",
      "partialQuery",
      "missingFields",
    ],
  },
};

const normalizeQueryShape = (query = {}) =>
  QUERY_KEYS.reduce((acc, key) => {
    acc[key] = key in (query || {}) ? query[key] : EMPTY_QUERY[key];
    return acc;
  }, {});

const isMeaningfulQueryValue = (value) => {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number" || typeof value === "boolean") return true;
  return value !== null && value !== undefined;
};

const mergePendingQuery = (baseQuery = {}, incomingQuery = {}) => {
  const normalizedBase = normalizeQueryShape(baseQuery);
  const normalizedIncoming = normalizeQueryShape(incomingQuery);

  return QUERY_KEYS.reduce((acc, key) => {
    const nextValue = normalizedIncoming[key];
    acc[key] = isMeaningfulQueryValue(nextValue) ? nextValue : normalizedBase[key];
    return acc;
  }, {});
};

const getMissingFields = (intent, query) => {
  const normalized = normalizeQueryShape(query);
  const hasDates = Array.isArray(normalized.dates) && normalized.dates.length > 0;
  const hasWeekdays =
    Array.isArray(normalized.weekdayValues) && normalized.weekdayValues.length > 0;
  const hasStaff =
    Boolean(normalized.staffName) ||
    (Array.isArray(normalized.staffNames) && normalized.staffNames.length > 0);
  const hasTimeRange = Boolean(normalized.timeWindowStart && normalized.timeWindowEnd);

  if (intent === "find_staff_for_dates") {
    const missing = [];
    if (!hasDates) missing.push("dates");
    if (!hasTimeRange) missing.push("timeWindow");
    return missing;
  }

  if (intent === "find_staff_for_weekly_pattern") {
    const missing = [];
    if (!hasWeekdays) missing.push("weekdayValues");
    if (!normalized.dateRangeStart || !normalized.dateRangeEnd) {
      missing.push("dateRange");
    }
    if (!normalized.requiredMinutes) missing.push("requiredMinutes");
    return missing;
  }

  if (intent === "check_person_availability") {
    const missing = [];
    if (!hasStaff) missing.push("staff");
    if (!hasDates) missing.push("dates");
    return missing;
  }

  return [];
};

const buildFallbackClarification = (intent, missingFields = []) => {
  if (intent === "check_person_availability") {
    if (missingFields.includes("staff")) {
      return "請問您要查詢哪位員工？";
    }
    if (missingFields.includes("dates")) {
      return "請問您要查詢哪一天或哪幾天？";
    }
  }

  if (intent === "find_staff_for_dates") {
    if (missingFields.includes("dates") && missingFields.includes("timeWindow")) {
      return "請問您要查詢哪一天，以及哪個時間區段？";
    }
    if (missingFields.includes("dates")) {
      return "請問您要查詢哪一天或哪幾天？";
    }
    if (missingFields.includes("timeWindow")) {
      return "請問您要查詢哪個時間區段？";
    }
  }

  if (intent === "find_staff_for_weekly_pattern") {
    return "請再補充要查詢的日期範圍、星期幾，以及需要的空檔時長。";
  }

  return "我還需要更多資訊才能完成這個查詢。";
};

const postProcessAgentQuery = (parsed, context = {}) => {
  const agentMode = context.agentMode || "new_query";
  const pendingIntent =
    context.pendingIntent && context.pendingIntent !== "none"
      ? context.pendingIntent
      : null;
  const normalizedParsedQuery = normalizeQueryShape(
    parsed.partialQuery || parsed.query || {},
  );
  const effectiveIntent =
    parsed.intent && parsed.intent !== "none"
      ? parsed.intent
      : agentMode === "fill_missing_fields" && pendingIntent
        ? pendingIntent
        : "none";
  const mergedQuery =
    agentMode === "fill_missing_fields" && pendingIntent
      ? mergePendingQuery(context.pendingQuery || {}, normalizedParsedQuery)
      : normalizedParsedQuery;

  if (parsed.status === "error") {
    return {
      ...parsed,
      pendingIntent: null,
      query: normalizeQueryShape(parsed.query || {}),
      partialQuery: normalizeQueryShape(parsed.partialQuery || {}),
      missingFields: null,
    };
  }

  const missingFields = getMissingFields(effectiveIntent, mergedQuery);

  if (missingFields.length > 0) {
    return {
      status: "needs_clarification",
      intent: effectiveIntent,
      explanation: parsed.explanation || "",
      clarification:
        parsed.clarification || buildFallbackClarification(effectiveIntent, missingFields),
      pendingIntent: effectiveIntent,
      query: normalizeQueryShape(parsed.query || {}),
      partialQuery: mergedQuery,
      missingFields,
    };
  }

  if (parsed.status === "needs_clarification") {
    return {
      status: "ok",
      intent: effectiveIntent,
      explanation: parsed.explanation || "",
      clarification: "",
      pendingIntent: null,
      query: mergedQuery,
      partialQuery: normalizeQueryShape(parsed.partialQuery || {}),
      missingFields: null,
    };
  }

  return {
    status: "ok",
    intent: effectiveIntent,
    explanation: parsed.explanation || "",
    clarification: "",
    pendingIntent: null,
    query: mergedQuery,
    partialQuery: normalizeQueryShape(parsed.partialQuery || {}),
    missingFields: null,
  };
};

const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  res.end(JSON.stringify(payload));
};

const sendSseHeaders = (res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "X-Accel-Buffering": "no",
  });
};

const writeSseEvent = (res, event, payload) => {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
};

const readJsonBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
};

const buildPrompt = ({ message, context }) => `
你是居服排班工具的查詢解析器。你的工作只有把中文自然語言轉成結構化查詢 JSON，不要回答名單，不要自行推論排班結果。

目前模式：${context.agentMode === "fill_missing_fields" ? "fill_missing_fields（補完上一題）" : "new_query（新查詢）"}

請遵守：
1. 僅輸出符合 schema 的 JSON。
2. 日期一律輸出 YYYY-MM-DD。
3. 時間一律輸出 24 小時制 HH:MM。
4. 如果資訊不足，回傳 status = "needs_clarification" 並在 clarification 裡追問。
5. 若查詢是：
   - 多日期找人：intent = "find_staff_for_dates"
   - 每週規則找人：intent = "find_staff_for_weekly_pattern"
   - 指定員工查多日：intent = "check_person_availability"
   - 若使用者明確指定多位員工，請把所有姓名放進 query.staffNames
   - 若只有一位員工，可同時填 query.staffName 與 query.staffNames
6. 若使用者只說「有沒有空」但沒給時段：
   - 指定員工查詢可接受，表示查該日整天空檔
   - 找人查詢不可直接猜，需回 needs_clarification
7. "本月" 請依今天日期解析。
8. 多日期找人時：
   - 若語意是「每一天都要符合 / 同時符合 / 都有空」，query.dateMatchMode = "all"
   - 若語意是「其中一天也可以 / 任一天有空 / 任一日即可」，query.dateMatchMode = "any"
   - 若未明說，預設用 "all"
9. 若目前這句話看起來是在回答上一輪追問，例如「查所有人」「就這幾天」「包含休假」「其中一天也行」：
   - 先結合對話紀錄補齊前文已提供的日期、時段、對象與條件
   - 除非結合後仍缺必要資訊，否則不要重複追問
10. 若使用者提到「包含休假人員 / 休假也列出 / 也要看休假的人」，query.includeOffDuty = true。
11. 在 fill_missing_fields 模式：
   - 目前這句話是補充上一題，不是新的獨立查詢
   - 優先沿用上一題已知條件，只填入這輪新提供的資訊
   - 若使用者說「整天的空閒時段 / 全天 / 整天」，且上一題已是指定員工查某日，應補成整天查詢：
     - intent = "check_person_availability"
     - 保留上一題的 staff 與 dates
     - query.timeWindowStart = null
     - query.timeWindowEnd = null
     - query.requiredMinutes = null
     - 直接回 status = "ok"，不要再追問員工或日期
   - 若使用者說「查所有人」，表示 staffName = null 且 staffNames = null
12. explanation 用一句話描述你如何理解這句話。

今天日期：${context.today}
時區：${context.timezone}
目前資料區間：${context.dateRange || "未知"}
目前可查詢機構：${(context.orgNames || []).join("、") || "未載入"}
目前範圍說明：${context.scopeSummary || "全部機構"}
支援意圖：${(context.supportedIntents || []).join(", ")}

最近對話紀錄（由舊到新）：
${Array.isArray(context.conversationHistory) && context.conversationHistory.length > 0
    ? context.conversationHistory
        .map((item) => `${item.role === "assistant" ? "助手" : "使用者"}：${item.content}`)
        .join("\n")
    : "無"}

目前未完成查詢：
意圖：${context.pendingIntent || "無"}
缺少欄位：${Array.isArray(context.missingFields) && context.missingFields.length > 0 ? context.missingFields.join("、") : "無"}
已知查詢欄位：${context.pendingQuery ? JSON.stringify(normalizeQueryShape(context.pendingQuery), null, 2) : "無"}

使用者問題：
${message}
`;

const extractResponseText = (payload) => {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  if (Array.isArray(payload?.output)) {
    const chunks = [];

    payload.output.forEach((item) => {
      if (!Array.isArray(item?.content)) return;

      item.content.forEach((contentItem) => {
        if (
          typeof contentItem?.text === "string" &&
          contentItem.text.trim()
        ) {
          chunks.push(contentItem.text);
          return;
        }

        if (
          typeof contentItem?.output_text === "string" &&
          contentItem.output_text.trim()
        ) {
          chunks.push(contentItem.output_text);
        }
      });
    });

    if (chunks.length > 0) {
      return chunks.join("\n").trim();
    }
  }

  return null;
};

const parseAgentQuery = async (body) => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      instructions: "將自然語言查詢轉成結構化 JSON。",
      input: buildPrompt(body),
      text: {
        format: {
          type: "json_schema",
          ...QUERY_SCHEMA,
        },
      },
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message || "OpenAI API request failed");
  }

  const responseText = extractResponseText(payload);

  if (!responseText) {
    throw new Error(
      `OpenAI API returned no text output. Response keys: ${Object.keys(payload || {}).join(", ")}`,
    );
  }

  return postProcessAgentQuery(JSON.parse(responseText), body.context || {});
};

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  if (req.method === "GET" && req.url === "/api/health") {
    sendJson(res, 200, { ok: true, model: MODEL });
    return;
  }

  if (req.method === "POST" && req.url === "/api/agent-query") {
    try {
      const body = await readJsonBody(req);

      if (!body?.message || !body?.context) {
        sendJson(res, 400, {
          status: "error",
          error: "Missing message or context",
        });
        return;
      }

      const parsed = await parseAgentQuery(body);
      sendJson(res, 200, parsed);
    } catch (error) {
      sendJson(res, 500, {
        status: "error",
        error: error.message || "Unknown server error",
      });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/agent-query/stream") {
    sendSseHeaders(res);

    try {
      const body = await readJsonBody(req);

      if (!body?.message || !body?.context) {
        writeSseEvent(res, "error", {
          error: "Missing message or context",
        });
        res.end();
        return;
      }

      writeSseEvent(res, "status", {
        message: "正在理解你的問題...",
      });

      const parsed = await parseAgentQuery(body);

      writeSseEvent(res, "parsed", {
        parsed,
      });

      writeSseEvent(res, "done", {
        ok: true,
      });
    } catch (error) {
      writeSseEvent(res, "error", {
        error: error.message || "Unknown server error",
      });
    } finally {
      res.end();
    }
    return;
  }

  sendJson(res, 404, { status: "error", error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`AI agent API listening on http://localhost:${PORT}`);
});
