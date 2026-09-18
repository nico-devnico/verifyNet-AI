require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

const analysisRoutes = require('./routes/analysis');
const adminRoutes = require('./routes/admin');
const { attachUser } = require('./middleware/auth');
const { isConfigured, hasServiceRole } = require('./lib/supabase');
const settings = require('./services/settings');

const app = express();
const PORT = process.env.PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

app.set('trust proxy', 1);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Les textes extraits d'un PDF de plusieurs pages dépassent facilement 1 Mo.
app.use(express.json({ limit: '8mb' }));

// Résout l'utilisateur (si un token est fourni) avant toute limitation, afin de
// pouvoir exempter les administrateurs.
app.use('/api', attachUser);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: { error: 'Trop de requêtes, veuillez réessayer dans quelques minutes.', code: 'RATE_LIMITED' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => Boolean(req.auth?.isAdmin),
  /*
   * Compter par utilisateur plutôt que par IP évite de pénaliser tout un
   * réseau partagé. Pour les visiteurs anonymes on retombe sur l'IP, en
   * passant par `ipKeyGenerator` : il normalise les adresses IPv6 en
   * agrégeant le préfixe /64, sans quoi un même client pourrait changer
   * d'adresse à chaque requête et contourner la limite.
   */
  keyGenerator: (req) => req.auth?.user?.id || ipKeyGenerator(req.ip),
});
app.use('/api/', limiter);

app.use('/api/analyze', analysisRoutes);
app.use('/api/admin', adminRoutes);

/**
 * Configuration publique consommée par le frontend au démarrage.
 * Expose uniquement les réglages non sensibles, plus l'état des intégrations,
 * ce qui permet à l'interface de masquer proprement les fonctions indisponibles.
 */
app.get('/api/config', async (_req, res) => {
  const all = await settings.loadSettings();
  const PUBLIC_KEYS = [
    'app_name', 'app_tagline', 'maintenance_mode', 'maintenance_message',
    'enable_registrations', 'allow_anonymous_analysis', 'max_analyses_per_day',
    'max_anonymous_per_day', 'max_upload_size_mb', 'max_text_length',
    'enable_image_analysis', 'enable_document_analysis', 'enable_public_sharing',
    'enable_pdf_export', 'enable_file_archiving',
  ];

  res.json({
    settings: Object.fromEntries(PUBLIC_KEYS.map((k) => [k, all[k]])),
    capabilities: {
      supabase: isConfigured(),
      serviceRole: hasServiceRole(),
      groq: Boolean(process.env.GROQ_API_KEY),
      webSearch: Boolean(process.env.SERPAPI_KEY),
    },
  });
});

app.get('/api/health', async (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    integrations: {
      supabase: isConfigured(),
      serviceRole: hasServiceRole(),
      groq: Boolean(process.env.GROQ_API_KEY),
      serpapi: Boolean(process.env.SERPAPI_KEY),
    },
  });
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Route introuvable.', code: 'NOT_FOUND' });
});

// Express identifie le gestionnaire d'erreurs à ses quatre paramètres :
// `_next` doit rester présent même s'il n'est pas utilisé.
app.use((err, _req, res, _next) => {
  console.error('[Erreur serveur]', err.message);
  if (process.env.NODE_ENV !== 'production') console.error(err.stack);

  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Erreur interne du serveur.',
    code: err.code || 'INTERNAL_ERROR',
  });
});

app.listen(PORT, () => {
  console.log(`\n  VerifyNet API — http://localhost:${PORT}`);
  console.log(`  Client autorisé : ${CLIENT_URL}`);
  console.log(`  Supabase        : ${isConfigured() ? 'configuré' : 'NON configuré'}`);
  console.log(`  service_role    : ${hasServiceRole() ? 'disponible' : 'absent'}`);
  console.log(`  Groq            : ${process.env.GROQ_API_KEY ? 'clé présente' : 'CLÉ MANQUANTE'}`);
  console.log(`  SerpAPI         : ${process.env.SERPAPI_KEY ? 'clé présente' : 'CLÉ MANQUANTE'}\n`);
});
