import { route } from '../lib/http.js';
import { geminiConfigured, geminiModel } from '../lib/gemini.js';

export default route(async () => ({ ok: true, gemini: geminiConfigured(), model: geminiConfigured() ? geminiModel() : null }), { methods: ['GET'] });
