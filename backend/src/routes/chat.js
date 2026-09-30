const express = require('express');
const mongoose = require('mongoose');
const { requireAuth } = require('../middleware/auth');
const Evidence = require('../models/Evidence');

const router = express.Router();

const SYSTEM_INSTRUCTION = `You are the AI assistant for a Digital Evidence Management and Cyber Incident Assistance Platform.
Help users understand digital incidents, preserve and organize evidence, create timelines, and prepare factual incident reports.
Use simple, calm English. Ask only relevant follow-up questions and never assume missing facts.
Never fabricate, alter, authenticate, or claim evidence proves an allegation. Clearly separate user-provided facts, observations, claims, and possible interpretations.
Never ask for passwords, OTPs, private keys, or API keys. Do not provide definitive legal conclusions; say that you are an information and documentation assistant, not a lawyer, police officer, investigator, or forensic examiner.
If there is immediate physical danger, prioritize safety and recommend emergency services. Do not encourage confrontation, retaliation, or hacking.
When asked to create a report, use only information in the conversation and mark missing fields as Not provided.
When asked to analyze evidence, state what was provided, what is visible or contained, important details, timeline information, identifiers, what can and cannot be concluded, and documentation steps.`;

router.post('/', requireAuth(), async (req, res, next) => {
  try {
    const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
      return res.status(503).json({ message: 'Gemini is not configured. Set GEMINI_API_KEY in backend/.env.' });
    }

    const messages = Array.isArray(req.body.messages) ? req.body.messages : [];
    const incidentId = String(req.body.incidentId || '').trim();
    let evidenceContext = '';
    if (incidentId && mongoose.isValidObjectId(incidentId)) {
      const evidence = await Evidence.find({
        incidentId,
        userId: req.user.id,
      })
        .select('originalFilename fileSize mimeType sha256Hash capturedAt uploadedAt captureMethod sourceApplication description uploadStatus')
        .sort({ capturedAt: 1, uploadedAt: 1 })
        .limit(100)
        .lean();

      evidenceContext = `\nAuthorized evidence metadata for incident ${incidentId} (metadata only; files were not sent to you):\n${
        evidence.length
          ? JSON.stringify(evidence)
          : 'No evidence records were found for this incident.'
      }\nUse this context only when relevant. Do not infer facts beyond these fields.`;
    } else if (incidentId) {
      return res.status(400).json({ message: 'incidentId must be a valid incident identifier.' });
    }
    const rawContents = messages
      .slice(-30)
      .filter((message) => ['user', 'model'].includes(message?.role) && typeof message.text === 'string')
      .map((message) => ({
        role: message.role,
        parts: [{ text: message.text.slice(0, 4000) }],
      }));

    // Gemini expects turns to alternate. Combine consecutive messages from the same side.
    const contents = rawContents.reduce((turns, message) => {
      const previous = turns[turns.length - 1];
      if (previous?.role === message.role) {
        previous.parts[0].text += `\n${message.parts[0].text}`;
      } else {
        turns.push(message);
      }
      return turns;
    }, []);

    if (!contents.length || contents[contents.length - 1].role !== 'user') {
      return res.status(400).json({ message: 'A user message is required.' });
    }

    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const controller = new AbortController();
    const timeoutMs = Math.max(Number(process.env.GEMINI_TIMEOUT_MS || 15000), 1000);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
      const requestOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION + evidenceContext }] },
          contents,
          generationConfig: { temperature: 0.2, maxOutputTokens: 1200 },
        }),
        signal: controller.signal,
      };

      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
            requestOptions
          );
          break;
        } catch (error) {
          const networkCode = error.code || error.cause?.code;
          const transient = error.name === 'AbortError' || ['UND_ERR_CONNECT_TIMEOUT', 'ECONNRESET', 'ETIMEDOUT'].includes(networkCode);
          if (!transient || attempt === 1) {
            if (transient) {
              return res.status(504).json({
                message: 'Gemini is unreachable right now. Check your internet connection, firewall, or proxy and try again.',
              });
            }
            throw error;
          }
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    } finally {
      clearTimeout(timeout);
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const upstreamMessage = payload.error?.message;
      console.error('Gemini request failed:', response.status, upstreamMessage || payload);
      return res.status(502).json({
        message: upstreamMessage
          ? `Gemini request failed: ${upstreamMessage}`
          : 'Gemini could not process the conversation right now.',
      });
    }

    const reply = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
    if (!reply) {
      return res.status(502).json({ message: 'Gemini returned an empty response.' });
    }

    return res.json({ reply, model });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
