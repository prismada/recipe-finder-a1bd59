import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json());

// Serve static files
app.use(express.static(join(__dirname, 'public')));

const PORT = process.env.PORT || 3002;

// In-memory session storage
interface Session {
  id: string;
  createdAt: Date;
  lastActivity: Date;
  messageCount: number;
}

const sessions: Map<string, Session> = new Map();

// Clean up old sessions (older than 1 hour)
function cleanupSessions(): void {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  for (const [sessionId, session] of sessions) {
    if (session.lastActivity < oneHourAgo) {
      sessions.delete(sessionId);
    }
  }
}

setInterval(cleanupSessions, 15 * 60 * 1000);

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Create session
app.post('/session', (_req: Request, res: Response) => {
  const sessionId = uuidv4();
  sessions.set(sessionId, {
    id: sessionId,
    createdAt: new Date(),
    lastActivity: new Date(),
    messageCount: 0,
  });
  res.json({ sessionId });
});

// Chat endpoint
interface ChatRequest {
  message: string;
  sessionId?: string;
}

app.post(
  '/chat',
  async (
    req: Request<object, object, ChatRequest>,
    res: Response
  ) => {
    const { message, sessionId } = req.body;

    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    let currentSessionId = sessionId;
    if (currentSessionId && sessions.has(currentSessionId)) {
      const session = sessions.get(currentSessionId)!;
      session.lastActivity = new Date();
      session.messageCount++;
    } else {
      currentSessionId = uuidv4();
      sessions.set(currentSessionId, {
        id: currentSessionId,
        createdAt: new Date(),
        lastActivity: new Date(),
        messageCount: 1,
      });
    }

    // Stream responses
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('X-Session-Id', currentSessionId);

    console.log(`[${new Date().toISOString()}] Starting request: ${message.substring(0, 50)}...`);

    try {
      const { streamAgent } = await import('./agent.js');
      for await (const chunk of streamAgent(message)) {
        res.write(JSON.stringify(chunk) + '\n');
      }
    } catch (error) {
      console.error('Error:', error);
      res.write(JSON.stringify({ error: error instanceof Error ? error.message : 'Error' }) + '\n');
    }

    res.end();
  }
);

// Get session info
app.get('/session/:sessionId', (req: Request, res: Response) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json(session);
});

// Delete session
app.delete('/session/:sessionId', (req: Request, res: Response) => {
  if (sessions.delete(req.params.sessionId)) {
    res.json({ message: 'Session deleted' });
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\n  AgentScaffold running at http://localhost:${PORT}\n`);
});

export default app;
