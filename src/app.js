const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const cookieParser = require('cookie-parser');

const networkRoutes = require('./routes/networkRoutes');
const trackRoutes = require('./routes/trackRoutes');
const authRoutes = require('./routes/authRoutes');
const profileRoutes = require('./routes/profileRoutes');

// ✅ NEW: Import our error handling tools
const globalErrorHandler = require('./middlewares/errorHandler');
const AppError = require('./utils/AppError');

const app = express();
app.set('trust proxy', 1);

// ==========================================
// 1. GLOBAL MIDDLEWARES & SECURITY
// ==========================================
app.use(helmet());

app.use(
  cors({
    origin: 'http://localhost:5173',
    credentials: true,
  })
);

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

const limiter = rateLimit({
  max: 100,
  windowMs: 60 * 60 * 1000,
  message: 'Too many requests from this IP, please try again in an hour!',
});
app.use('/api', limiter);

app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

app.use((req, res, next) => {
  const queryClone = {};
  Object.keys(req.query || {}).forEach((key) => {
    queryClone[key] = req.query[key];
  });
  Object.defineProperty(req, 'query', {
    value: queryClone,
    writable: true,
    configurable: true,
    enumerable: true,
  });
  next();
});

app.use(mongoSanitize());

// ==========================================
// 2. ROUTES
// ==========================================
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'BioBeats API is highly secure and running!',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/network', networkRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/tracks', trackRoutes);

// ==========================================
// 3. UNHANDLED ROUTES (404 catch-all)
// Must come AFTER all your real routes
// ==========================================
app.all('/{*path}', (req, res, next) => {
  next(new AppError(`Route ${req.originalUrl} not found`, 404));
});

// ==========================================
// 4. GLOBAL ERROR HANDLER
// Must be the LAST middleware — Express identifies it by its 4 parameters
// ==========================================
app.use(globalErrorHandler);

module.exports = app;
