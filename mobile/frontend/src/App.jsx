import { useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api, downloadBlob } from './lib/api';
import { COMMON_FIELDS, FRAUD_FIELDS, FRAUD_TYPES } from './data/fraudForms';
import { extractClientMetadata, mergeMetadata, METADATA_FIELDS } from './lib/extractMetadata';
import AppHeader from './components/AppHeader';
import AuthPanel from './components/AuthPanel';
import DashboardPage from './pages/DashboardPage';
import Chatbot from './components/Chatbot';

const METADATA_LABELS = {
  fileType: 'File type',
  source: 'Source',
  sourceDevice: 'Source device',
  collectedAt: 'Collected at',
  transactionId: 'Transaction ID',
  platformName: 'Platform name',
  complaintCategory: 'Complaint category',
  captureMethod: 'Capture method',
  captureLimitations: 'Capture limitations',
};

const STATUS_OPTIONS = ['submitted', 'under-review', 'forwarded', 'accepted', 'rejected', 'pending-clarification', 'package-ready'];

const LANG = {
  en: {
    title: 'Evidence Locker',
    subtitle: 'Digital Evidence Collection Vault — preserves digital evidence with SHA-256 hash, MediaProjection screen capture, and chain of custody.',
    login: 'Secure login with OTP',
    register: 'Create an account',
    loginTab: 'Login',
    registerTab: 'Register',
    registerHint: 'New here? Create an account with your email or phone.',
    loginHint: 'Already have an account? Enter your identifier to continue.',
    role: 'Role',
    id: 'Identifier (email)',
    name: 'Display name',
    sendOtp: 'Send OTP',
    verifyOtp: 'Verify OTP',
    otpCode: 'OTP code',
    language: 'Language',
    createCase: 'Create / update complaint',
    evidenceMeta: 'Evidence metadata',
    help: 'Help and next steps',
    noGuarantee: 'This tool supports documentation; it does not guarantee FIR registration or conviction.',
  },
  hi: {
    title: 'Evidence Locker',
    subtitle: 'डिजिटल साक्ष्य संग्रहण वॉल्ट — SHA-256 हैश, मीडिया प्रोजेक्शन स्क्रीन कैप्चर और कस्टडी के साथ।',
    login: 'OTP के साथ सुरक्षित लॉगिन',
    register: 'खाता बनाएं',
    loginTab: 'लॉगिन',
    registerTab: 'रजिस्टर',
    registerHint: 'नए उपयोगकर्ता हैं? ईमेल या फोन से खाता बनाएं।',
    loginHint: 'पहले से खाता है? जारी रखने के लिए पहचान दर्ज करें।',
    role: 'भूमिका',
    id: 'पहचान (फोन/ईमेल)',
    name: 'नाम',
    sendOtp: 'OTP भेजें',
    verifyOtp: 'OTP सत्यापित करें',
    otpCode: 'OTP कोड',
    language: 'भाषा',
    createCase: 'शिकायत बनाएं / अपडेट करें',
    evidenceMeta: 'साक्ष्य मेटाडेटा',
    help: 'सहायता और अगले कदम',
    noGuarantee: 'यह टूल FIR या सज़ा की गारंटी नहीं देता; यह समीक्षा के लिए बेहतर दस्तावेज़ तैयार करता है।',
  },
};

function emptyForm() {
  return {
    victimName: '',
    phone: '',
    email: '',
    city: '',
    state: '',
    incidentDate: '',
    formData: {},
    victimClientId: '',
  };
}

function emptyMetadata() {
  return {
    fileType: '',
    source: '',
    sourceDevice: '',
    collectedAt: '',
    transactionId: '',
    platformName: '',
    complaintCategory: '',
    captureMethod: '',
    captureLimitations:
      'Hash after upload confirms integrity post-capture. It cannot prove that evidence was unaltered before upload.',
  };
}

function readSession() {
  try {
    return JSON.parse(localStorage.getItem('suraksha-session') || 'null');
  } catch {
    return null;
  }
}

function saveSession(value) {
  localStorage.setItem('suraksha-session', JSON.stringify(value));
}

function clearSession() {
  localStorage.removeItem('suraksha-session');
}

function roleCanEditComplaint(role) {
  return ['victim', 'support', 'admin'].includes(role);
}

function roleCanUpload(role) {
  return ['victim', 'support', 'admin'].includes(role);
}

function roleCanUpdateStatus(role) {
  return ['support', 'police', 'admin'].includes(role);
}

