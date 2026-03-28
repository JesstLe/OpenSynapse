# Environment Variables Configuration

This document describes all environment variables required for OpenSynapse.

## Required Variables

### Firebase Configuration

```bash
# Firebase Admin SDK (for server-side operations)
# Option 1: Service account JSON (recommended for local development)
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"...",...}

# Option 2: Application Default Credentials (recommended for GCP deployment)
# No env var needed - uses GCP metadata service
```

Get service account key from Firebase Console → Project Settings → Service Accounts → Generate new private key.

### WeChat OAuth (微信登录)

```bash
WECHAT_APP_ID=your_wechat_app_id
WECHAT_APP_SECRET=your_wechat_app_secret
```

Register at [WeChat Open Platform](https://open.weixin.qq.com/).

### QQ OAuth (QQ登录)

```bash
QQ_APP_ID=your_qq_app_id
QQ_APP_SECRET=your_qq_app_secret
```

Register at [QQ Connect](https://connect.qq.com/).

## Optional Variables

### AI Provider API Keys (Global Fallback)

These are used as fallback when users don't have personal API keys configured:

```bash
# Google Gemini
GEMINI_API_KEY=AIza...

# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1  # optional

# MiniMax
MINIMAX_API_KEY=your_minimax_key
MINIMAX_BASE_URL=https://api.minimax.chat/v1  # optional

# Zhipu GLM (智谱)
ZHIPU_API_KEY=your_zhipu_key
ZHIPU_BASE_URL=https://open.bigmodel.cn/api/paas/v4  # optional

# Moonshot Kimi
MOONSHOT_API_KEY=sk-...
MOONSHOT_BASE_URL=https://api.moonshot.cn/v1  # optional
```

**Note:** For commercial deployments, users should configure their own API keys in Settings. Global keys are only used as fallback.

### Application Settings

```bash
# Application URL (required for OAuth callbacks)
APP_URL=http://localhost:3000  # development
APP_URL=https://your-domain.com  # production

# Development settings
VITE_DISABLE_AUTH=0  # Set to 1 to disable auth in development (NOT for production)
```

## Variable Priority

### API Key Resolution

When making AI requests, the system resolves API keys in this order:

1. **User's personal API key** (from Firestore `account_secrets/{uid}`)
2. **Global environment variable** (from this file)
3. **OAuth token** (for Gemini, if using Code Assist OAuth)

This ensures:
- Commercial users have completely isolated API usage
- Personal deployments can use global keys for simplicity
- Gradual migration path from global to per-user keys

### Authentication Flow

For third-party OAuth (WeChat/QQ):

1. User clicks login → Frontend calls `/auth/{provider}/start`
2. Server generates state + redirects to provider OAuth page
3. User authorizes → Provider redirects to `/auth/{provider}/callback`
4. Server exchanges code for access_token + openid
5. Server finds/creates user in Firestore
6. Server generates Firebase Custom Token
7. Server redirects to `/auth/complete?token=...`
8. Frontend calls `signInWithCustomToken(auth, token)`
9. User is now authenticated with Firebase

## Security Considerations

1. **Never commit `.env.local`** - It's in `.gitignore` for a reason
2. **Service account keys** - Treat these like passwords. Rotate regularly.
3. **WeChat/QQ secrets** - Keep these secure. Regenerate if leaked.
4. **API keys** - Users' personal keys are encrypted at rest in Firestore

## Development vs Production

### Local Development

```bash
# .env.local
FIREBASE_SERVICE_ACCOUNT_KEY={...}
WECHAT_APP_ID=wx_dev_id
WECHAT_APP_SECRET=dev_secret
QQ_APP_ID=qq_dev_id
QQ_APP_SECRET=dev_secret
APP_URL=http://localhost:3000
```

### Production Deployment

```bash
# On GCP (Cloud Run / App Engine)
# Use Secret Manager instead of env vars for sensitive values

# Required secrets:
# - firebase-service-account
# - wechat-app-secret
# - qq-app-secret

# Environment variables:
APP_URL=https://your-domain.com
```

## Troubleshooting

### "Invalid service account"

- Check `FIREBASE_SERVICE_ACCOUNT_KEY` is valid JSON
- Ensure the service account has proper Firebase Admin permissions

### "WeChat/QQ login fails"

- Verify `APP_URL` matches the registered callback URL
- Check app ID and secret are correct
- Ensure callback URLs are registered in provider console:
  - `{APP_URL}/auth/wechat/callback`
  - `{APP_URL}/auth/qq/callback`

### "Custom token generation fails"

- Verify Firebase Admin SDK is initialized correctly
- Check service account has `Service Account Token Creator` role
