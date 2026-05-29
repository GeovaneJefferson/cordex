import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useAppState } from '../store/AppContext';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const Cordex = (window as any).Cordex;

// ── Flatten file tree ────────────────────────────────────────
function flattenFileTree(nodes: any[], prefix = ''): string[] {
  let files: string[] = [];
  for (const node of nodes) {
    const fullPath = prefix ? `${prefix}/${node.name}` : node.name;
    if (node.type === 'file') files.push(fullPath);
    else if (node.children) files = files.concat(flattenFileTree(node.children, fullPath));
  }
  return files;
}

// ══════════════════════════════════════════════════════════════
//  Code Block with copy button
// ══════════════════════════════════════════════════════════════
const CodeBlock: React.FC<{ language: string; code: string }> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = code;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div style={{ position: 'relative', marginTop: 8, marginBottom: 8 }}>
      <SyntaxHighlighter
        style={oneDark}
        language={language}
        PreTag="div"
        customStyle={{ margin: 0, borderRadius: 6, fontSize: 12, paddingRight: 40 }}
      >
        {code}
      </SyntaxHighlighter>
      <button
        onClick={handleCopy}
        title="Copy code"
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          background: copied ? 'rgba(22,163,74,0.9)' : 'rgba(255,255,255,0.1)',
          border: 'none',
          borderRadius: 4,
          color: 'white',
          padding: '2px 8px',
          fontSize: 11,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          transition: 'background 0.2s',
          zIndex: 1,
        }}
        onMouseEnter={e => { if (!copied) (e.currentTarget.style.background = 'rgba(255,255,255,0.25)'); }}
        onMouseLeave={e => { if (!copied) (e.currentTarget.style.background = 'rgba(255,255,255,0.1)'); }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
          {copied ? 'check' : 'content_copy'}
        </span>
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
//  Message bubble (memoized to avoid re-renders)
// ══════════════════════════════════════════════════════════════
const MessageBubble: React.FC<{
  message: Message;
  isStreaming: boolean;
  isLast: boolean;
}> = React.memo(({ message, isStreaming, isLast }) => {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[90%] px-3 py-2 rounded-xl text-sm bg-orange-500 text-white rounded-br-sm">
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  // While streaming the LAST assistant message, render as plain text (fast)
  if (isStreaming && isLast) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[90%] px-3 py-2 rounded-xl text-sm bg-gray-100 text-gray-800 rounded-bl-sm overflow-x-auto">
          <pre className="whitespace-pre-wrap font-sans text-sm m-0">{message.content}</pre>
          <span className="inline-block w-2 h-4 bg-gray-400 animate-pulse ml-1" />
        </div>
      </div>
    );
  }

  // Full Markdown rendering for completed assistant messages
  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] px-3 py-2 rounded-xl text-sm bg-gray-100 text-gray-800 rounded-bl-sm overflow-x-auto">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p({ children }) {
              return <p style={{ marginBottom: '0.6em', marginTop: 0, lineHeight: 1.55 }}>{children}</p>;
            },
            ul({ children }) {
              return <ul style={{ paddingLeft: '1.2em', marginBottom: '0.6em', marginTop: 0 }}>{children}</ul>;
            },
            ol({ children }) {
              return <ol style={{ paddingLeft: '1.2em', marginBottom: '0.6em', marginTop: 0 }}>{children}</ol>;
            },
            li({ children }) {
              return <li style={{ marginBottom: '0.2em' }}>{children}</li>;
            },
            code({ node, className, children, ...rest }) {
              const match = /language-(\w+)/.exec(className || '');
              const codeString = String(children).replace(/\n$/, '');
              const isInline = !match && !className;
              return isInline ? (
                <code className={className} style={{ background: '#f1f5f9', padding: '1px 4px', borderRadius: 3, fontSize: '0.9em' }}>{children}</code>
              ) : (
                <CodeBlock language={match?.[1] ?? 'text'} code={codeString} />
              );
            },
          }}
        >
          {message.content}
        </ReactMarkdown>
      </div>
    </div>
  );
});

