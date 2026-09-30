import { useState } from 'react';
import { api } from '../lib/api';

const QUICK_PROMPTS = [
  'What happened? Help me identify the incident type.',
  'What evidence should I preserve?',
  'Create a report',
];

export default function Chatbot({ token }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: 'bot',
      text: 'Hello. I can help you understand a digital incident, organize evidence, create a timeline, or prepare a factual report. Please do not share passwords, OTPs, private keys, or API keys.',
    },
  ]);

  async function sendMessage(value = input) {
    const question = value.trim();
    if (!question || sending) return;

    const userMessage = { id: `${Date.now()}-user`, role: 'user', text: question };
    const history = [...messages, userMessage];
    setMessages((current) => [
      ...current,
      userMessage,
    ]);
    setInput('');
    setError('');
    setSending(true);
    try {
      const result = await api.chat(
        history.filter((message) => message.role !== 'bot' || message.id !== 1).map(({ role, text }) => ({ role: role === 'bot' ? 'model' : role, text })),
        token
      );
      setMessages((current) => [...current, { id: `${Date.now()}-bot`, role: 'bot', text: result.reply }]);
    } catch (requestError) {
      setError(`${requestError.message} You can try again shortly.`);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-50 sm:right-5">
      {open ? (
        <section className="mb-3 flex h-[min(32rem,calc(100dvh-7rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-[1.5rem] border border-sky-400/20 bg-slate-950/95 shadow-2xl shadow-sky-950/50 backdrop-blur-xl">
          <header className="flex items-center justify-between border-b border-white/10 bg-sky-500/10 px-5 py-4">
            <div>
              <h2 className="font-semibold text-white">SuRaksha Assistant</h2>
              <p className="text-xs text-slate-400">Digital incident and evidence assistance</p>
            </div>
            <button className="text-xl text-slate-400 hover:text-white" type="button" aria-label="Close chatbot" onClick={() => setOpen(false)}>
              ×
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <p className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${message.role === 'user' ? 'bg-sky-500 text-white' : 'bg-white/10 text-slate-200'}`}>
                  {message.text}
                </p>
              </div>
            ))}
            {messages.length === 1 ? (
              <div className="space-y-2 pt-2">
                {QUICK_PROMPTS.map((prompt) => (
                  <button key={prompt} className="block w-full rounded-xl border border-white/10 px-3 py-2 text-left text-xs text-slate-300 hover:border-sky-400/40 hover:bg-sky-500/10" type="button" onClick={() => sendMessage(prompt)}>
                    {prompt}
                  </button>
                ))}
              </div>
            ) : null}
            {error ? <p className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p> : null}
          </div>

          <form className="flex gap-2 border-t border-white/10 p-3" onSubmit={(event) => {
            event.preventDefault();
            sendMessage();
          }}>
            <input className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-400" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask for help..." aria-label="Chat message" />
            <button className="rounded-xl bg-sky-500 px-3 text-sm font-semibold text-white hover:bg-sky-400 disabled:opacity-50" type="submit" disabled={sending}>{sending ? '...' : 'Send'}</button>
          </form>
        </section>
      ) : null}

      <button className="ml-auto flex items-center gap-2 rounded-full bg-sky-500 px-5 py-3 font-semibold text-white shadow-lg shadow-sky-950/50 transition hover:bg-sky-400" type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        <span aria-hidden="true">💬</span>
        {open ? 'Close help' : 'Chat with us'}
      </button>
    </div>
  );
}
