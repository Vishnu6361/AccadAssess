import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Security and utility middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health Check Response Schema
const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
  version: z.string(),
  timestamp: z.string(),
  environment: z.string()
});

/**
 * Health Endpoints
 */
const getHealthStatus = () => {
  const payload = {
    status: 'ok' as const,
    service: 'smartfa-api',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  };
  return HealthResponseSchema.parse(payload);
};

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json(getHealthStatus());
});

app.get('/api/v1/health', (req: Request, res: Response) => {
  res.status(200).json(getHealthStatus());
});

/**
 * Root Info Endpoint
 */
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    name: 'SmartFA Trusted API',
    description: 'Institutional Formative Assessment, Evaluation and Internal Answer Similarity Review API',
    version: '1.0.0',
    documentation: '/docs',
    health: '/health'
  });
});

/**
 * Global 404 Not Found Handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Cannot ${req.method} ${req.originalUrl}`
    }
  });
});

/**
 * Global Error Handler
 */
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof z.ZodError) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload',
        details: err.errors
      }
    });
  }

  console.error('[API Error]:', err);
  return res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal error occurred'
    }
  });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[SmartFA API] Running on http://localhost:${PORT}`);
  });
}

export default app;
