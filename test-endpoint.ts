import express from 'express';
import dotenv from 'dotenv';
dotenv.config();

function getBaseUrl() {
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  const host = process.env.VERCEL_URL || `localhost:${process.env.PORT || 3000}`;
  return `${protocol}://${host}`;
}

const app = express();

// Service discovery for OpenClaw
app.get('/.well-known/openclaw', (req, res) => {
  res.json({
    mcp_endpoint: `${getBaseUrl()}/mcp`,
    name: 'opensynapse',
    version: '1.0.0',
    description: 'AI驱动的知识复利系统 - 智能笔记与闪卡复习',
    features: ['save', 'import', 'review', 'search'],
    auth_types: ['oauth', 'api_key'],
    website: getBaseUrl()
  });
});

app.get('/test', (req, res) => {
  res.json({ message: 'Test endpoint working' });
});

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Test server running on http://localhost:${PORT}`);
  console.log(`Testing /.well-known/openclaw endpoint...`);
});

export default app;