// ══════════════════════════════════════════════════════════════
//  Main ChatPanel
// ══════════════════════════════════════════════════════════════
export const ChatPanel: React.FC = () => {
  const { state } = useAppState();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<() => void>(() => {});
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [selectionInfo, setSelectionInfo] = useState<{ hasSelection: boolean; preview: string; lineCount: number }>({ hasSelection: false, preview: '', lineCount: 0 });

  // Mention state
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [showMentions, setShowMentions] = useState(false);

  // Poll for selection changes
  useEffect(() => {
    const interval = setInterval(() => {
      const info = (window as any).__cordexGetSelectionInfo?.();
      if (info) setSelectionInfo(info);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // Cached file list (updated only when fileTree changes)
  const allFiles = useRef<string[]>([]);
  useEffect(() => {
    allFiles.current = flattenFileTree(state.fileTree || []).sort();
  }, [state.fileTree]);

  const filteredFiles = React.useMemo(() => {
    if (!mentionQuery) return [];
    const q = mentionQuery.toLowerCase();
    return allFiles.current.filter(f => f.toLowerCase().includes(q)).slice(0, 10);
  }, [mentionQuery]);

  // Auto‑scroll
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const stopGeneration = () => {
    abortRef.current?.();
  };

  const clearChat = () => {
    stopGeneration();
    setMessages([]);
  };

  // Batched streaming: buffer chunks and update state every 50ms
  const streamingBuffer = useRef<{ timer: ReturnType<typeof setTimeout> | null; chunks: string[] }>({
    timer: null,
    chunks: [],
  });

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    abortRef.current?.();

    const userMsg: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    // Add empty assistant message
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    const currentFile = state.tabs.find(t => t.id === state.activeTabId)?.path;
    const selection = (window as any).__cordexGetSelection?.();
    const context = {
      projectRoot: state.projectRoot,
      currentFile,
      selection: selection || undefined,
    };

    // Clear previous buffer
    streamingBuffer.current.chunks = [];
    if (streamingBuffer.current.timer) clearTimeout(streamingBuffer.current.timer);

    const cleanup = Cordex?.ai?.chatStream(
      { messages: [...messages, userMsg], context },
      {
        onChunk: (chunk: string) => {
          streamingBuffer.current.chunks.push(chunk);
          if (!streamingBuffer.current.timer) {
            streamingBuffer.current.timer = setTimeout(() => {
              // Apply all buffered chunks at once
              const allChunks = streamingBuffer.current.chunks.join('');
              setMessages(prev =>
                prev.map((msg, i) =>
                  i === prev.length - 1 && msg.role === 'assistant'
                    ? { ...msg, content: msg.content + allChunks }
                    : msg
                )
              );
              streamingBuffer.current.chunks = [];
              streamingBuffer.current.timer = null;
            }, 50);
          }
        },
        onDone: () => {
          // Flush remaining chunks and mark done
          if (streamingBuffer.current.timer) {
            clearTimeout(streamingBuffer.current.timer);
            const remaining = streamingBuffer.current.chunks.join('');
            if (remaining) {
              setMessages(prev =>
                prev.map((msg, i) =>
                  i === prev.length - 1 && msg.role === 'assistant'
                    ? { ...msg, content: msg.content + remaining }
                    : msg
                )
              );
            }
          }
          streamingBuffer.current.chunks = [];
          streamingBuffer.current.timer = null;
          setLoading(false);
        },
        onError: (err: string) => {
          // Flush buffer and show error
          if (streamingBuffer.current.timer) {
            clearTimeout(streamingBuffer.current.timer);
            const remaining = streamingBuffer.current.chunks.join('');
            if (remaining) {
              setMessages(prev =>
                prev.map((msg, i) =>
                  i === prev.length - 1 && msg.role === 'assistant'
                    ? { ...msg, content: msg.content + remaining }
                    : msg
                )
              );
            }
          }
          streamingBuffer.current.chunks = [];
          streamingBuffer.current.timer = null;
          setMessages(prev =>
            prev.map((msg, i) =>
              i === prev.length - 1 && msg.role === 'assistant'
                ? { ...msg, content: msg.content + `\n[Error] ${err}` }
                : msg
            )
          );
          setLoading(false);
        },
      }
    );

    abortRef.current = () => {
      cleanup();
      setLoading(false);
      if (streamingBuffer.current.timer) {
        clearTimeout(streamingBuffer.current.timer);
        streamingBuffer.current.chunks = [];
        streamingBuffer.current.timer = null;
      }
    };
  };

  // ── Mention handling ─────────────────────────────────────────
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);
    const cursorPos = e.target.selectionStart ?? 0;
    const textBeforeCursor = value.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\S*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setShowMentions(true);
      setMentionIndex(0);
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (filePath: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursorPos = textarea.selectionStart ?? 0;
    const textBefore = input.slice(0, cursorPos);
    const textAfter = input.slice(cursorPos);
    const newBefore = textBefore.replace(/@\S*$/, `@${filePath} `);
    setInput(newBefore + textAfter);
    setShowMentions(false);
    setTimeout(() => {
      textarea.selectionStart = textarea.selectionEnd = newBefore.length + 1;
      textarea.focus();
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentions && filteredFiles.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(i => (i + 1) % filteredFiles.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(i => (i - 1 + filteredFiles.length) % filteredFiles.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredFiles[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setShowMentions(false);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !showMentions) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Selection indicator header */}
      {selectionInfo.hasSelection && (
        <div className="px-4 py-2 bg-green-50 border-b border-green-200 flex items-center gap-2 text-xs">
          <span className="material-symbols-outlined text-green-600 text-[14px]">check_circle</span>
          <span className="text-green-700 font-medium">
            Selection active: {selectionInfo.lineCount} {selectionInfo.lineCount === 1 ? 'line' : 'lines'} • {selectionInfo.preview}
          </span>
        </div>
      )}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((msg, i) => (
          <MessageBubble
            key={i}
            message={msg}
            isStreaming={loading && i === messages.length - 1}
            isLast={i === messages.length - 1}
          />
        ))}
      </div>

      <div className="relative p-3 border-t border-gray-200 space-y-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your code... use @ to mention files"
          className="w-full border border-gray-200 rounded-lg p-2 text-sm resize-none focus:outline-none focus:border-orange-400"
          rows={2}
          disabled={loading}
        />
        {showMentions && filteredFiles.length > 0 && (
          <div className="absolute bottom-full mb-1 left-3 right-3 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto z-50">
            {filteredFiles.map((file, idx) => (
              <div
                key={file}
                className={`px-3 py-1 text-sm cursor-pointer flex items-center gap-2 ${
                  idx === mentionIndex ? 'bg-orange-50 text-orange-600' : 'hover:bg-gray-50'
                }`}
                onClick={() => insertMention(file)}
              >
                <span className="material-symbols-outlined text-[14px]">description</span>
                {file}
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between">
          <button onClick={clearChat} disabled={loading} className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30">
            Clear
          </button>
          <div className="flex gap-2">
            {loading && (
              <button onClick={stopGeneration} className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-full">
                <span className="material-symbols-outlined text-[14px]">stop</span> Stop
              </button>
            )}
            <button onClick={send} disabled={!input.trim() || loading} className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-40 rounded-full">
              <span className="material-symbols-outlined text-[14px]">send</span> Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};