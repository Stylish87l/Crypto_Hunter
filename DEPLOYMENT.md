# Render Deployment Guide - Agent Hunter Pro

This guide will walk you through deploying your Agent Hunter Pro app to Render.

## Prerequisites Checklist

Before starting, make sure you have:

- [ ] Gemini API Key from [Google AI Studio](https://makersuite.google.com/app/apikey)
- [ ] Firebase project with Firestore and Anonymous Auth enabled
- [ ] Firebase config credentials
- [ ] (Optional) WalletConnect Project ID from [WalletConnect Cloud](https://cloud.walletconnect.com/)
- [ ] GitHub account (recommended) or local project ready

## Step-by-Step Deployment

### Option A: Deploy from GitHub (Recommended)

#### 1. Prepare Your Repository

```bash
# Initialize git if you haven't
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit - Agent Hunter Pro"

# Create a new repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/agent-hunter-pro.git
git push -u origin main
```

**IMPORTANT**: Make sure `.env` is in your `.gitignore` file! Never push API keys to GitHub.

#### 2. Connect to Render

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Sign up or log in
3. Click **"New +"** in top right
4. Select **"Web Service"**

#### 3. Connect Repository

1. Click **"Connect account"** to link your GitHub
2. Select your `agent-hunter-pro` repository
3. Click **"Connect"**

#### 4. Configure Service

Fill in these settings:

**Basic Settings:**
- **Name**: `agent-hunter-pro` (or your preferred name)
- **Region**: Choose closest to you (Oregon, Frankfurt, Singapore, etc.)
- **Branch**: `main`
- **Root Directory**: (leave blank)
- **Environment**: `Node`
- **Build Command**: 
  ```bash
  npm install && npm run build
  ```
- **Start Command**: 
  ```bash
  npx serve -s build -l $PORT
  ```

**Advanced Settings:**
- **Auto-Deploy**: Yes (recommended)
- **Instance Type**: Free (or Starter if you need more)

#### 5. Add Environment Variables

Click **"Advanced"** and add these environment variables:

```
REACT_APP_GEMINI_API_KEY
Your Gemini API key from Google AI Studio

REACT_APP_FIREBASE_API_KEY
From Firebase Project Settings → General → Web API Key

REACT_APP_FIREBASE_AUTH_DOMAIN
Format: your-project.firebaseapp.com

REACT_APP_FIREBASE_PROJECT_ID
Your Firebase project ID

REACT_APP_FIREBASE_STORAGE_BUCKET
Format: your-project.firebasestorage.app

REACT_APP_FIREBASE_MESSAGING_SENDER_ID
Firebase messaging sender ID (numbers)

REACT_APP_FIREBASE_APP_ID
Firebase app ID

REACT_APP_FIREBASE_MEASUREMENT_ID
Firebase analytics measurement ID (starts with G-)

REACT_APP_WALLETCONNECT_PROJECT_ID
Your WalletConnect project ID (optional)

REACT_APP_APP_ID
agent-gem-hunter-pro-v6.5
```

**How to find Firebase values:**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Click gear icon → Project settings
4. Scroll to "Your apps" → Select web app
5. Copy values from the config object

#### 6. Deploy

1. Click **"Create Web Service"**
2. Wait for build to complete (3-5 minutes)
3. Your app will be live at `https://agent-hunter-pro.onrender.com`

### Option B: Deploy with Render Blueprint

If you have `render.yaml` in your repo:

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **"New +"** → **"Blueprint"**
3. Connect your repository
4. Render will auto-detect `render.yaml`
5. Fill in the environment variables when prompted
6. Click **"Apply"**

### Option C: Manual Upload (No Git)

1. Build your app locally:
   ```bash
   npm run build
   ```

2. Install Render CLI:
   ```bash
   npm install -g render-cli
   ```

3. Login to Render:
   ```bash
   render login
   ```

4. Deploy:
   ```bash
   render deploy
   ```

## Post-Deployment Setup

### 1. Update Firebase Security Rules

Go to Firestore → Rules and update:

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

### 2. Add Render Domain to Firebase

1. Go to Firebase → Authentication → Settings → Authorized domains
2. Add your Render domain: `your-app-name.onrender.com`
3. Save

### 3. Test Your Deployment

Visit your Render URL and verify:
- [ ] App loads correctly
- [ ] Terminal shows "Intelligence Core Online"
- [ ] Can input token addresses
- [ ] Audit button works (tests Gemini API)
- [ ] Portfolio section appears (tests Firebase)
- [ ] Wallet connect buttons appear

## Monitoring & Maintenance

### View Logs

1. Go to your service in Render Dashboard
2. Click **"Logs"** tab
3. Monitor for errors

### Update Environment Variables

1. Go to your service → **Environment** tab
2. Add/Edit variables
3. Service will auto-redeploy

### Custom Domain (Optional)

1. Buy a domain (e.g., from Namecheap, Google Domains)
2. In Render: Settings → Custom Domain
3. Add your domain
4. Update DNS records as instructed
5. Wait for SSL certificate (automatic)

## Troubleshooting

### Build Fails

**Error: "Module not found"**
- Check `package.json` has all dependencies
- Verify build command includes `npm install`

**Error: "Environment variable not set"**
- All `REACT_APP_*` vars must be in Render dashboard
- Redeploy after adding missing vars

### App Loads but Doesn't Work

**Audit button doesn't respond:**
- Check Gemini API key is correct in environment variables
- Check browser console for errors (F12)
- Verify API key has Gemini API enabled in Google Cloud

**Portfolio doesn't save:**
- Verify all Firebase env vars are correct
- Check Firebase security rules
- Ensure Anonymous Auth is enabled in Firebase
- Add Render domain to Firebase authorized domains

**Wallets won't connect:**
- Check WalletConnect project ID
- Some features require HTTPS (Render provides this automatically)

### App Goes to Sleep (Free Tier)

Render free tier spins down after 15 min of inactivity:
- Expect 30-60 second cold start
- Upgrade to Starter plan ($7/mo) for always-on
- Or use a service like UptimeRobot to ping every 14 minutes

## Cost Breakdown

**Free Tier:**
- ✅ Render: Free (with 15 min spin-down)
- ✅ Firebase: Free up to 1GB storage, 50K reads/day
- ✅ Gemini API: Free tier (60 requests/min)
- ❌ Limitations: Cold starts, 750 hours/month

**Paid Tier (Recommended for production):**
- Render Starter: $7/month (always-on)
- Firebase Blaze: Pay-as-you-go (usually <$5/mo for small apps)
- Gemini API: Free tier often sufficient

## Next Steps

After successful deployment:

1. **Bookmark your app URL**
2. **Share with users** (if public)
3. **Set up monitoring** (optional: [Better Uptime](https://betteruptime.com/))
4. **Enable analytics** (Firebase Analytics already configured)
5. **Regular updates**: Push to GitHub, Render auto-deploys

## Support

If you run into issues:

1. Check Render logs first
2. Check browser console (F12)
3. Review this guide
4. Check main README.md for additional troubleshooting

**Common Resources:**
- [Render Status Page](https://status.render.com/)
- [Render Community Forum](https://community.render.com/)
- [Firebase Status](https://status.firebase.google.com/)

---

🎉 **Congratulations!** Your Agent Hunter Pro app should now be live on Render!

Access it at: `https://your-app-name.onrender.com`
