export default function AppHeader({ language, onLanguageChange, t }) {
  return (
    <section className="glass-card p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-500/15 text-2xl" aria-hidden="true">🛡️</span>
            <h1 className="text-3xl font-bold text-white md:text-4xl">{t.title}</h1>
          </div>
          <p className="mt-3 max-w-3xl text-slate-300">{t.subtitle}</p>
          <p className="mt-3 text-sm text-amber-200">{t.noGuarantee}</p>
        </div>
        <div className="space-y-2">
          <label className="label-text">{t.language}</label>
          <div className="flex gap-2">
            <button className={`secondary-button px-3 py-2 text-sm ${language === 'en' ? 'border-sky-400/50 bg-sky-500/15' : ''}`} type="button" onClick={() => onLanguageChange('en')}>
              English
            </button>
            <button className={`secondary-button px-3 py-2 text-sm ${language === 'hi' ? 'border-sky-400/50 bg-sky-500/15' : ''}`} type="button" onClick={() => onLanguageChange('hi')}>
              हिन्दी
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
