import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import './ChatPanel.css';

/**
 * Minimal markdown → React elements.
 *
 * Gemini returns ### headers, **bold**, *italic*, bullet lists and ---.
 * Rendered as raw text it looks broken; rendered with innerHTML it would be
 * an XSS surface, since the text ultimately comes from a language model.
 * Building React elements instead means the model can never inject markup.
 *
 * This handles the subset Gemini actually emits. If it starts producing
 * tables or links, swap this for the `react-markdown` package.
 */
function renderInline(text, key) {
  const parts = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g;
  let cursor = 0;
  let match;
  let n = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) parts.push(text.slice(cursor, match.index));
    const token = match[0];

    if (token.startsWith('**')) {
      parts.push(<strong key={`${key}-b${n}`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      parts.push(<code key={`${key}-c${n}`}>{token.slice(1, -1)}</code>);
    } else {
      parts.push(<em key={`${key}-i${n}`}>{token.slice(1, -1)}</em>);
    }

    cursor = match.index + token.length;
    n += 1;
  }

  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

function Markdown({ text }) {
  const lines = text.split('\n');
  const blocks = [];
  let list = null;

  const flushList = () => {
    if (list) {
      blocks.push(
        <ul className="md-list" key={`ul-${blocks.length}`}>
          {list.map((item, i) => (
            <li key={i}>{renderInline(item, `li-${blocks.length}-${i}`)}</li>
          ))}
        </ul>
      );
      list = null;
    }
  };

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();

    // Bullet: "* item", "- item", or "1. item"
    const bullet = line.match(/^\s*(?:[*-]|\d+\.)\s+(.*)$/);
    if (bullet) {
      if (!list) list = [];
      list.push(bullet[1]);
      return;
    }

    flushList();

    if (!line.trim()) return;

    if (/^#{1,6}\s/.test(line)) {
      const level = line.match(/^#+/)[0].length;
      const body = line.replace(/^#+\s*/, '');
      blocks.push(
        <p className={`md-head md-head--${Math.min(level, 4)}`} key={`h-${i}`}>
          {renderInline(body, `h-${i}`)}
        </p>
      );
      return;
    }

    if (/^\s*---+\s*$/.test(line)) {
      blocks.push(<hr className="md-rule" key={`hr-${i}`} />);
      return;
    }

    blocks.push(
      <p className="md-p" key={`p-${i}`}>
        {renderInline(line, `p-${i}`)}
      </p>
    );
  });

  flushList();
  return <>{blocks}</>;
}

/**
 * Chat panel for a single city.
 *
 * Conversation state lives here rather than in CityPlacesPage, so switching
 * category tabs doesn't disturb it. Changing city does reset it — a thread
 * about Jaipur makes no sense once you're looking at Shimla.
 */
export default function ChatPanel({ cityId, cityName }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);

  // Reset the thread when the user navigates to a different city.
  useEffect(() => {
    setMessages([]);
    setError('');
    setInput('');
  }, [cityId]);

  // Keep the newest message in view.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;

    setError('');
    setInput('');
    // Show the user's message immediately — waiting for the server to echo it
    // back would make the UI feel unresponsive.
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setSending(true);

    try {
      const res = await api.chat(cityId, text);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: res.reply, context: res.context },
      ]);
    } catch (err) {
      setError(err.message);
      // Put the message back in the box so a failed send isn't lost work.
      setInput(text);
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    // Enter sends, Shift+Enter makes a new line.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <section className="card chat-panel" aria-label={`Ask about ${cityName}`}>
      <header className="chat-head">
        <h3 className="chat-title">Ask about {cityName}</h3>
        {messages.length > 0 && (
          <button
            className="btn btn--ghost btn--small"
            onClick={() => {
              setMessages([]);
              setError('');
            }}
          >
            Clear
          </button>
        )}
      </header>

      <div className="chat-log">
        {messages.length === 0 && !sending && (
          <div className="chat-empty">
            <p className="muted">
              Ask about food, sights, neighbourhoods, or hotel prices.
            </p>
            <ul className="chat-suggestions">
              {[
                'Food places near a landmark',
                'Where should I stay?',
                'Find me a hotel next weekend',
              ].map((s) => (
                <li key={s}>
                  <button
                    className="chat-suggestion"
                    onClick={() => setInput(s)}
                    disabled={sending}
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {messages.map((msg, i) => (
          <article
            key={i}
            className={`chat-msg chat-msg--${msg.role}`}
            aria-live={msg.role === 'assistant' ? 'polite' : undefined}
          >
            <div className="chat-bubble">
              {msg.role === 'assistant' ? (
                <Markdown text={msg.text} />
              ) : (
                <p className="md-p">{msg.text}</p>
              )}
            </div>

            {/* Show what grounded the answer. This is the retrieval step made
                visible — useful when demoing, and useful for spotting when
                the model answered without local context. */}
            {msg.role === 'assistant' && msg.context?.places?.length > 0 && (
              <p className="chat-context">
                Grounded in{' '}
                {msg.context.places.slice(0, 6).map((p, j) => (
                  <span className="chat-chip" key={p.id ?? j}>
                    {p.name}
                    {typeof p.distanceKm === 'number' && (
                      <span className="chat-chip-dist">
                        {p.distanceKm < 1
                          ? `${Math.round(p.distanceKm * 1000)}m`
                          : `${p.distanceKm.toFixed(1)}km`}
                      </span>
                    )}
                  </span>
                ))}
                {msg.context.places.length > 6 &&
                  ` +${msg.context.places.length - 6} more`}
              </p>
            )}
          </article>
        ))}

        {sending && (
          <article className="chat-msg chat-msg--assistant">
            <div className="chat-bubble chat-bubble--thinking">
              <span className="chat-dot" />
              <span className="chat-dot" />
              <span className="chat-dot" />
            </div>
          </article>
        )}

        <div ref={endRef} />
      </div>

      {error && (
        <p className="error chat-error" role="alert">
          {error}
        </p>
      )}

      <div className="chat-input-row">
        <textarea
          className="chat-input"
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Ask about ${cityName}…`}
          disabled={sending}
          aria-label="Your question"
        />
        <button
          className="btn btn--primary"
          onClick={send}
          disabled={sending || !input.trim()}
        >
          {sending ? 'Thinking…' : 'Send'}
        </button>
      </div>
    </section>
  );
}
