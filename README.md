# Agent Hunter Pro v6.5

A professional cryptocurrency analysis and portfolio management application with AI-powered auditing capabilities, multi-chain support, and real-time market alerts.

## Features

- 🤖 **AI-Powered Token Analysis** - Gemini API integration for comprehensive token audits
- 🔗 **Multi-Chain Support** - Solana, Ethereum, Base, BSC
- 🐋 **Whale Tracking** - Real-time whale transaction alerts across chains
- 🚀 **Pump.fun Integration** - Live new token launch tracking
- 💼 **Portfolio Management** - Track positions with real-time P&L
- 🔐 **Honeypot Detection** - Automated rug pull and honeypot checks
- 📊 **Live Price Charts** - Interactive charts with zoom/pan capabilities
- 🔌 **Wallet Integration** - WalletConnect for EVM chains, Phantom for Solana

## Prerequisites

- Node.js 16+ and npm
- Gemini API Key ([Get one here](https://makersuite.google.com/app/apikey))
- Firebase Project ([Create one here](https://console.firebase.google.com/))
- WalletConnect Project ID ([Get one here](https://cloud.walletconnect.com/))

## Local Development Setup

### 1. Clone and Install Dependencies

```bash
cd agent-hunter-pro
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

```env
# Gemini API Key (REQUIRED)
REACT_APP_GEMINI_API_KEY=your_gemini_api_key_here

# Firebase Configuration (REQUIRED)
REACT_APP_FIREBASE_API_KEY=your_firebase_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
REACT_APP_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id
REACT_APP_FIREBASE_MEASUREMENT_ID=your_measurement_id

# WalletConnect Project ID (OPTIONAL)
REACT_APP_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id

# App Configuration
REACT_APP_APP_ID=agent-gem-hunter-pro-v6.5
```

### 3. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select existing
3. Enable **Firestore Database**:
   - Go to Firestore Database → Create Database
   - Start in production mode
   - Choose your region
4. Enable **Authentication**:
   - Go to Authentication → Get Started
   - Enable Anonymous sign-in
5. Get your config from Project Settings → General → Your apps → Web app
6. Copy the config values to your `.env` file

### 4. Gemini API Key Setup

1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Click "Create API Key"
3. Copy the key to your `.env` file as `REACT_APP_GEMINI_API_KEY`

### 5. Run the Development Server

```bash
npm start
```

The app will open at `http://localhost:3000`

## Deployment on Render

### Method 1: Connect GitHub Repository

1. **Push your code to GitHub** (make sure `.env` is in `.gitignore`!)

2. **Go to [Render Dashboard](https://dashboard.render.com/)**

3. **Create New Web Service**:
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Configure:
     - **Name**: `agent-hunter-pro`
     - **Environment**: `Node`
     - **Build Command**: `npm install && npm run build`
     - **Start Command**: `npx serve -s build -l $PORT`

4. **Add Environment Variables** in Render dashboard:
   ```
   REACT_APP_GEMINI_API_KEY=your_key_here
   REACT_APP_FIREBASE_API_KEY=your_key_here
   REACT_APP_FIREBASE_AUTH_DOMAIN=your_domain_here
   REACT_APP_FIREBASE_PROJECT_ID=your_project_id
   REACT_APP_FIREBASE_STORAGE_BUCKET=your_bucket
   REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   REACT_APP_FIREBASE_APP_ID=your_app_id
   REACT_APP_FIREBASE_MEASUREMENT_ID=your_measurement_id
   REACT_APP_WALLETCONNECT_PROJECT_ID=your_wc_project_id
   REACT_APP_APP_ID=agent-gem-hunter-pro-v6.5
   ```

5. **Deploy**: Click "Create Web Service"

### Method 2: Manual Deployment

1. **Build the app locally**:
   ```bash
   npm run build
   ```

2. **Install serve globally** (for hosting):
   ```bash
   npm install -g serve
   ```

3. **Create a `render.yaml`** in root:
   ```yaml
   services:
     - type: web
       name: agent-hunter-pro
       env: node
       buildCommand: npm install && npm run build
       startCommand: npx serve -s build -l $PORT
       envVars:
         - key: REACT_APP_GEMINI_API_KEY
           sync: false
         - key: REACT_APP_FIREBASE_API_KEY
           sync: false
         - key: REACT_APP_FIREBASE_AUTH_DOMAIN
           sync: false
         - key: REACT_APP_FIREBASE_PROJECT_ID
           sync: false
         - key: REACT_APP_FIREBASE_STORAGE_BUCKET
           sync: false
         - key: REACT_APP_FIREBASE_MESSAGING_SENDER_ID
           sync: false
         - key: REACT_APP_FIREBASE_APP_ID
           sync: false
         - key: REACT_APP_FIREBASE_MEASUREMENT_ID
           sync: false
         - key: REACT_APP_WALLETCONNECT_PROJECT_ID
           sync: false
   ```

4. Deploy via Render CLI or Dashboard

## Project Structure

```
agent-hunter-pro/
├── public/
│   └── index.html          # HTML template
├── src/
│   ├── App.js              # Main application component
│   ├── index.js            # React entry point
│   └── index.css           # Custom styles
├── .env.example            # Environment variables template
├── .gitignore              # Git ignore rules
├── package.json            # Dependencies and scripts
└── README.md              # This file
```

## API Integrations

### Gemini API
- **Purpose**: AI-powered token analysis and auditing
- **Rate Limits**: Watch for 429 errors (built-in retry logic)
- **Cost**: Free tier available, check [pricing](https://ai.google.dev/pricing)

### Firebase
- **Firestore**: Portfolio data storage
- **Authentication**: Anonymous user sessions
- **Cost**: Free tier generous, check [pricing](https://firebase.google.com/pricing)

### Third-Party APIs (No auth required)
- **DexScreener**: Price data and pair information
- **GeckoTerminal**: Multi-chain whale alerts and new pools
- **CoinGecko**: Market ticker data
- **Pump.fun**: Real-time Solana token launches (WebSocket)
- **RugCheck.xyz**: Solana rug check API
- **GoPlus Labs**: EVM honeypot detection

## Troubleshooting

### Gemini API Issues

**Problem**: "API Key blocked" or safety errors
**Solution**: 
- Make sure your API key is valid and not hardcoded in client-side code
- The app uses `BLOCK_NONE` safety settings for crypto analysis
- Check [Gemini API docs](https://ai.google.dev/docs) for usage limits

### Firebase Issues

**Problem**: "Permission denied" in Firestore
**Solution**:
1. Go to Firestore → Rules
2. Update rules to allow authenticated reads/writes:
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /artifacts/{artifactId}/users/{userId}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```

### Build Issues

**Problem**: Module not found errors
**Solution**: 
```bash
rm -rf node_modules package-lock.json
npm install
```

**Problem**: Environment variables not loading
**Solution**:
- In React, env vars MUST start with `REACT_APP_`
- Restart dev server after changing `.env`
- Check `.env` file is in project root

### Render Deployment Issues

**Problem**: Build fails on Render
**Solution**:
1. Check all env vars are set in Render dashboard
2. Verify build command: `npm install && npm run build`
3. Verify start command: `npx serve -s build -l $PORT`
4. Check logs in Render dashboard

**Problem**: App loads but features don't work
**Solution**:
- Verify env vars in Render match your local `.env`
- Check browser console for API errors
- Ensure Firebase rules allow your domain

## Security Best Practices

1. **Never commit `.env` file** - It's in `.gitignore` by default
2. **Use Render's environment variables** - Don't hardcode keys
3. **Rotate API keys regularly** - Especially if exposed
4. **Set up Firebase Security Rules** - Restrict access appropriately
5. **Monitor API usage** - Watch for unexpected spikes

## Support & Resources

- [Gemini API Documentation](https://ai.google.dev/docs)
- [Firebase Documentation](https://firebase.google.com/docs)
- [Render Documentation](https://render.com/docs)
- [WalletConnect Docs](https://docs.walletconnect.com/)

## License

MIT License - feel free to use this project however you'd like!

## Contributing

Issues and pull requests welcome!