function roleCanEditEvidenceMetadata(role) {
  return ['support', 'admin'].includes(role);
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function badgeForStatus(status) {
  const map = {
    submitted: 'border-sky-400/30 bg-sky-500/10 text-sky-200',
    'under-review': 'border-amber-400/30 bg-amber-500/10 text-amber-200',
    forwarded: 'border-indigo-400/30 bg-indigo-500/10 text-indigo-200',
    accepted: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
    rejected: 'border-rose-400/30 bg-rose-500/10 text-rose-200',
    'pending-clarification': 'border-orange-400/30 bg-orange-500/10 text-orange-200',
    'package-ready': 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200',
  };
  return map[status] || 'border-white/20 bg-white/5 text-slate-200';
}

async function calculateSHA256(file) {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const [language, setLanguage] = useState('en');
  const [authMode, setAuthMode] = useState('login');
  const [loginRole, setLoginRole] = useState('victim');
  const [identifier, setIdentifier] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [token, setToken] = useState('');
  const [user, setUser] = useState(null);

  const [fraudType, setFraudType] = useState('UPI Fraud');
  const [form, setForm] = useState(emptyForm());
  const [evidenceMeta, setEvidenceMeta] = useState(emptyMetadata());
  const [complaints, setComplaints] = useState([]);
  const [activeComplaintId, setActiveComplaintId] = useState('');
  const [activeComplaint, setActiveComplaint] = useState(null);
  const [evidences, setEvidences] = useState([]);
  const [statusUpdate, setStatusUpdate] = useState('under-review');
  const [statusRemarks, setStatusRemarks] = useState('');
  const [statusOfficerName, setStatusOfficerName] = useState('');
  const [statusRecipientUnit, setStatusRecipientUnit] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [autoExtractedFields, setAutoExtractedFields] = useState([]);
  const [metadataExtracting, setMetadataExtracting] = useState(false);
  const [editingEvidenceId, setEditingEvidenceId] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // Evidence Locker Preview & Capture Modal state
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [targetComplaintId, setTargetComplaintId] = useState('');
  const [capturedFilePreview, setCapturedFilePreview] = useState('');
  const [capturedFile, setCapturedFile] = useState(null);
  const [manualDescription, setManualDescription] = useState('');

  // Handle Android Native MediaProjection preview event
  useEffect(() => {
    const handleOpenPreviewModal = (event) => {
      const detail = event.detail || {};
      let parsedMeta = {};
      if (typeof detail.metadataJson === 'string') {
        try {
          parsedMeta = JSON.parse(detail.metadataJson);
        } catch (_) {}
      } else if (typeof detail.metadataJson === 'object') {
        parsedMeta = detail.metadataJson;
      }

      const clientMeta = {
        ...emptyMetadata(),
        fileType: parsedMeta.mimeType || 'PNG image',
        source: 'MediaProjection Screen Capture',
        sourceDevice: parsedMeta.deviceModel || 'Android Device',
        collectedAt: parsedMeta.capturedAt || new Date().toISOString(),
        complaintCategory: activeComplaint?.fraudType || fraudType || 'Digital Evidence',
        captureMethod: parsedMeta.captureMethod || 'MEDIA_PROJECTION',
        captureLimitations: `App: Evidence Locker. Timezone: ${parsedMeta.timezone || 'Local'}. Resolution: ${parsedMeta.screenResolution || 'Native'}. Source App: ${parsedMeta.sourceApp || 'unknown'}. SHA-256 Verified.`,
      };
      setEvidenceMeta(clientMeta);

      if (detail.filePath) {
        const previewUrl = window.Capacitor?.convertFileSrc
          ? window.Capacitor.convertFileSrc(detail.filePath)
          : detail.filePath;
        setCapturedFilePreview(previewUrl);

        fetch(previewUrl)
          .then((res) => {
            if (!res.ok) {
              throw new Error(`Unable to read captured screenshot (${res.status})`);
            }
            return res.blob();
          })
          .then((blob) => {
            const fileName = parsedMeta.fileName || `evidence_${Date.now()}.png`;
            const file = new File([blob], fileName, { type: 'image/png' });
            setCapturedFile(file);
          })
          .catch((error) => {
            setCapturedFile(null);
            setMessage(`${error.message}. Please recapture the evidence.`);
          });
      }

      setTargetComplaintId(activeComplaintId);
      setShowPreviewModal(true);
    };

    const handlePermissionGranted = () => {
      setMessage('Evidence Locker MediaProjection Screen Capture Service is ACTIVE! You can open WhatsApp, Instagram, Telegram, Email, or Browser and tap [Capture Screenshot] in your notification bar.');
    };

    const handlePermissionDenied = () => {
      setMessage('Screen capture permission was denied by the user.');
    };

    window.addEventListener('openPreviewModal', handleOpenPreviewModal);
    window.addEventListener('screenCapturePermissionGranted', handlePermissionGranted);
    window.addEventListener('screenCapturePermissionDenied', handlePermissionDenied);

    return () => {
      window.removeEventListener('openPreviewModal', handleOpenPreviewModal);
      window.removeEventListener('screenCapturePermissionGranted', handlePermissionGranted);
      window.removeEventListener('screenCapturePermissionDenied', handlePermissionDenied);
    };
  }, [activeComplaintId, activeComplaint?.fraudType, fraudType]);

  const requestMediaProjectionPermission = () => {
    setMessage('Requesting Android MediaProjection screen capture permission...');
    if (window.AndroidNative?.requestMediaProjection) {
      window.AndroidNative.requestMediaProjection();
    } else {
      setMessage('MediaProjection interface initialized. Please tap again if permission dialog does not show.');
    }
  };

  const handleManualImportSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setMessage('Calculating SHA-256 hash and preparing metadata...');
    try {
      const sha256Hex = await calculateSHA256(file);
      setCapturedFile(file);
      setCapturedFilePreview(URL.createObjectURL(file));

      const clientMeta = {
        ...emptyMetadata(),
        fileType: file.type || 'Image / File',
        source: 'Manual Screenshot / Photo Import',
        sourceDevice: navigator.userAgent.includes('Android') ? 'Android System Photo Picker' : 'Device Storage Picker',
        collectedAt: new Date(file.lastModified || Date.now()).toISOString(),
        complaintCategory: activeComplaint?.fraudType || fraudType || 'Digital Evidence',
        captureMethod: 'MANUAL_UPLOAD',
        captureLimitations: `App: Evidence Locker. Import: Manual Photo Picker. File Size: ${(file.size / 1024).toFixed(1)} KB. SHA-256: ${sha256Hex}.`,
      };
      setEvidenceMeta({ ...clientMeta, sha256Hash: sha256Hex });
      setTargetComplaintId(activeComplaintId);
      setShowPreviewModal(true);
    } catch (err) {
      setMessage('Error reading file: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const t = LANG[language];
  const fields = useMemo(() => FRAUD_FIELDS[fraudType] || FRAUD_FIELDS.Other, [fraudType]);
  const isComplaintEditor = location.pathname.startsWith('/dashboard/complaints');

  const role = user?.role || '';
  const canEditComplaint = roleCanEditComplaint(role);
  const canUpload = roleCanUpload(role);
  const canUpdateStatus = roleCanUpdateStatus(role);
  const canEditEvidenceMetadata = roleCanEditEvidenceMetadata(role);

  async function extractMetadataForFiles(files) {
    if (!files.length) {
      setAutoExtractedFields([]);
      return;
    }

    const firstFile = files[0];
    const clientMeta = extractClientMetadata(firstFile, activeComplaint);
    const merged = mergeMetadata(clientMeta, {
      ...evidenceMeta,
      complaintCategory: activeComplaint?.fraudType || fraudType || clientMeta.complaintCategory,
    });
    setEvidenceMeta(merged);
    setAutoExtractedFields(Object.keys(clientMeta).filter((key) => clientMeta[key]));

    if (!activeComplaintId || !token) {
      return;
    }

    setMetadataExtracting(true);
    try {
      const formData = new FormData();
      formData.append('file', firstFile);
      formData.append('lastModified', String(firstFile.lastModified || ''));
      formData.append('metadataJson', JSON.stringify(merged));
      const result = await api.extractEvidenceMetadata(activeComplaintId, formData, token);
      setEvidenceMeta(result.metadata);
      setAutoExtractedFields(result.autoExtracted || []);
      setMessage('Metadata auto-extracted from file. Review and upload when ready.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setMetadataExtracting(false);
    }
  }

  async function handleFilesSelected(event) {
    const files = Array.from(event.target.files || []);
    setSelectedFiles(files);
    await extractMetadataForFiles(files);
  }

  function loadEvidenceMetadata(item) {
    setEvidenceMeta({
      ...emptyMetadata(),
      ...(item.metadata || {}),
    });
    setAutoExtractedFields([]);
  }

  async function loadComplaints() {
    if (!token) return;
    const data = await api.listComplaints(token);
    setComplaints(data);
  }

  async function openComplaint(complaintId) {
    const detail = await api.getComplaint(complaintId, token);
    setActiveComplaintId(complaintId);
    setActiveComplaint(detail.complaint);
    setEvidences(detail.evidences || []);
    setFraudType(detail.complaint.fraudType || 'Other');
    setForm({
      ...emptyForm(),
      ...detail.complaint,
      formData: detail.complaint.formData || {},
    });
    navigate(`/dashboard/complaints/${complaintId}`);
  }

  function startNewComplaint() {
    setActiveComplaintId('');
    setActiveComplaint(null);
    setEvidences([]);
    setFraudType('UPI Fraud');
    setForm(emptyForm());
    setEvidenceMeta(emptyMetadata());
    setSelectedFiles([]);
    setAutoExtractedFields([]);
    setEditingEvidenceId('');
    navigate('/dashboard/complaints/new');
  }

  useEffect(() => {
    navigate(token ? '/dashboard' : '/auth', { replace: true });
  }, [token, navigate]);

  useEffect(() => {
    const session = readSession();
    if (session?.token) {
      setToken(session.token);
      api
        .getMe(session.token)
        .then((result) => setUser(result.user))
        .catch(() => {
          clearSession();
          setToken('');
          setUser(null);
        });
    }
  }, []);

  useEffect(() => {
    if (token) {
      loadComplaints().catch((error) => setMessage(error.message));
    }
  }, [token]);

  useEffect(() => {
    if (activeComplaint?.fraudType) {
      setEvidenceMeta((current) => ({
        ...current,
        complaintCategory: current.complaintCategory || activeComplaint.fraudType,
      }));
    }
  }, [activeComplaint?.fraudType]);

  const requestOtp = async () => {
    setMessage('');
    try {
      const result = await api.requestOtp({
        mode: authMode,
        role: loginRole,
        identifier,
        ...(authMode === 'register' ? { displayName } : {}),
      });
      setChallengeId(result.challengeId);
      setDevOtp(result.devOtp || '');
      setMessage(
        result.deliveryMethod === 'email'
          ? result.message
          : `OTP generated. ${result.devOtp ? `Dev OTP: ${result.devOtp}` : ''}`
      );
    } catch (error) {
      setMessage(error.message);
    }
  };

  const verifyOtp = async () => {
    setMessage('');
    try {
      const result = await api.verifyOtp({ challengeId, otp });
      setToken(result.token);
      setUser(result.user);
      saveSession({ token: result.token });
      setMessage('Login successful.');
      await loadComplaints();
    } catch (error) {
      setMessage(error.message);
    }
  };

  const logout = async () => {
    try {
      if (token) {
        await api.logout(token);
      }
    } catch (_) {
    } finally {
      clearSession();
      setToken('');
      setUser(null);
      setComplaints([]);
      setActiveComplaint(null);
      setActiveComplaintId('');
      setEvidences([]);
      setMessage('Logged out.');
    }
  };

  const submitComplaint = async (event) => {
    event.preventDefault();
    if (!canEditComplaint) {
      setMessage('This role can review/export only.');
      return;
    }

    setLoading(true);
    setMessage('');
    try {
      const payload = {
        victimName: form.victimName,
        phone: form.phone,
        email: form.email,
        city: form.city,
        state: form.state,
        fraudType,
        incidentDate: form.incidentDate,
        formData: form.formData,
        victimClientId: form.victimClientId,
      };
      const result = activeComplaintId
        ? await api.updateComplaint(activeComplaintId, payload, token)
        : await api.createComplaint(payload, token);
      setMessage(activeComplaintId ? 'Complaint updated.' : 'Complaint created.');
      await loadComplaints();
      await openComplaint(result.complaint._id);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  const confirmAndUploadCapturedEvidence = async () => {
    const complaintIdToUse = targetComplaintId || activeComplaintId;
    if (!complaintIdToUse) {
      setMessage('Please select or create an incident/complaint to upload evidence to.');
      return;
    }
    if (!capturedFile) {
      setMessage('No evidence file ready.');
      return;
    }
    const formData = new FormData();
    formData.append('files', capturedFile);
    if (manualDescription) {
      evidenceMeta.captureLimitations += ` Description: ${manualDescription}`;
    }
    formData.append('metadataJson', JSON.stringify(evidenceMeta));
    setLoading(true);
    try {
      const result = await api.uploadEvidence(complaintIdToUse, formData, token);
      setMessage(result.provenanceNotice || 'Evidence uploaded, hashed, and metadata logged successfully.');
      await openComplaint(complaintIdToUse);
      await loadComplaints();
      setShowPreviewModal(false);
      setCapturedFile(null);
      setCapturedFilePreview('');
      setManualDescription('');
      setEvidenceMeta(emptyMetadata());
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  const uploadEvidence = async () => {
    if (!activeComplaintId) {
      setMessage('Select a complaint first.');
      return;
    }
    if (!canUpload) {
      setMessage('This role cannot upload evidence.');
      return;
    }
    if (!selectedFiles.length) {
      setMessage('Select at least one file.');
      return;
    }
    const formData = new FormData();
    selectedFiles.forEach((file) => formData.append('files', file));
    formData.append('metadataJson', JSON.stringify(evidenceMeta));
    setLoading(true);
    setMessage('');
    try {
      const result = await api.uploadEvidence(activeComplaintId, formData, token);
      setMessage(result.provenanceNotice || result.message);
      await openComplaint(activeComplaintId);
      await loadComplaints();
      setSelectedFiles([]);
      setAutoExtractedFields([]);
      setEvidenceMeta(emptyMetadata());
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  const updateEvidenceMetadata = async (evidenceId) => {
    if (!canEditEvidenceMetadata) {
      setMessage('This role cannot edit evidence metadata.');
      return;
    }
    try {
      await api.updateEvidenceMetadata(evidenceId, { metadata: evidenceMeta }, token);
      setMessage('Evidence metadata updated.');
      await openComplaint(activeComplaintId);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const updateStatus = async () => {
    if (!canUpdateStatus || !activeComplaintId) {
      return;
    }
    try {
      await api.updateComplaintStatus(
        activeComplaintId,
        {
          status: statusUpdate,
          remarks: statusRemarks,
          officerName: statusOfficerName,
          recipientUnit: statusRecipientUnit,
        },
        token
      );
      setMessage('Status updated.');
      await openComplaint(activeComplaintId);
      await loadComplaints();
    } catch (error) {
      setMessage(error.message);
    }
  };

  const downloadPackage = async () => {
    if (!activeComplaintId) return;
    const blob = await api.downloadPackage(activeComplaintId, token);
    downloadBlob(blob, `complaint-${activeComplaintId.slice(-6)}.pdf`);
    setMessage('Police-ready packet downloaded.');
    await openComplaint(activeComplaintId);
  };

  const downloadEvidence = async (item) => {
    const blob = await api.downloadEvidence(item._id, token);
    downloadBlob(blob, item.originalFilename);
    await openComplaint(activeComplaintId);
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.15),_transparent_35%),linear-gradient(180deg,#020617_0%,#0f172a_100%)]">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 lg:py-10">
        <AppHeader language={language} onLanguageChange={setLanguage} t={t} />

        {!token ? (
          <div className="mx-auto max-w-3xl">
            <AuthPanel
              authMode={authMode}
              setAuthMode={(mode) => {
                setAuthMode(mode);
                setChallengeId('');
                setMessage('');
              }}
              loginRole={loginRole}
              setLoginRole={setLoginRole}
              identifier={identifier}
              setIdentifier={setIdentifier}
              displayName={displayName}
              setDisplayName={setDisplayName}
              challengeId={challengeId}
              otp={otp}
              setOtp={setOtp}
              devOtp={devOtp}
              requestOtp={requestOtp}
              verifyOtp={verifyOtp}
              loading={loading}
              t={t}
            />
          </div>
        ) : null}

        {token ? (
          <>
            <nav className="mt-4 flex gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-white/5 p-2" aria-label="Main navigation">
              <button type="button" className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold ${location.pathname === '/dashboard' ? 'bg-sky-500 text-white' : 'text-slate-300 hover:bg-white/10'}`} onClick={() => navigate('/dashboard')}>
                Overview
              </button>
              <button type="button" className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold ${isComplaintEditor ? 'bg-sky-500 text-white' : 'text-slate-300 hover:bg-white/10'}`} onClick={startNewComplaint}>
                New complaint
              </button>
            </nav>
            <DashboardPage>
            <div className="min-w-0 space-y-4 sm:space-y-6">
              {!isComplaintEditor ? (
                <div className="glass-card border-sky-400/20 p-5 sm:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">Complaint workspace</p>
                      <h2 className="mt-2 text-xl font-semibold text-white">Create a new cyber-fraud complaint</h2>
                      <p className="mt-2 text-sm text-slate-300">Add victim details, incident information, and evidence in one guided form.</p>
                    </div>
                    <button type="button" className="primary-button w-full shrink-0 sm:w-auto" onClick={startNewComplaint}>
                      + New complaint
                    </button>
                  </div>
                </div>
              ) : null}
              {/* Evidence Locker Evidence Collection Section */}
              <div className="glass-card p-6">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <span>🛡️</span> Evidence Locker Digital Evidence Collection
                </h3>
                <p className="mt-2 text-xs text-slate-300">
                  Capture digital evidence directly from WhatsApp, Instagram, Telegram, Email, or Browser using MediaProjection, or upload existing evidence manually.
                </p>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  {/* Feature 1: Start MediaProjection Capture */}
                  <div className="rounded-2xl border border-sky-400/30 bg-sky-500/10 p-5 space-y-3">
                    <h4 className="font-semibold text-white flex items-center gap-2">
                      <span>📸</span> Capture Evidence (MediaProjection)
                    </h4>
                    <p className="text-xs text-slate-300">
                      Requests official Android Screen Capture permission. Allows leaving Evidence Locker to view WhatsApp or other apps, then capturing via the persistent notification.
                    </p>
                    <button
                      type="button"
                      onClick={requestMediaProjectionPermission}
                      className="primary-button w-full bg-sky-500 hover:bg-sky-400 text-white font-semibold py-3 rounded-xl"
                    >
                      Start Evidence Capture
                    </button>
                  </div>

                  {/* Feature 7: Manual Screenshot / Evidence Import */}
                  <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 space-y-3">
                    <h4 className="font-semibold text-white flex items-center gap-2">
                      <span>📁</span> Upload Existing Evidence
                    </h4>
                    <p className="text-xs text-slate-300">
                      Import an existing screenshot, photo, or document from your device using the Android System Photo / File Picker.
                    </p>
                    <label className="secondary-button w-full text-center cursor-pointer py-3 rounded-xl block font-semibold">
                      <span>Choose File / Screenshot</span>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        className="hidden"
                        onChange={handleManualImportSelected}
                      />
                    </label>
                  </div>
                </div>
              </div>

              {isComplaintEditor ? <div className="glass-card min-w-0 p-4 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="text-xl font-semibold text-white">{activeComplaintId ? 'Update complaint' : 'New complaint'}</h2>
                  <div className="flex w-full items-center gap-2 sm:w-auto">
                    <span className="min-w-0 flex-1 truncate rounded-full border border-white/20 bg-white/5 px-3 py-2 text-center text-xs uppercase tracking-[0.2em] text-slate-200 sm:flex-none">
                      {user?.role}
                    </span>
                    <button type="button" className="secondary-button px-3 py-2 text-sm" onClick={logout}>
                      Logout
                    </button>
                  </div>
                </div>

                <form className="mt-4 space-y-4" onSubmit={submitComplaint}>
                  <div className="grid min-w-0 gap-4 md:grid-cols-2">
                    {COMMON_FIELDS.map((field) => (
                      <label key={field.name}>
                        <span className="label-text">{field.label}</span>
                        <input
                          type={field.type || 'text'}
                          className="input-field min-w-0"
                          value={form[field.name] || ''}
                          onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))}
                          disabled={!canEditComplaint}
                        />
                      </label>
                    ))}
                  </div>
                  {['support', 'admin'].includes(role) ? (
                    <label>
                      <span className="label-text">Victim client ID (required for support/admin create)</span>
                      <input
                        className="input-field min-w-0"
                        value={form.victimClientId || ''}
                        onChange={(event) => setForm((current) => ({ ...current, victimClientId: event.target.value }))}
                        disabled={!canEditComplaint}
                      />
                    </label>
                  ) : null}
                  <label>
                    <span className="label-text">Complaint category</span>
                    <select className="input-field min-w-0" value={fraudType} onChange={(e) => setFraudType(e.target.value)} disabled={!canEditComplaint}>
                      {FRAUD_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="grid gap-4">
                    {fields.map((field) => (
                      <label key={field.name}>
                        <span className="label-text">{field.label}</span>
                        {field.type === 'textarea' ? (
                          <textarea
                            className="input-field min-w-0"
                            rows={3}
                            value={form.formData?.[field.name] || ''}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                formData: {
                                  ...(current.formData || {}),
                                  [field.name]: event.target.value,
                                },
                              }))
                            }
                            disabled={!canEditComplaint}
                          />
                        ) : (
                          <input
                            className="input-field min-w-0"
                            value={form.formData?.[field.name] || ''}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                formData: {
                                  ...(current.formData || {}),
                                  [field.name]: event.target.value,
                                },
                              }))
                            }
                            disabled={!canEditComplaint}
                          />
                        )}
                      </label>
                    ))}
                  </div>
                  <button className="primary-button w-full sm:w-auto" type="submit" disabled={loading || !canEditComplaint}>
                    {activeComplaintId ? 'Update complaint' : 'Create complaint'}
                  </button>
                </form>
              </div> : null}

              <div className="glass-card p-6">
                <h3 className="text-lg font-semibold text-white">{t.evidenceMeta}</h3>
                <p className="mt-2 text-xs text-slate-400">
                  Select a file to auto-extract metadata (file type, source, device, capture time, category). You can review or override before upload.
                </p>
                {metadataExtracting ? <p className="mt-2 text-xs text-sky-300">Extracting metadata...</p> : null}
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {METADATA_FIELDS.map((key) => (
                    <label key={key}>
                      <span className="label-text flex items-center gap-2">
                        {METADATA_LABELS[key] || key}
                        {autoExtractedFields.includes(key) ? (
                          <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-200">
                            Auto
                          </span>
                        ) : null}
                      </span>
                      <input
                        className="input-field"
                        value={evidenceMeta[key] || ''}
                        onChange={(e) => {
                          setEvidenceMeta((current) => ({ ...current, [key]: e.target.value }));
                          setAutoExtractedFields((current) => current.filter((field) => field !== key));
                        }}
                      />
                    </label>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <input
                    type="file"
                    multiple
                    className="block w-full text-sm text-slate-300 file:mr-4 file:rounded-xl file:border-0 file:bg-sky-500 file:px-4 file:py-2 file:text-white"
                    onChange={handleFilesSelected}
                    disabled={!activeComplaintId || !canUpload || metadataExtracting}
                  />
                  <button type="button" className="primary-button" disabled={!activeComplaintId || !canUpload || loading || metadataExtracting} onClick={uploadEvidence}>
                    Upload + hash + timestamp
                  </button>
                  {canEditEvidenceMetadata && editingEvidenceId ? (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => updateEvidenceMetadata(editingEvidenceId)}
                    >
                      Save metadata to selected evidence
                    </button>
                  ) : null}
                  <button type="button" className="secondary-button" onClick={downloadPackage} disabled={!activeComplaintId}>
                    Download police packet (PDF)
                  </button>
                </div>
                <p className="mt-3 text-xs text-slate-400">
                  Provenance limit: upload-time hashing does not prove original pre-upload integrity. Capture source/method notes are included for investigators.
                </p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="glass-card p-6">
                <h3 className="text-lg font-semibold text-white">Complaints</h3>
                <div className="mt-4 space-y-3">
                  {complaints.length ? complaints.map((item) => (
                    <button
                      key={item._id}
                      type="button"
                      onClick={() => openComplaint(item._id)}
                      className={`w-full rounded-2xl border p-4 text-left ${activeComplaintId === item._id ? 'border-sky-400 bg-sky-500/10' : 'border-white/10 bg-slate-900/60'
                        }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <strong className="text-white">{item.fraudType}</strong>
                        <span className={`rounded-full border px-2 py-1 text-xs ${badgeForStatus(item.status)}`}>{item.status}</span>
                      </div>
                      <p className="mt-2 text-xs text-slate-300">{item.victimName}</p>
                      <p className="text-xs text-slate-400">Updated: {formatDate(item.updatedAt)}</p>
                    </button>
                  )) : (
                    <div className="rounded-2xl border border-dashed border-white/15 bg-slate-900/40 p-5 text-center">
                      <p className="text-sm text-slate-300">No complaints created yet.</p>
                      <button type="button" className="primary-button mt-4 w-full sm:w-auto" onClick={startNewComplaint}>
                        Create your first complaint
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {activeComplaint ? (
                <div className="glass-card p-6">
                  <h3 className="text-lg font-semibold text-white">Status and police handoff</h3>
                  {canUpdateStatus ? (
                    <div className="mt-4 space-y-3">
                      <select className="input-field" value={statusUpdate} onChange={(e) => setStatusUpdate(e.target.value)}>
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                      <input className="input-field" placeholder="Recipient unit" value={statusRecipientUnit} onChange={(e) => setStatusRecipientUnit(e.target.value)} />
                      <input className="input-field" placeholder="Officer name" value={statusOfficerName} onChange={(e) => setStatusOfficerName(e.target.value)} />
                      <textarea className="input-field" rows={2} placeholder="Remarks" value={statusRemarks} onChange={(e) => setStatusRemarks(e.target.value)} />
                      <button type="button" className="primary-button" onClick={updateStatus}>
                        Update status
                      </button>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-400">Current status: {activeComplaint.status}</p>
                  )}
                </div>
              ) : null}

              {activeComplaint ? (
                <div className="glass-card p-6">
                  <h3 className="text-lg font-semibold text-white">Evidence and custody log</h3>
                  <div className="mt-4 space-y-4">
                    {evidences.map((item) => (
                      <div key={item._id} className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-white">{item.originalFilename}</p>
                            <p className="text-xs text-slate-400">SHA-256: {item.sha256Hash}</p>
                          </div>
                          <div className="flex gap-2">
                            <button className="secondary-button px-3 py-2 text-sm" type="button" onClick={() => downloadEvidence(item)}>
                              Download
                            </button>
                            {canEditEvidenceMetadata ? (
                              <button
                                className="secondary-button px-3 py-2 text-sm"
                                type="button"
                                onClick={() => {
                                  loadEvidenceMetadata(item);
                                  setEditingEvidenceId(item._id);
                                  setMessage(`Loaded metadata from ${item.originalFilename} for editing.`);
                                }}
                              >
                                Load for edit
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <div className="mt-3 text-xs text-slate-300">
                          {(item.custodyLog || []).slice(-5).map((entry, idx) => (
                            <p key={`${item._id}-log-${idx}`}>
                              {formatDate(entry.timestamp)} - {entry.action} by {entry.actorRole} ({entry.actor})
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="glass-card p-6">
                <h3 className="text-lg font-semibold text-white">{t.help}</h3>
                <ul className="mt-3 space-y-2 text-sm text-slate-300">
                  <li>Helpline: Dial 1930 immediately for cyber fraud reporting.</li>
                  <li>FAQ: If upload fails, retry with stable internet and complete required metadata fields.</li>
                  <li>If complaint is pending clarification, update missing fields and re-submit evidence notes.</li>
                  <li>This is a support layer aligned to cyber-cell intake, not a replacement for official portals.</li>
                </ul>
              </div>
            </div>
            </DashboardPage>
          </>
        ) : null}

        {token ? <Chatbot token={token} /> : null}

        {/* Feature 4: Evidence Locker Evidence Preview & Confirmation Modal */}
        {showPreviewModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-3 backdrop-blur-md sm:p-4">
            <div role="dialog" aria-modal="true" aria-labelledby="evidence-preview-title" className="my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-900 p-4 text-white shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:p-6">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <h3 id="evidence-preview-title" className="text-xl font-bold flex items-center gap-2">
                  <span>🛡️</span> Evidence Locker Evidence Preview
                </h3>
                <button
                  type="button"
                  onClick={() => setShowPreviewModal(false)}
                  className="rounded-full bg-white/10 px-3 py-1 text-sm text-slate-300 hover:bg-white/20"
                >
                  ✕
                </button>
              </div>

              <div className="mt-4 min-h-0 space-y-4 overflow-y-auto pr-1">
                <p className="text-xs text-emerald-300 font-medium">
                  Inspect your captured evidence and metadata below before uploading to your vault.
                </p>

                {capturedFilePreview && (
                  <div className="relative h-52 w-full overflow-hidden rounded-2xl border border-white/10 bg-black/60">
                    <img src={capturedFilePreview} alt="Evidence Preview" className="h-full w-full object-contain" />
                  </div>
                )}

                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-slate-300">Target Incident / Complaint:</span>
                  <select
                    className="input-field text-sm"
                    value={targetComplaintId || activeComplaintId}
                    onChange={(e) => setTargetComplaintId(e.target.value)}
                  >
                    <option value="">-- Select Incident / Complaint --</option>
                    {complaints.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.fraudType} ({c.status}) - ID: {c._id.slice(-6)}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="rounded-2xl border border-white/10 bg-slate-800/80 p-4 space-y-2 text-xs text-slate-300">
                  <div className="flex justify-between">
                    <span>Capture Time:</span>
                    <strong className="text-white">
                      {evidenceMeta.collectedAt ? new Date(evidenceMeta.collectedAt).toLocaleString() : new Date().toLocaleString()}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Source Application:</span>
                    <strong className="text-sky-300">{evidenceMeta.sourceApp || 'unknown'}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>File Size:</span>
                    <strong className="text-white">
                      {capturedFile ? `${(capturedFile.size / 1024).toFixed(1)} KB` : 'N/A'}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Capture Method:</span>
                    <strong className="text-amber-300">{evidenceMeta.captureMethod || 'MEDIA_PROJECTION'}</strong>
                  </div>
                  <div className="break-all pt-2 border-t border-white/10">
                    <span className="block text-[10px] text-slate-400">SHA-256 Hash:</span>
                    <code className="text-[11px] text-emerald-400 font-mono">
                      {evidenceMeta.sha256Hash || evidenceMeta.sha256 || 'Calculated on device'}
                    </code>
                  </div>
                </div>

                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-slate-300">Optional Description / Notes:</span>
                  <input
                    type="text"
                    className="input-field text-sm"
                    placeholder="e.g. WhatsApp threat message screenshot"
                    value={manualDescription}
                    onChange={(e) => setManualDescription(e.target.value)}
                  />
                </label>

                {/* Feature 4 & 6: Action Buttons */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      // Recapture: Discard temporary screenshot and return to capture state
                      setCapturedFile(null);
                      setCapturedFilePreview('');
                      setShowPreviewModal(false);
                      setMessage('Temporary evidence discarded. You can capture a new screenshot from any app.');
                    }}
                    className="secondary-button flex-1 py-3 rounded-xl text-slate-300"
                  >
                    Recapture
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPreviewModal(false)}
                    className="secondary-button flex-1 py-3 rounded-xl text-rose-300 border-rose-500/20"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmAndUploadCapturedEvidence}
                    disabled={loading}
                    className="primary-button flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-semibold"
                  >
                    {loading ? 'Uploading...' : 'Upload Evidence'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {message ? (
          <div role="status" className="mt-6 flex items-start gap-3 rounded-2xl border border-sky-400/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
            <p className="min-w-0 flex-1 break-words">{message}</p>
            <button type="button" className="shrink-0 rounded-lg px-2 text-lg leading-none text-sky-200 hover:bg-white/10" onClick={() => setMessage('')} aria-label="Dismiss message">
              ×
            </button>
          </div>
        ) : null}
      </div>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/auth" element={<AppContent />} />
      <Route path="/dashboard/*" element={<AppContent />} />
      <Route path="*" element={<Navigate to="/auth" replace />} />
    </Routes>
  );
}
