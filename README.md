# 🛡️ Evidence Locker

Evidence Locker is a cyber-fraud complaint support platform designed for India. It helps victims, support workers, police officers, and administrators prepare structured complaint packages with digital evidence, custody tracking, complaint workflows, and secure access controls.

> Disclaimer: Evidence Locker helps users prepare and document cyber-fraud complaints. It does not guarantee FIR registration, investigation outcomes, legal action, or conviction.

---

## What this project does

- Creates and manages cyber-fraud complaints
- Tracks victims, support staff, police reviewers, and admin workflows
- Uploads and stores evidence files with metadata and hash validation
- Maintains audit logs and evidence chain-of-custody records
- Generates a complaint package ready for review or submission
- Supports OTP-based login and role-aware authorization
- Includes an authenticated AI chatbot for incident guidance and report preparation
- Supports English and Hindi UI text

---

## User roles

### Victim
- Register or sign in with an email/phone identifier
- Create and update complaints
- Upload evidence files
- Review complaint status and evidence metadata

### Support / NGO Helper
- Assist victims with complaint preparation
- Edit evidence metadata
- Manage complaint records and supporting documentation

### Police Officer
- Review complaint submissions
- Update complaint status and review evidence
- Forward or request clarification

### Admin
- Manage users and policies
- Review audit logs
- Oversee activity and access control

---

## Core features

- OTP-based authentication
- JWT-based session auth
- Role-based access control (RBAC)
- Complaint lifecycle tracking
- Evidence upload, metadata extraction, and file hashing
- Chain-of-custody event logging
- PDF-ready complaint package generation
- Jurisdiction-aware complaint workflows
- AI-assisted incident guidance, timeline building, and factual report preparation
- Audit logging for evidence actions and auth events
- Local dev OTP exposure option for testing

---

## AI chatbot

Evidence Locker includes an authenticated AI assistant powered by Google Gemini. The chatbot helps users:

- Understand and describe digital-fraud incidents in simple language
- Identify missing facts and ask relevant follow-up questions
- Organize incident timelines and prepare factual report drafts
- Understand evidence-preservation and documentation steps
- Use authorized evidence metadata linked to an incident, such as filenames, hashes, capture times, upload times, and descriptions

The chatbot receives evidence metadata only when an authorized user links a valid incident; the underlying evidence files are not sent to the model through this route. Conversation history is bounded before it is forwarded to Gemini, and the backend applies request timeouts and explicit upstream error handling.

### AI safety boundaries

The chatbot must not be treated as a lawyer, police officer, investigator, forensic examiner, or emergency service. It does not authenticate evidence, fabricate missing facts, provide definitive legal conclusions, or guarantee FIR registration, investigation outcomes, fund recovery, or conviction. Users and authorized reviewers must verify AI-generated guidance against the original facts and evidence.

The chatbot requires `GEMINI_API_KEY`. An optional `GEMINI_MODEL` selects the Gemini model, and `GEMINI_TIMEOUT_MS` controls the upstream request timeout. If the API key is not configured, the chat endpoint returns a clear configuration error instead of a fabricated response.

---

## Complaint workflow

```text
Create complaint
  ↓
Upload evidence
  ↓
Capture metadata / hash file
  ↓
Store evidence and audit events
  ↓
Review complaint status
  ↓
Forward / accept / reject / request clarification
  ↓
Generate police-ready complaint package
```

---

## Tech stack

### Frontend
- React
- Vite
- React Router
- Tailwind CSS

### Backend
- Node.js
- Express
- MongoDB with Mongoose
- Multer for uploads
- PDF generation utilities
- Nodemailer for OTP delivery
- exifr for metadata extraction

### Security and operations
- JWT session tokens
- OTP verification for auth
- SHA-256 file integrity checks
- Role-based permissions
- Audit logging
- Retention jobs for cleanup

---

## Project structure

```text
Evidence Locker/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── utils/
│   │   ├── app.js
│   │   └── server.js
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   ├── vite.config.js
│   └── package.json
├── mobile/
│   └── frontend/
├── package.json
├── README.md
├── package-lock.json
└── .gitignore
```

---

## Quick start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy the backend example environment file and update values as needed:

```bash
cp backend/.env.example backend/.env
```

Important values include:
- `MONGODB_URI`
- `CLIENT_ORIGIN`
- `SECURITY_SECRET`
- `GEMINI_API_KEY` (for chatbot features)
- `GMAIL_USER` / `APP_PASSWORD` for email OTP delivery

### 3. Start the app

Run both frontend and backend together:

```bash
npm run dev
```

Or start them separately:

```bash
npm run dev:backend
npm run dev:frontend
```

### 4. Production backend startup

```bash
npm start
```

### 5. Frontend production build

```bash
npm run build
```

---

## Environment notes

The project loads environment variables from:
- root `.env` (if present)
- `backend/.env` (preferred for backend config)

The backend validates production config and requires `SECURITY_SECRET` in production mode.

---

## Security notes

- Keep `SECURITY_SECRET` unique and private in production
- Use Gmail app passwords or SMTP credentials for OTP email delivery
- Keep backend `.env` values off client-side code
- Treat OTP values as temporary and expiry-limited
- Do not expose development OTPs in non-local or public environments

---

## License

This project is intended for demo and internal use in the current repository context. Add an explicit license file if you plan to distribute or publish it publicly.

---

## Support

For setup questions or feature requests, review the existing project files and backend config examples before extending the app.
# Evidence-Locker
