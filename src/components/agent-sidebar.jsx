import React from "react";
import {
  Bot,
  ChevronDown,
  Check,
  Clock3,
  Copy,
  Loader2,
  Send,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";

const ResultChip = ({ icon: Icon, children }) => (
  <div className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
    <Icon className="h-3.5 w-3.5 text-brand-coral" />
    <span>{children}</span>
  </div>
);

const StructuredResultCard = ({ result }) => {
  if (!result || result.resultType !== "staff_match") return null;

  const availableCards = result.staffCards.filter((card) => card.group === "available");
  const offDutyCards = result.staffCards.filter((card) => card.group === "offDuty");
  const summary = result.summary || {};
  const dateModeText =
    summary.dateMatchMode === "any" ? "任一天符合" : `全部 ${summary.dateCount || 0} 天符合`;

  const renderCards = (cards, emptyText) => {
    if (cards.length === 0) {
      return (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-500">
          {emptyText}
        </div>
      );
    }

    return cards.map((card) => (
      <details
        key={`${card.group}-${card.staffKey}`}
        className="group rounded-2xl border border-slate-200 bg-white shadow-sm"
      >
        <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-brand-slate">{card.name}</span>
              {card.org ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                  {card.org}
                </span>
              ) : null}
              {card.hasPotential ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                  含可彈性調整
                </span>
              ) : null}
            </div>
            <div className="text-xs text-slate-500">符合 {card.matchCount} 筆日期條件</div>
          </div>
          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-slate-100 px-4 py-3">
          <ul className="space-y-2 text-sm leading-6 text-slate-700">
            {card.reasons.map((reason) => (
              <li
                key={`${card.staffKey}-${reason}`}
                className="rounded-xl bg-slate-50 px-3 py-2"
              >
                {reason}
              </li>
            ))}
          </ul>
        </div>
      </details>
    ));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-brand-coral/20 bg-gradient-to-br from-brand-coral/10 via-white to-brand-teal/10 p-4">
        <div className="space-y-2">
          <div className="text-sm font-bold text-brand-slate">{result.title}</div>
          <p className="text-sm leading-6 text-slate-600">{summary.headline}</p>
          <div className="flex flex-wrap gap-2">
            <ResultChip icon={Users}>{summary.totalMatches || 0} 位可出勤</ResultChip>
            <ResultChip icon={Clock3}>{summary.timeSummary || "不限時段"}</ResultChip>
          </div>
          <div className="rounded-xl bg-white/80 px-3 py-2 text-xs leading-5 text-slate-600 ring-1 ring-white">
            <div>日期條件：{(summary.dates || []).join("、")}</div>
            <div>比對方式：{dateModeText}</div>
            {summary.includeOffDuty && summary.offDutyMatches > 0 ? (
              <div>另有 {summary.offDutyMatches} 位為休假 / 休息日</div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
          可出勤人員
        </div>
        <div className="space-y-3">
          {renderCards(availableCards, "目前沒有可出勤人員。")}
        </div>
      </div>

      {offDutyCards.length > 0 ? (
        <div className="space-y-3">
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
            休假 / 休息日
          </div>
          <div className="space-y-3">{renderCards(offDutyCards, "")}</div>
        </div>
      ) : null}
    </div>
  );
};

export const AgentSidebar = ({
  open,
  onClose,
  width = 440,
  onWidthChange,
  onClearMessages,
  messages,
  inputValue,
  onInputChange,
  onSubmit,
  loading,
}) => {
  const [copiedMessageId, setCopiedMessageId] = React.useState(null);
  const messagesContainerRef = React.useRef(null);
  const textareaRef = React.useRef(null);
  const isResizingRef = React.useRef(false);

  const MIN_SIDEBAR_WIDTH = 360;
  const MAX_SIDEBAR_WIDTH = 760;

  React.useEffect(() => {
    if (!messagesContainerRef.current) return;
    messagesContainerRef.current.scrollTop =
      messagesContainerRef.current.scrollHeight;
  }, [messages, loading]);

  React.useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "0px";
    const nextHeight = Math.min(textareaRef.current.scrollHeight, 144);
    textareaRef.current.style.height = `${Math.max(nextHeight, 22)}px`;
  }, [inputValue, open]);

  React.useEffect(() => {
    if (!open) return undefined;

    const handlePointerMove = (event) => {
      if (!isResizingRef.current || typeof onWidthChange !== "function") return;
      const nextWidth = window.innerWidth - event.clientX;
      const clampedWidth = Math.max(
        MIN_SIDEBAR_WIDTH,
        Math.min(nextWidth, Math.min(MAX_SIDEBAR_WIDTH, window.innerWidth - 24)),
      );
      onWidthChange(clampedWidth);
    };

    const stopResizing = () => {
      isResizingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizing);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizing);
      stopResizing();
    };
  }, [onWidthChange, open]);

  const handleCopy = async (message) => {
    if (!message.copyText) return;

    await navigator.clipboard.writeText(message.copyText);
    setCopiedMessageId(message.id);
    setTimeout(() => setCopiedMessageId(null), 1500);
  };

  const handleResizeStart = (event) => {
    if (window.innerWidth < 768 || typeof onWidthChange !== "function") return;
    event.preventDefault();
    isResizingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  return (
    <>
      {open && (
        <button
          className="fixed inset-0 z-40 bg-brand-slate/20 backdrop-blur-[1px]"
          onClick={onClose}
          aria-label="關閉 AI 側欄背景"
        />
      )}
      <aside
        style={{
          width: `min(100vw, ${width}px)`,
        }}
        className={`fixed right-0 top-0 z-50 h-full border-l border-slate-200 bg-white shadow-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <button
          type="button"
          onPointerDown={handleResizeStart}
          className="absolute left-0 top-0 hidden h-full w-3 -translate-x-1/2 cursor-col-resize bg-transparent md:block"
          aria-label="調整 AI 側欄寬度"
        >
          <span className="absolute left-1/2 top-1/2 h-16 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-200 transition-colors hover:bg-brand-coral/40" />
        </button>
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 rounded-full bg-brand-coral/10 px-3 py-1 text-[11px] font-bold text-brand-coral">
                <Sparkles className="h-3.5 w-3.5" />
                AI 釣人
              </div>
              <h2 className="text-lg font-bold text-brand-slate">直接問誰有空</h2>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onClearMessages}
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                aria-label="清除對話紀錄"
                title="清除對話紀錄"
              >
                <Trash2 className="h-[18px] w-[18px]" />
              </button>
              <button
                onClick={onClose}
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                aria-label="關閉 AI 釣人"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div
            ref={messagesContainerRef}
            className="flex-1 space-y-4 overflow-y-auto px-5 py-4"
          >
            {messages.map((message) => (
              <div
                key={message.id}
                className={`rounded-2xl px-4 py-3 ${
                  message.role === "user"
                    ? "ml-8 bg-brand-slate text-white"
                    : "mr-8 border border-slate-200 bg-slate-50/70 text-brand-slate"
                }`}
              >
                {message.role === "assistant" && (
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs font-bold">
                      <Bot className="h-3.5 w-3.5 text-brand-coral" />
                      海底撈 Bot
                    </div>
                    {message.copyText && !message.streaming && (
                      <button
                        onClick={() => handleCopy(message)}
                        className="rounded p-1 text-slate-400 transition-colors hover:bg-white hover:text-slate-600"
                        title="複製回覆"
                      >
                        {copiedMessageId === message.id ? (
                          <Check className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </div>
                )}
                {message.structuredResult && !message.streaming ? (
                  <StructuredResultCard result={message.structuredResult} />
                ) : (
                  <div className="whitespace-pre-wrap text-sm leading-6">
                    {message.content}
                    {message.streaming && (
                      <span className="ml-0.5 inline-block h-4 w-2 animate-pulse rounded-sm bg-brand-coral/70 align-middle" />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <form
            onSubmit={onSubmit}
            className="border-t border-slate-100 bg-white px-5 py-4"
          >
            <div className="flex items-end gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 shadow-sm">
              <textarea
                ref={textareaRef}
                rows={1}
                value={inputValue}
                onChange={(event) => onInputChange(event.target.value)}
                className="min-h-[22px] flex-1 resize-none overflow-y-auto bg-transparent py-1 text-sm leading-5 text-brand-slate focus:outline-none"
              />
              <button
                type="submit"
                disabled={loading || !inputValue.trim()}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-brand-coral px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-coral/90 disabled:cursor-not-allowed disabled:bg-slate-200"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {loading ? "回覆中" : "送出"}
              </button>
            </div>
          </form>
        </div>
      </aside>
    </>
  );
};
