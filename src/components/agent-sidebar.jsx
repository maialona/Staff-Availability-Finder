import React from "react";
import {
  Bot,
  Check,
  ChevronDown,
  Copy,
  Loader2,
  Send,
  Sparkles,
  X,
} from "lucide-react";

export const AgentSidebar = ({
  open,
  onClose,
  messages,
  inputValue,
  onInputChange,
  onSubmit,
  loading,
  examplePrompts,
  onExampleClick,
}) => {
  const [copiedMessageId, setCopiedMessageId] = React.useState(null);
  const [examplesOpen, setExamplesOpen] = React.useState(false);
  const messagesContainerRef = React.useRef(null);
  const textareaRef = React.useRef(null);

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

  const handleCopy = async (message) => {
    if (!message.copyText) return;

    await navigator.clipboard.writeText(message.copyText);
    setCopiedMessageId(message.id);
    setTimeout(() => setCopiedMessageId(null), 1500);
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
        className={`fixed right-0 top-0 z-50 h-full w-full max-w-[440px] border-l border-slate-200 bg-white shadow-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 rounded-full bg-brand-coral/10 px-3 py-1 text-[11px] font-bold text-brand-coral">
                <Sparkles className="h-3.5 w-3.5" />
                AI 找人助手
              </div>
              <h2 className="text-lg font-bold text-brand-slate">直接問誰有空</h2>
              <p className="text-sm text-slate-500">
                用自然語言查找人員，結果會沿用目前系統的排班邏輯。
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              aria-label="關閉 AI 找人助手"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="border-b border-slate-100 px-5 py-3">
            <button
              type="button"
              onClick={() => setExamplesOpen((prev) => !prev)}
              className="flex w-full items-center justify-between gap-3 rounded-xl px-1 py-1 text-left transition-colors hover:bg-slate-50"
            >
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  範例問題
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  展開後可直接點選常用查詢句型
                </p>
              </div>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
                  examplesOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            {examplesOpen && (
              <div className="mt-3 flex flex-wrap gap-2 pb-1">
                {examplePrompts.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => onExampleClick(prompt)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-brand-coral/30 hover:bg-brand-coral/[0.03] hover:text-brand-slate"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
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
                      AI 助手
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
                <div className="whitespace-pre-wrap text-sm leading-6">
                  {message.content}
                  {message.streaming && (
                    <span className="ml-0.5 inline-block h-4 w-2 animate-pulse rounded-sm bg-brand-coral/70 align-middle" />
                  )}
                </div>
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
