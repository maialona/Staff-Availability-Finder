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

const PORT = Number(process.env.AGENT_API_PORT || 8787);
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

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
      query: {
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
          "includePotential",
        ],
      },
    },
    required: ["status", "intent", "explanation", "clarification", "query"],
  },
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
8. explanation 用一句話描述你如何理解這句話。

今天日期：${context.today}
時區：${context.timezone}
目前資料區間：${context.dateRange || "未知"}
目前可查詢機構：${(context.orgNames || []).join("、") || "未載入"}
目前範圍說明：${context.scopeSummary || "全部機構"}
支援意圖：${(context.supportedIntents || []).join(", ")}

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

  return JSON.parse(responseText);
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
