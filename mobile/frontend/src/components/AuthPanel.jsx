export default function AuthPanel({
  authMode,
  setAuthMode,
  loginRole,
  setLoginRole,
  identifier,
  setIdentifier,
  displayName,
  setDisplayName,
  challengeId,
  otp,
  setOtp,
  devOtp,
  requestOtp,
  verifyOtp,
  loading,
  t,
}) {
  return (
    <section className="glass-card mt-6 p-6">
      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-4">
        <button className={authMode === 'login' ? 'primary-button' : 'secondary-button'} type="button" onClick={() => {
          setAuthMode('login');
        }}>
          {t.loginTab}
        </button>
        <button className={authMode === 'register' ? 'primary-button' : 'secondary-button'} type="button" onClick={() => {
          setAuthMode('register');
        }}>
          {t.registerTab}
        </button>
      </div>
      <h2 className="mt-5 text-xl font-semibold text-white">{authMode === 'login' ? t.login : t.register}</h2>
      <p className="mt-2 text-sm text-slate-400">{authMode === 'login' ? t.loginHint : t.registerHint}</p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label>
          <span className="label-text">{t.role}</span>
          <select className="input-field" value={loginRole} onChange={(event) => setLoginRole(event.target.value)}>
            <option value="victim">victim</option>
            <option value="support">support staff / NGO helper</option>
            <option value="police">police officer</option>
            <option value="admin">admin</option>
          </select>
        </label>
        <label>
          <span className="label-text">{t.id}</span>
          <input className="input-field" value={identifier} onChange={(event) => setIdentifier(event.target.value)} />
        </label>
        {authMode === 'register' ? (
          <label>
            <span className="label-text">{t.name}</span>
            <input className="input-field" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </label>
        ) : null}
        <div className="flex items-end gap-3 md:justify-end">
          <button className="primary-button w-full md:w-auto" type="button" onClick={requestOtp} disabled={loading || !identifier.trim() || (authMode === 'register' && !displayName.trim())}>
            {loading ? 'Sending…' : t.sendOtp}
          </button>
        </div>
      </div>
      {challengeId ? (
        <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto]">
          <label>
            <span className="label-text">{t.otpCode}</span>
            <input className="input-field" value={otp} onChange={(event) => setOtp(event.target.value)} />
          </label>
          <button className="primary-button w-full md:w-auto" type="button" onClick={verifyOtp} disabled={loading || !otp.trim()}>
            {loading ? 'Verifying…' : t.verifyOtp}
          </button>
        </div>
      ) : null}
      {devOtp ? <p className="mt-3 text-xs text-slate-400">Dev OTP: {devOtp}</p> : null}
    </section>
  );
}
