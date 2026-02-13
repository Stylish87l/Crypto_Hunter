import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, addDoc, deleteDoc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { ethers } from 'ethers';
import * as solanaWeb3 from '@solana/web3.js';
import { Web3Modal } from '@web3modal/standalone';
import { Chart, registerables } from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';

Chart.register(...registerables, zoomPlugin);

function App() {
  // --- CONFIG FROM ENV ---
  const firebaseConfig = {
    apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
    authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
    storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.REACT_APP_FIREBASE_APP_ID,
    measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
  };

  const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
  const wcProjectId = process.env.REACT_APP_WALLETCONNECT_PROJECT_ID;
  const appId = process.env.REACT_APP_APP_ID || 'agent-gem-hunter-pro-v6.5';

  // --- STATES ---
  const [user, setUser] = useState(null);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [showWcPrompt, setShowWcPrompt] = useState(false);
  const [input, setInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [terminalLines, setTerminalLines] = useState(['[SYSTEM] Intelligence Core Online.', '[SYSTEM] Multi-Chain Alpha Listener: ACTIVE']);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [showVerdict, setShowVerdict] = useState(false);
  const [portfolio, setPortfolio] = useState([]);
  const [tokenPrices, setTokenPrices] = useState({});
  const [tickers, setTickers] = useState([{ symbol: 'BTC', price: '0', change: '0%' }]);
  const [recentPumpLaunches, setRecentPumpLaunches] = useState([]);

  const [evmAddress, setEvmAddress] = useState(null);
  const [evmChainName, setEvmChainName] = useState(null);
  const [evmBalance, setEvmBalance] = useState(null);
  const [solAddress, setSolAddress] = useState(null);
  const [solBalance, setSolBalance] = useState(null);

  const [priceHistory, setPriceHistory] = useState([]);
  const [currentPrice, setCurrentPrice] = useState(null);
  const [marketCap, setMarketCap] = useState(null);
  const [liquidity, setLiquidity] = useState(null);
  const [pairChain, setPairChain] = useState(null);
  const [pairDex, setPairDex] = useState(null);
  const [holders, setHolders] = useState(null);
  const [volumeChange5m, setVolumeChange5m] = useState(null);

  const [honeypotStatus, setHoneypotStatus] = useState(null);
  const [isCheckingHoneypot, setIsCheckingHoneypot] = useState(false);

  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const seenTxHashes = useRef(new Set());
  const seenPools = useRef(new Set());
  const wsRef = useRef(null);
  const web3ModalRef = useRef(null);
  const authRef = useRef(null);
  const dbRef = useRef(null);

  const targetNetworks = ['solana', 'base', 'eth', 'bsc'];
  const networkNames = { solana: 'SOLANA', base: 'BASE', ethereum: 'ETH', bsc: 'BSC' };

  const shortenAddress = (addr) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '';

  const copyToClipboard = (text, label = 'item') => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      setTerminalLines(prev => [...prev.slice(-20), `> Copied ${label} to clipboard`]);
    } catch (err) {
      console.error('Copy failed', err);
    }
    document.body.removeChild(textarea);
  };

  const formatPrice = (price) => {
    if (!price) return '-';
    if (price >= 1) return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    if (price >= 0.0001) return '$' + price.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
    return '$' + parseFloat(price).toExponential(4);
  };

  const formatMC = (mc) => {
    if (!mc) return '-';
    if (mc >= 1000000000) return '$' + (mc / 1000000000).toFixed(2) + 'B';
    if (mc >= 1000000) return '$' + (mc / 1000000).toFixed(2) + 'M';
    if (mc >= 1000) return '$' + (mc / 1000).toFixed(1) + 'K';
    return '$' + mc.toLocaleString();
  };

  const formatLiq = (liq) => formatMC(liq);

  // --- FIREBASE INIT & ALERTS ---
  useEffect(() => {
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    authRef.current = auth;
    dbRef.current = db;

    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Auth Error:", error);
        setTerminalLines(prev => [...prev.slice(-20), `> [ERROR] Database Auth Failed`]);
      }
    };

    initAuth();
    const unsubAuth = onAuthStateChanged(auth, setUser);

    // --- TICKER ---
    const fetchTickers = async () => {
      try {
        const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,binancecoin,ripple,cardano,dogecoin,polkadot,matic-network,chainlink,uniswap,avalanche-2,wrapped-bitcoin&vs_currencies=usd&include_24hr_change=true');
        if (!res.ok) throw new Error('Network response was not ok');
        const data = await res.json();
        setTickers([
          { symbol: 'BTC', price: data.bitcoin.usd.toLocaleString(), change: (data.bitcoin.usd_24h_change || 0).toFixed(2) + '%' },
          { symbol: 'ETH', price: data.ethereum.usd.toLocaleString(), change: (data.ethereum.usd_24h_change || 0).toFixed(2) + '%' },
          { symbol: 'SOL', price: data.solana.usd.toLocaleString(), change: (data.solana.usd_24h_change || 0).toFixed(2) + '%' },
          { symbol: 'BNB', price: data.binancecoin.usd.toLocaleString(), change: (data.binancecoin.usd_24h_change || 0).toFixed(2) + '%' },
          { symbol: 'XRP', price: data.ripple.usd.toLocaleString(), change: (data.ripple.usd_24h_change || 0).toFixed(2) + '%' },
          { symbol: 'ADA', price: data.cardano.usd.toLocaleString(), change: (data.cardano.usd_24h_change || 0).toFixed(2) + '%' },
          { symbol: 'DOGE', price: data.dogecoin.usd.toLocaleString(), change: (data.dogecoin.usd_24h_change || 0).toFixed(2) + '%' },
          { symbol: 'DOT', price: data.polkadot.usd.toLocaleString(), change: (data.polkadot.usd_24h_change || 0).toFixed(2) + '%' },
          { symbol: 'MATIC', price: data['matic-network'].usd.toLocaleString(), change: (data['matic-network'].usd_24h_change || 0).toFixed(2) + '%' },
          { symbol: 'LINK', price: data.chainlink.usd.toLocaleString(), change: (data.chainlink.usd_24h_change || 0).toFixed(2) + '%' },
          { symbol: 'UNI', price: data.uniswap.usd.toLocaleString(), change: (data.uniswap.usd_24h_change || 0).toFixed(2) + '%' },
          { symbol: 'AVAX', price: data['avalanche-2'].usd.toLocaleString(), change: (data['avalanche-2'].usd_24h_change || 0).toFixed(2) + '%' },
          { symbol: 'WBTC', price: data['wrapped-bitcoin'].usd.toLocaleString(), change: (data['wrapped-bitcoin'].usd_24h_change || 0).toFixed(2) + '%' }
        ]);
      } catch (e) { }
    };
    fetchTickers();
    const tickerInt = setInterval(fetchTickers, 60000);

    // --- MULTI-CHAIN ALERTS ---
    const fetchAlerts = async (type) => {
      await Promise.all(targetNetworks.map(async (net) => {
        try {
          const endpoint = type === 'whale' ? 'trending_pools' : 'new_pools?page=1';
          const res = await fetch(`https://api.geckoterminal.com/api/v2/networks/${net}/${endpoint}`);
          if (!res.ok) return;
          const json = await res.json();
          const pools = json.data.slice(0, type === 'whale' ? 5 : 10);

          for (const pool of pools) {
            const attrs = pool.attributes;
            let base = attrs.base_token_symbol || 'UNKNOWN';
            let quote = attrs.quote_token_symbol || 'PAIR';
            if (base === 'UNKNOWN' || quote === 'PAIR') {
              const nameParts = attrs.name ? attrs.name.split(' / ') : [];
              if (nameParts.length === 2) {
                base = nameParts[0] || 'UNKNOWN';
                quote = nameParts[1] || 'PAIR';
              }
            }
            const pair = `${base}/${quote}`;
            const chainName = networkNames[net] || net.toUpperCase();

            if (type === 'whale') {
              try {
                const tradesRes = await fetch(`https://api.geckoterminal.com/api/v2/networks/${net}/pools/${pool.id}/trades`);
                if (!tradesRes.ok) continue;
                const trades = await tradesRes.json();

                trades.data.forEach(trade => {
                  const a = trade.attributes;
                  if (seenTxHashes.current.has(a.tx_hash)) return;
                  seenTxHashes.current.add(a.tx_hash);

                  if (parseFloat(a.volume_usd) >= 10000 && a.side === 'buy') {
                    let tag = '[WHALE]';
                    const poolVol = parseFloat(attrs.volume_usd?.h24 || '0');
                    if (poolVol > 0 && poolVol < 50000) tag = '[FRESH WHALE]';

                    const msg = `${tag} $${Math.round(parseFloat(a.volume_usd) / 1000)}k buy $${base} (${pair} • ${chainName})`;
                    setTerminalLines(prev => [...prev.slice(-20), `> ${msg}`]);
                  }
                });
              } catch { }
            } else {
              if (seenPools.current.has(pool.id)) return;
              seenPools.current.add(pool.id);
              const liq = parseFloat(attrs.reserve_in_usd || 0);
              if (liq >= 5000) {
                const msg = `[ALPHA] New $${pair} + $${Math.round(liq / 1000)}k liq (${chainName})`;
                setTerminalLines(prev => [...prev.slice(-20), `> ${msg}`]);
              }
            }
          }
        } catch { }
        await new Promise(r => setTimeout(r, 300));
      }));
    };

    fetchAlerts('whale');
    fetchAlerts('new');
    const whaleInt = setInterval(() => fetchAlerts('whale'), 30000);
    const newInt = setInterval(() => fetchAlerts('new'), 45000);

    // --- PUMP.FUN WS ---
    const connectWs = () => {
      if (wsRef.current) wsRef.current.close();

      wsRef.current = new WebSocket('wss://pumpportal.fun/api/data');

      wsRef.current.onopen = () => {
        wsRef.current.send(JSON.stringify({ method: "subscribeNewToken" }));
        setTerminalLines(prev => [...prev.slice(-20), `> [SYSTEM] Pump.fun Uplink Established`]);
      };

      wsRef.current.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data);
          if (d.tx_type === 'create' && d.mint && d.symbol) {
            const launch = { mint: d.mint, symbol: d.symbol.toUpperCase(), name: d.name || 'Unknown' };
            setRecentPumpLaunches(prev => [launch, ...prev.slice(0, 9)]);
            setTerminalLines(prev => [...prev.slice(-20), `> [PUMP LAUNCH] $${launch.symbol} | ${shortenAddress(d.mint)}`]);
          }
        } catch { }
      };

      wsRef.current.onerror = () => {
        setTerminalLines(prev => [...prev.slice(-20), `> [WARNING] Pump.fun WS error – reconnecting...`]);
      };

      wsRef.current.onclose = () => {
        setTerminalLines(prev => [...prev.slice(-20), `> [SYSTEM] Pump.fun lost – reconnecting in 5s`]);
        setTimeout(connectWs, 5000);
      };
    };

    connectWs();

    const heartBeatInt = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ method: "subscribeNewToken" }));
      }
    }, 30000);

    return () => {
      clearInterval(tickerInt);
      clearInterval(whaleInt);
      clearInterval(newInt);
      clearInterval(heartBeatInt);
      if (wsRef.current) wsRef.current.close();
      unsubAuth();
    };
  }, []);

  // --- PORTFOLIO LISTENER ---
  useEffect(() => {
    if (user && dbRef.current) {
      const q = query(
        collection(dbRef.current, 'artifacts', appId, 'users', user.uid, 'positions'),
        orderBy('timestamp', 'desc')
      );
      const unsub = onSnapshot(q, snap => {
        const pos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setPortfolio(pos);
      });
      return () => unsub();
    }
  }, [user, appId]);

  // --- PORTFOLIO PRICE POLLING ---
  useEffect(() => {
    let int;
    const addresses = [...new Set(portfolio.filter(p => p.contractAddress).map(p => p.contractAddress.toLowerCase()))];

    if (addresses.length > 0) {
      const poll = async () => {
        try {
          const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addresses.join(',')}`);
          const j = await res.json();
          if (j.pairs) {
            const prices = {};
            addresses.forEach(addr => {
              const tokenPairs = j.pairs.filter(p =>
                p.baseToken.address.toLowerCase() === addr ||
                p.quoteToken.address.toLowerCase() === addr
              );
              if (tokenPairs.length > 0) {
                const best = tokenPairs.reduce((a, b) =>
                  (b.liquidity?.usd || 0) > (a.liquidity?.usd || 0) ? b : a
                );
                const isBase = best.baseToken.address.toLowerCase() === addr;
                const price = parseFloat(isBase ? best.priceUsd : (1 / parseFloat(best.priceUsd)));
                if (price) prices[addr] = price;
              }
            });
            setTokenPrices(prices);
          }
        } catch { }
      };
      poll();
      int = setInterval(poll, 15000);
    } else {
      setTokenPrices({});
    }
    return () => clearInterval(int);
  }, [portfolio]);

  // --- WALLET CONNECT ---
  useEffect(() => {
    if (wcProjectId) {
      try {
        web3ModalRef.current = new Web3Modal({ projectId: wcProjectId });
      } catch (e) {
        console.error("WC Init Error", e);
      }
    }
  }, [wcProjectId]);

  const connectEVM = async () => {
    if (!wcProjectId) return setShowWcPrompt(true);
    if (!web3ModalRef.current) return;
    try {
      const provider = await web3ModalRef.current.openModal();
      const ethersProv = new ethers.providers.Web3Provider(provider);
      const signer = ethersProv.getSigner();
      const addr = await signer.getAddress();
      setEvmAddress(addr);
      const bal = await ethersProv.getBalance(addr);
      setEvmBalance(ethers.utils.formatEther(bal));
      const chainId = await signer.getChainId();
      const chainMap = { 1: 'ETH', 8453: 'BASE', 56: 'BSC' };
      setEvmChainName(chainMap[chainId] || `Chain ${chainId}`);
      setTerminalLines(prev => [...prev.slice(-20), `> EVM wallet connected: ${shortenAddress(addr)}`]);
    } catch (e) {
      setTerminalLines(prev => [...prev.slice(-20), `> [ERROR] Wallet connection failed`]);
    }
  };

  const connectSolana = async () => {
    if (!window.solana?.isPhantom) return alert('Install Phantom');
    try {
      const resp = await window.solana.connect();
      setSolAddress(resp.publicKey.toString());
      const conn = new solanaWeb3.Connection(solanaWeb3.clusterApiUrl('mainnet-beta'));
      const bal = await conn.getBalance(resp.publicKey);
      setSolBalance(bal / solanaWeb3.LAMPORTS_PER_SOL);
      setTerminalLines(prev => [...prev.slice(-20), `> Solana wallet connected: ${shortenAddress(resp.publicKey.toString())}`]);
    } catch (e) { }
  };

  // --- GEMINI AUDIT ---
  const performAnalysis = async () => {
    if (!input || isAnalyzing || !apiKey) {
      if (!apiKey) setShowKeyModal(true);
      return;
    }
    setIsAnalyzing(true);
    setAnalysisResult(null);
    setTerminalLines(prev => [...prev.slice(-15), `> INITIATING FORENSIC SCAN: ${input.toUpperCase()}`]);
    setPriceHistory([]);
    setCurrentPrice(null);
    setMarketCap(null);
    setLiquidity(null);
    setPairChain(null);
    setPairDex(null);
    setHolders(null);
    setVolumeChange5m(null);

    const systemPrompt = `You are a professional cryptocurrency auditor. Analyze: "${input}". 
        Use Google Search to find real-time community sentiment and dev history.
        IMPORTANT: You must return ONLY a JSON block. Do not write any conversational text.
        
        JSON Schema:
        {
          "riskLevel": "LOW | MEDIUM | HIGH | CRITICAL",
          "verdict": "STRONG BUY | WATCH | AVOID",
          "confidence": number,
          "contractAddress": "string",
          "devProfile": { "reputation": "string", "history": "string" },
          "socialSentiment": { "vibe": "string", "platformHighs": "string" },
          "findings": ["finding 1", "finding 2"],
          "redFlags": ["flag 1"],
          "targets": {"entry": "price", "exit": "price"}
        }`;

    const fetchWithRetry = async (attempt = 0) => {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: input }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            tools: [{ google_search: {} }],
            safetySettings: [
              { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
              { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
              { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
              { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
            ]
          })
        });

        if (res.status === 429 && attempt < 5) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(r => setTimeout(r, delay));
          return fetchWithRetry(attempt + 1);
        }

        const data = await res.json();
        if (!data.candidates?.[0]) throw new Error(data.error?.message || "API Error");

        const rawText = data.candidates[0].content.parts[0].text;
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON in response");

        const result = JSON.parse(jsonMatch[0]);
        setAnalysisResult(result);
        setShowVerdict(true);
        setTerminalLines(prev => [...prev.slice(-15), `> AUDIT SUCCESSFUL: ${result.riskLevel} RISK`]);
      } catch (e) {
        setTerminalLines(prev => [...prev.slice(-15), `> ERROR: ${e.message}`]);
      } finally {
        setIsAnalyzing(false);
      }
    };

    fetchWithRetry();
  };

  // Honeypot Check
  const checkHoneypot = async () => {
    if (!analysisResult?.contractAddress || !pairChain || isCheckingHoneypot) return;

    setIsCheckingHoneypot(true);
    setHoneypotStatus(null);
    setTerminalLines(prev => [...prev.slice(-15), `> Running honeypot check on ${shortenAddress(analysisResult.contractAddress)}...`]);

    try {
      let result = { isHoneypot: false, details: 'Unknown' };

      if (pairChain === 'solana') {
        const res = await fetch(`https://api.rugcheck.xyz/v1/tokens/${analysisResult.contractAddress}/report/summary`);
        if (res.ok) {
          const data = await res.json();
          const risk = data?.risk_level?.toLowerCase() || 'unknown';
          result = {
            isHoneypot: risk.includes('high') || risk.includes('rug'),
            details: `RugCheck: ${risk} risk • LP burned: ${data?.lp_burned ? 'Yes' : 'No'} • Mint revoked: ${data?.mint_revoked ? 'Yes' : 'No'}`
          };
        }
      } else {
        const chainIds = { ethereum: '1', base: '8453', bsc: '56' };
        const chainId = chainIds[pairChain] || '1';
        const res = await fetch(`https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${analysisResult.contractAddress}`);
        if (res.ok) {
          const data = await res.json();
          const info = data.result?.[analysisResult.contractAddress.toLowerCase()];
          if (info) {
            const isHp = info.is_honeypot === '1' || info.is_open_source === '0' || parseInt(info.locked_liquidity_ratio || 0) < 50;
            result = {
              isHoneypot: isHp,
              details: `GoPlus: ${isHp ? 'HIGH RISK' : 'Seems safe'} • LP locked: ${info.locked_liquidity_ratio || '?'}% • Tax: buy ${info.buy_tax || '?'}% / sell ${info.sell_tax || '?'}%`
            };
          }
        }
      }

      setHoneypotStatus(result);
      setTerminalLines(prev => [...prev.slice(-15), `> Honeypot check: ${result.isHoneypot ? '[DANGER]' : '[OK]'} ${result.details}`]);
    } catch (err) {
      setTerminalLines(prev => [...prev.slice(-15), `> Honeypot check failed: ${err.message}`]);
    } finally {
      setIsCheckingHoneypot(false);
    }
  };

  // --- DEXSCREENER POLLING ---
  useEffect(() => {
    let pollInt;
    if (showVerdict && analysisResult?.contractAddress) {
      const poll = async () => {
        try {
          const r = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${analysisResult.contractAddress}`);
          const j = await r.json();
          if (j.pairs?.length > 0) {
            const best = j.pairs.reduce((a, b) =>
              (b.liquidity?.usd || 0) > (a.liquidity?.usd || 0) ? b : a
            );
            const price = parseFloat(best.priceUsd);
            setCurrentPrice(price);
            setMarketCap(best.fdv || best.marketCap || null);
            setLiquidity(best.liquidity?.usd || null);
            setPairChain(best.chainId);
            setPairDex(best.dexName);
            setHolders(best.holders || null);
            setVolumeChange5m(best.priceChange?.m5?.toFixed(1) ?? null);
            setPriceHistory(prev => [...prev.slice(-50), { t: Date.now(), p: price }]);
          }
        } catch { }
      };
      poll();
      pollInt = setInterval(poll, 10000);
    }
    return () => clearInterval(pollInt);
  }, [showVerdict, analysisResult?.contractAddress]);

  const savePosition = async () => {
    if (!user || !analysisResult || !dbRef.current) return;
    await addDoc(collection(dbRef.current, 'artifacts', appId, 'users', user.uid, 'positions'), {
      token: input.toUpperCase(),
      entryPrice: analysisResult.targets?.entry || 'manual',
      risk: analysisResult.riskLevel,
      contractAddress: analysisResult.contractAddress || null,
      timestamp: Date.now()
    });
    setTerminalLines(prev => [...prev.slice(-15), `> TRADE LOGGED: $${input.toUpperCase()}`]);
    setShowVerdict(false);
    setInput('');
  };

  const deletePosition = async (id) => {
    if (!user || !dbRef.current) return;
    try {
      await deleteDoc(doc(dbRef.current, 'artifacts', appId, 'users', user.uid, 'positions', id));
      setTerminalLines(prev => [...prev.slice(-15), `> Position removed`]);
    } catch (err) {
      setTerminalLines(prev => [...prev.slice(-15), `> [ERROR] Failed to delete`]);
    }
  };

  // --- INTERACTIVE CHART ---
  useEffect(() => {
    if (chartRef.current && priceHistory.length > 1) {
      if (chartInstance.current) chartInstance.current.destroy();
      chartInstance.current = new Chart(chartRef.current, {
        type: 'line',
        data: {
          labels: priceHistory.map(h => new Date(h.t).toLocaleTimeString()),
          datasets: [{
            label: 'Price USD',
            data: priceHistory.map(h => h.p),
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            borderWidth: 2,
            pointRadius: 2,
            pointHoverRadius: 5,
            tension: 0.4,
            fill: true
          }]
        },
        options: {
          animation: false,
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: 'index',
            intersect: false,
          },
          scales: {
            x: {
              display: true,
              grid: { color: '#1f2937' },
              ticks: { color: '#9ca3af', font: { family: 'monospace', size: 10 }, maxTicksLimit: 10 }
            },
            y: {
              grid: { color: '#1f2937' },
              ticks: { color: '#9ca3af', font: { family: 'monospace' } }
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              enabled: true,
              mode: 'index',
              intersect: false,
              backgroundColor: 'rgba(0,0,0,0.8)',
              titleFont: { family: 'monospace' },
              bodyFont: { family: 'monospace' }
            },
            zoom: {
              zoom: {
                wheel: { enabled: true, speed: 0.1 },
                pinch: { enabled: true },
                mode: 'xy',
              },
              pan: {
                enabled: true,
                mode: 'xy',
              },
              limits: {
                x: { min: 'original', max: 'original' },
                y: { min: 'original', max: 'original' }
              }
            }
          }
        }
      });
    }
  }, [priceHistory]);

  return (
    <div className="flex flex-col min-h-screen overflow-hidden">
      <header className="px-4 md:px-6 py-3 md:py-4 bg-gradient-to-r from-slate-950 via-emerald-950/20 to-slate-950 border-b border-white/10 z-10 shadow-2xl relative overflow-hidden">
        {/* Animated Background */}
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 via-cyan-500/5 to-purple-500/5 animated-gradient-border opacity-30"></div>
        
        <div className="flex justify-between items-center relative z-10">
          {/* Logo */}
          <div className="flex items-center gap-2 md:gap-4">
            <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-br from-emerald-500 to-cyan-500 rounded-lg md:rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/50">
              <i className="fas fa-gem text-white text-base md:text-xl"></i>
            </div>
            <div>
              <h1 className="font-black text-sm md:text-xl tracking-tighter bg-gradient-to-r from-emerald-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent">
                CRYPTO AGENT
              </h1>
              <p className="hidden sm:block text-xs text-slate-500 font-medium">AI-Powered Intelligence v6.5</p>
            </div>
          </div>
          
          {/* Wallet Buttons - Desktop */}
          <div className="hidden md:flex gap-2 lg:gap-3">
            <button onClick={connectEVM} className="glass-card glow-on-hover bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/30 px-3 lg:px-5 py-2 lg:py-2.5 rounded-xl text-xs uppercase font-black flex items-center gap-2 transition-all">
              <i className="fas fa-wallet"></i>
              <span className="hidden lg:inline">{evmAddress ? shortenAddress(evmAddress) : 'Connect EVM'}</span>
              <span className="lg:hidden">{evmAddress ? shortenAddress(evmAddress) : 'EVM'}</span>
            </button>
            <button onClick={connectSolana} className="glass-card glow-on-hover bg-purple-600/10 hover:bg-purple-600/20 text-purple-400 border border-purple-500/30 px-3 lg:px-5 py-2 lg:py-2.5 rounded-xl text-xs uppercase font-black flex items-center gap-2 transition-all">
              <i className="fas fa-ghost"></i>
              <span className="hidden lg:inline">{solAddress ? shortenAddress(solAddress) : 'Connect SOL'}</span>
              <span className="lg:hidden">{solAddress ? shortenAddress(solAddress) : 'SOL'}</span>
            </button>
          </div>
          
          {/* Mobile Menu Button */}
          <button 
            onClick={() => {
              const menu = document.getElementById('mobile-wallet-menu');
              menu.classList.toggle('hidden');
            }}
            className="md:hidden glass-card bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-3 py-2 rounded-lg"
          >
            <i className="fas fa-wallet text-sm"></i>
          </button>
        </div>
        
        {/* Mobile Wallet Menu */}
        <div id="mobile-wallet-menu" className="hidden md:hidden mt-3 flex flex-col gap-2 animate-fadeIn">
          <button onClick={connectEVM} className="glass-card bg-blue-600/10 text-blue-400 border border-blue-500/30 px-4 py-2.5 rounded-xl text-xs uppercase font-black flex items-center justify-center gap-2">
            <i className="fas fa-wallet"></i>
            {evmAddress ? shortenAddress(evmAddress) : 'Connect EVM Wallet'}
          </button>
          <button onClick={connectSolana} className="glass-card bg-purple-600/10 text-purple-400 border border-purple-500/30 px-4 py-2.5 rounded-xl text-xs uppercase font-black flex items-center justify-center gap-2">
            <i className="fas fa-ghost"></i>
            {solAddress ? shortenAddress(solAddress) : 'Connect Solana Wallet'}
          </button>
        </div>
      </header>

      {/* Enhanced Ticker */}
      <div className="bg-black/40 backdrop-blur-sm border-b border-white/5 py-2 md:py-3 overflow-hidden whitespace-nowrap flex relative">
        <div className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 z-10 items-center gap-2 bg-emerald-500/20 backdrop-blur-md px-3 py-1.5 rounded-lg border border-emerald-500/30">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-lg shadow-emerald-500/50"></div>
          <span className="text-xs font-bold text-emerald-400">LIVE</span>
        </div>
        <div className="animate-marquee inline-flex sm:ml-32">
          {[...tickers, ...tickers, ...tickers].map((t, i) => {
            const isPositive = !t.change.includes('-');
            return (
              <span key={i} className="ticker-item market-card inline-flex items-center gap-2 md:gap-3 mx-2 md:mx-3 bg-white/5 backdrop-blur-md px-3 md:px-5 py-1.5 md:py-2 rounded-lg border border-white/10 hover:border-emerald-500/30 transition-all flex-shrink-0">
                <div className="flex items-center gap-1 md:gap-2">
                  <div className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-full ${isPositive ? 'bg-emerald-500' : 'bg-rose-500'} shadow-lg`}></div>
                  <span className="text-[10px] md:text-xs font-black text-white tracking-tight">{t.symbol}</span>
                </div>
                <span className="text-xs md:text-sm font-mono text-emerald-400 font-bold">${t.price}</span>
                <span className={`text-[10px] md:text-xs font-bold px-1.5 md:px-2 py-0.5 rounded ${isPositive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                  {isPositive ? '↑' : '↓'} {t.change}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      <main className="flex-1 flex overflow-hidden">
        <section className="flex-1 overflow-y-auto p-3 md:p-6 space-y-4 md:space-y-8 min-w-0">
          <div className="max-w-4xl mx-auto w-full">
            <div className="glass-card flex flex-col sm:flex-row bg-[#0d1421]/60 backdrop-blur-xl border-2 border-white/10 rounded-xl md:rounded-2xl p-2 shadow-2xl focus-within:border-emerald-500/50 focus-within:shadow-emerald-500/20 transition-all glow-on-hover gap-2 sm:gap-0">
              <div className="flex flex-1 items-center">
                <i className="fas fa-search text-emerald-500 ml-3 md:ml-4 text-base md:text-lg"></i>
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && performAnalysis()}
                  placeholder="PASTE TOKEN ADDRESS..."
                  className="bg-transparent flex-1 px-3 md:px-4 py-2 md:py-2 outline-none uppercase font-bold text-sm md:text-base text-white placeholder-slate-600"
                />
              </div>
              <button
                onClick={performAnalysis}
                disabled={isAnalyzing}
                className="btn-glow bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-black font-black px-6 md:px-8 py-2.5 md:py-3 rounded-lg md:rounded-xl text-xs uppercase transition-all shadow-lg shadow-emerald-500/50 disabled:opacity-50 w-full sm:w-auto"
              >
                {isAnalyzing ? <i className="fas fa-spinner fa-spin"></i> : 'AUDIT'}
              </button>
            </div>

            {/* Enhanced Terminal */}
            <div className="glass-card bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-5 overflow-y-auto text-xs font-mono shadow-2xl custom-scrollbar" style={{ height: '200px' }}>
              {terminalLines.map((l, i) => (
                <div key={i} className={`terminal-line mb-1.5 ${l.includes('ERROR') ? 'text-red-400' : l.includes('WHALE') ? 'text-amber-400' : l.includes('LAUNCH') ? 'text-purple-400' : 'text-emerald-400/80'}`}>
                  <span className="opacity-40 mr-2 text-slate-500">[{new Date().toLocaleTimeString()}]</span>
                  {l}
                </div>
              ))}
            </div>

            {/* Pump Launches */}
            {recentPumpLaunches.length > 0 && (
              <div>
                <h3 className="text-purple-400 text-xs font-black uppercase mb-3 flex items-center gap-2">
                  <i className="fas fa-rocket"></i> Live Pump Feed
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {recentPumpLaunches.map(l => (
                    <div key={l.mint} className="bg-[#0b121d] border border-purple-500/20 hover:border-purple-500/50 rounded-xl p-4 transition-all">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-black text-white text-lg">${l.symbol}</div>
                          <div className="text-xs text-slate-400 truncate w-32">{l.name}</div>
                        </div>
                        <span className="text-[10px] bg-purple-500/10 text-purple-400 px-2 py-1 rounded border border-purple-500/20">NEW</span>
                      </div>
                      <div className="flex justify-between items-center my-3 bg-black/30 p-2 rounded">
                        <span className="font-mono text-[10px] text-slate-500">{shortenAddress(l.mint)}</span>
                        <button onClick={() => copyToClipboard(l.mint, 'CA')} className="hover:text-white text-slate-500">
                          <i className="fas fa-copy"></i>
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <button onClick={() => window.open(`https://pump.fun/${l.mint}`)} className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 rounded text-xs uppercase flex items-center justify-center gap-1 transition-colors">
                          <i className="fas fa-chart-line"></i> View
                        </button>
                        <button onClick={() => { setInput(l.mint); setTimeout(() => performAnalysis(), 100); }} className="bg-emerald-600 hover:bg-emerald-500 text-black font-bold py-2 rounded text-xs uppercase flex items-center justify-center gap-1 transition-colors">
                          <i className="fas fa-search"></i> Audit
                        </button>
                        <button onClick={() => window.open(`https://jup.ag/swap/SOL-${l.mint}`)} className="bg-green-600 hover:bg-green-500 text-black font-bold py-2 rounded text-xs uppercase flex items-center justify-center gap-1 transition-colors">
                          <i className="fas fa-bolt"></i> Buy
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Verdict Modal */}
            {showVerdict && analysisResult && (
              <section className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-0 sm:p-4 md:p-6 bg-black/80 backdrop-blur-sm animate-fadeIn">
                <div className="glass-verdict coin-slide w-full sm:max-w-4xl sm:rounded-3xl shadow-2xl my-0 sm:my-auto max-h-screen sm:max-h-[95vh] flex flex-col">
                  {/* Scrollable Content Container */}
                  <div className="overflow-y-auto custom-scrollbar flex-1">
                    {/* Header */}
                    <div className="p-4 md:p-6 lg:p-8 border-b border-white/10 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 via-cyan-500/5 to-emerald-500/5 animated-gradient-border opacity-50"></div>
                      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 relative z-10">
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] md:text-xs text-emerald-400 font-black uppercase tracking-widest flex items-center gap-2">
                            <i className="fas fa-shield-alt"></i> Forensic Verdict
                          </span>
                          <h2 className={`text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black italic mt-2 md:mt-3 leading-tight break-words ${analysisResult.riskLevel === 'LOW' ? 'text-emerald-400' : analysisResult.riskLevel === 'CRITICAL' ? 'text-rose-500' : 'text-amber-400'}`}>
                            {analysisResult.verdict}
                          </h2>
                          <div className="text-xs md:text-sm uppercase font-bold text-slate-400 mt-2 flex flex-wrap items-center gap-2 md:gap-3">
                            <span className={`px-2 md:px-3 py-1 rounded-lg ${analysisResult.riskLevel === 'LOW' ? 'bg-emerald-500/20 text-emerald-400' : analysisResult.riskLevel === 'CRITICAL' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'}`}>
                              Risk: {analysisResult.riskLevel}
                            </span>
                            <span className="bg-white/5 px-2 md:px-3 py-1 rounded-lg">Confidence: {analysisResult.confidence}%</span>
                          </div>
                        </div>
                        <div className="glass-card bg-white/5 backdrop-blur-md p-3 md:p-4 rounded-xl border border-white/10 flex-shrink-0">
                          <span className="text-[10px] md:text-xs text-slate-400 uppercase font-bold tracking-widest block">Social Vibe</span>
                          <span className="text-lg md:text-2xl font-black text-white mt-1 block">{analysisResult.socialSentiment?.vibe || 'Neutral'}</span>
                        </div>
                      </div>
                    </div>

                  {/* Body */}
                  <div className="p-4 md:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                    <div className="space-y-3 md:space-y-4">
                      <div className="glass-card stat-item bg-black/30 backdrop-blur-md p-4 md:p-5 rounded-xl md:rounded-2xl border border-white/10 hover:border-emerald-500/30 transition-all">
                        <h3 className="text-xs font-black text-emerald-400 uppercase mb-3 md:mb-4 flex items-center gap-2">
                          <i className="fas fa-check-circle"></i> Key Findings
                        </h3>
                        <ul className="space-y-2 md:space-y-3 text-xs md:text-sm">
                          {analysisResult.findings?.map((f, i) => (
                            <li key={i} className="flex gap-2 md:gap-3 text-slate-300">
                              <i className="fas fa-circle text-emerald-500 text-[6px] mt-1.5 md:mt-2"></i>
                              <span className="leading-relaxed">{f}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      {analysisResult.redFlags?.length > 0 && (
                        <div className="glass-card stat-item bg-rose-900/10 backdrop-blur-md p-4 md:p-5 rounded-xl md:rounded-2xl border border-rose-500/30 hover:border-rose-500/50 transition-all">
                          <h3 className="text-xs font-black text-rose-400 uppercase mb-3 md:mb-4 flex items-center gap-2">
                            <i className="fas fa-exclamation-triangle"></i> Red Flags
                          </h3>
                          <ul className="space-y-2 md:space-y-3 text-xs md:text-sm">
                            {analysisResult.redFlags.map((flag, i) => (
                              <li key={i} className="flex gap-2 md:gap-3 text-rose-300">
                                <i className="fas fa-exclamation-triangle text-rose-500 text-xs mt-1"></i>
                                <span className="leading-relaxed">{flag}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    <div className="space-y-3 md:space-y-4">
                      <div className="glass-card stat-item bg-black/30 backdrop-blur-md p-4 md:p-5 rounded-xl md:rounded-2xl border border-white/10 hover:border-cyan-500/30 transition-all">
                        <h3 className="text-xs font-black text-cyan-400 uppercase mb-3 md:mb-4 flex items-center gap-2">
                          <i className="fas fa-user-shield"></i> Developer Profile
                        </h3>
                        <p className="text-xs md:text-sm text-slate-300 leading-relaxed">{analysisResult.devProfile?.history || 'No data'}</p>
                        {analysisResult.devProfile?.reputation && <p className="text-xs text-slate-400 mt-2 md:mt-3 bg-black/30 px-2 md:px-3 py-1.5 md:py-2 rounded-lg inline-block">Reputation: {analysisResult.devProfile.reputation}</p>}
                      </div>
                      {analysisResult.targets && (
                        <div className="glass-card stat-item bg-gradient-to-br from-emerald-500/10 to-rose-500/10 backdrop-blur-md p-4 md:p-5 rounded-xl md:rounded-2xl border border-white/10 hover:border-white/20 transition-all">
                          <h3 className="text-xs font-black text-slate-300 uppercase mb-3 md:mb-4 flex items-center gap-2">
                            <i className="fas fa-bullseye"></i> Suggested Targets
                          </h3>
                          <div className="grid grid-cols-2 gap-3 md:gap-4">
                            <div className="bg-emerald-500/10 backdrop-blur-sm p-3 md:p-4 rounded-lg md:rounded-xl border border-emerald-500/20">
                              <div className="text-[10px] md:text-xs text-emerald-400 uppercase font-bold mb-1">Entry</div>
                              <div className="text-base md:text-xl font-black text-emerald-400 truncate">{formatPrice(analysisResult.targets.entry)}</div>
                            </div>
                            <div className="bg-rose-500/10 backdrop-blur-sm p-3 md:p-4 rounded-lg md:rounded-xl border border-rose-500/20">
                              <div className="text-[10px] md:text-xs text-rose-400 uppercase font-bold mb-1">Exit</div>
                              <div className="text-base md:text-xl font-black text-rose-400 truncate">{formatPrice(analysisResult.targets.exit)}</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Live Stats */}
                  <div className="px-4 md:px-6 lg:px-8 pb-4 md:pb-6">
                    <h3 className="text-xs font-black text-slate-400 uppercase mb-3 md:mb-5 flex items-center gap-2">
                      <i className="fas fa-chart-line"></i> Live Market Stats
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 md:gap-4">
                      {[
                        { label: 'Price', val: formatPrice(currentPrice), icon: 'fa-dollar-sign' },
                        { label: 'Liquidity', val: formatLiq(liquidity), icon: 'fa-water' },
                        { label: 'MC/FDV', val: formatMC(marketCap), icon: 'fa-chart-pie' },
                        { label: 'Holders', val: holders ?? '—', icon: 'fa-users' },
                        {
                          label: '5m Δ',
                          val: volumeChange5m ? `${volumeChange5m}%` : '—',
                          color: volumeChange5m > 0 ? 'text-emerald-500' : volumeChange5m < 0 ? 'text-rose-500' : 'text-white',
                          icon: 'fa-arrow-trend-up'
                        }
                      ].map((stat, i) => (
                        <div key={i} className="glass-card stat-item price-updated bg-black/30 backdrop-blur-md p-3 md:p-4 rounded-lg md:rounded-xl border border-white/10 hover:border-emerald-500/30 text-center transition-all">
                          <div className="text-[10px] md:text-xs text-slate-400 uppercase flex items-center justify-center gap-1 md:gap-2 mb-1 md:mb-2">
                            <i className={`fas ${stat.icon} text-emerald-500/50 text-[10px] md:text-xs`}></i>
                            <span className="hidden sm:inline">{stat.label}</span>
                            <span className="sm:hidden">{stat.label.split(' ')[0]}</span>
                          </div>
                          <div className={`text-sm md:text-lg font-black truncate ${stat.color || 'text-white'}`}>
                            {stat.val}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Contract & Chart */}
                  <div className="px-4 md:px-6 lg:px-8 pb-4 md:pb-6 space-y-4 md:space-y-6">
                    <div className="glass-card bg-black/40 backdrop-blur-md p-3 md:p-5 rounded-lg md:rounded-xl border border-white/10 hover:border-cyan-500/30 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 transition-all">
                      <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0 w-full sm:w-auto">
                        <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-br from-cyan-500/20 to-purple-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                          <i className="fas fa-file-code text-cyan-400 text-sm md:text-base"></i>
                        </div>
                        <span className="font-mono text-xs md:text-sm text-slate-300 truncate">{analysisResult.contractAddress}</span>
                      </div>
                      <button onClick={() => copyToClipboard(analysisResult.contractAddress)} className="btn-glow bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:text-emerald-300 font-bold uppercase text-xs px-3 md:px-4 py-2 rounded-lg transition-all w-full sm:w-auto">
                        <i className="fas fa-copy mr-1 md:mr-2"></i>Copy
                      </button>
                    </div>
                    <div className="chart-container glass-card bg-black/30 backdrop-blur-md rounded-xl md:rounded-2xl border border-white/10 p-3 md:p-6">
                      <div className="flex items-center justify-between mb-3 md:mb-4">
                        <h4 className="text-[10px] md:text-xs font-black text-slate-400 uppercase flex items-center gap-1 md:gap-2">
                          <i className="fas fa-chart-area text-emerald-500 text-xs md:text-sm"></i>
                          <span className="hidden sm:inline">Price History</span>
                          <span className="sm:hidden">Chart</span>
                        </h4>
                        <div className="flex gap-2">
                          <span className="text-[10px] md:text-xs text-slate-500 bg-black/40 px-2 md:px-3 py-0.5 md:py-1 rounded-lg">24H</span>
                        </div>
                      </div>
                      <div className="h-48 md:h-60 relative">
                        <canvas ref={chartRef} />
                      </div>
                    </div>
                  </div>

                  {/* Action Links */}
                  <div className="px-4 md:px-6 lg:px-8 pb-4 md:pb-8">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
                      {pairChain === 'solana' ? (
                        <button 
                          onClick={() => window.open(`https://jup.ag/swap/SOL-${analysisResult.contractAddress}`, '_blank')}
                          className="btn-glow glow-on-hover glass-card bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-black py-3 md:py-4 rounded-lg md:rounded-xl uppercase text-[10px] md:text-xs flex items-center justify-center gap-1 md:gap-2 transition-all shadow-lg shadow-green-500/30 border border-green-500/20"
                        >
                          <i className="fas fa-bolt text-xs md:text-sm"></i> 
                          <span className="hidden sm:inline">Buy Jupiter</span>
                          <span className="sm:hidden">Jupiter</span>
                        </button>
                      ) : (
                        <button 
                          onClick={() => {
                            const uniswapUrl = `https://app.uniswap.org/#/swap?outputCurrency=${analysisResult.contractAddress}`;
                            window.open(uniswapUrl, '_blank');
                          }}
                          className="btn-glow glow-on-hover glass-card bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-black py-3 md:py-4 rounded-lg md:rounded-xl uppercase text-[10px] md:text-xs flex items-center justify-center gap-1 md:gap-2 transition-all shadow-lg shadow-blue-500/30 border border-blue-500/20"
                        >
                          <i className="fas fa-exchange-alt text-xs md:text-sm"></i> 
                          <span className="hidden sm:inline">Trade Uniswap</span>
                          <span className="sm:hidden">Trade</span>
                        </button>
                      )}

                      <button
                        onClick={checkHoneypot}
                        disabled={isCheckingHoneypot || !analysisResult?.contractAddress}
                        className={`btn-glow glow-on-hover glass-card bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-black py-3 md:py-4 rounded-lg md:rounded-xl uppercase text-[10px] md:text-xs flex items-center justify-center gap-1 md:gap-2 transition-all shadow-lg shadow-orange-500/30 border border-orange-500/20 ${isCheckingHoneypot ? 'opacity-50 cursor-wait' : ''
                          }`}
                      >
                        <i className={`fas ${isCheckingHoneypot ? 'fa-spinner fa-spin' : 'fa-vial'} text-xs md:text-sm`}></i>
                        {isCheckingHoneypot ? <span className="hidden sm:inline">Checking...</span> : 'Honeypot'}
                      </button>

                      {pairChain === 'solana' && (
                        <button
                          onClick={checkHoneypot}
                          disabled={isCheckingHoneypot || !analysisResult?.contractAddress}
                          className={`btn-glow glow-on-hover glass-card bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-black py-3 md:py-4 rounded-lg md:rounded-xl uppercase text-[10px] md:text-xs flex items-center justify-center gap-1 md:gap-2 transition-all shadow-lg shadow-red-500/30 border border-red-500/20 ${isCheckingHoneypot ? 'opacity-50 cursor-wait' : ''
                            }`}
                        >
                          <i className={`fas ${isCheckingHoneypot ? 'fa-spinner fa-spin' : 'fa-skull'} text-xs md:text-sm`}></i>
                          <span className="hidden sm:inline">Rug Check</span>
                          <span className="sm:hidden">Rug</span>
                        </button>
                      )}

                      <button 
                        onClick={() => {
                          const chain = pairChain === 'solana' ? 'solana' : pairChain === 'base' ? 'base' : pairChain === 'bsc' ? 'bsc' : 'ethereum';
                          window.open(`https://dexscreener.com/${chain}/${analysisResult.contractAddress}`, '_blank');
                        }}
                        className="btn-glow glow-on-hover glass-card bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black py-3 md:py-4 rounded-lg md:rounded-xl uppercase text-[10px] md:text-xs flex items-center justify-center gap-1 md:gap-2 transition-all shadow-lg shadow-emerald-500/30 border border-emerald-500/20"
                      >
                        <i className="fas fa-external-link-alt text-xs md:text-sm"></i> 
                        <span className="hidden sm:inline">DexScreener</span>
                        <span className="sm:hidden">Chart</span>
                      </button>
                    </div>
                  </div>

                  {/* Honeypot Result Display */}
                  {honeypotStatus && (
                    <div className={`mx-4 md:mx-6 lg:mx-8 mb-4 md:mb-6 glass-card backdrop-blur-xl p-4 md:p-5 rounded-xl md:rounded-2xl border-2 ${honeypotStatus.isHoneypot ? 'bg-red-900/20 border-red-500/40 shadow-lg shadow-red-500/20' : 'bg-green-900/20 border-green-500/40 shadow-lg shadow-green-500/20'} animate-fadeIn`}>
                      <div className="flex items-start gap-3 md:gap-4">
                        <i className={`fas ${honeypotStatus.isHoneypot ? 'fa-exclamation-triangle text-red-400' : 'fa-check-circle text-green-400'} text-xl md:text-2xl flex-shrink-0`}></i>
                        <div className="flex-1 min-w-0">
                          <h4 className={`font-black text-sm md:text-base uppercase ${honeypotStatus.isHoneypot ? 'text-red-400' : 'text-green-400'} mb-1 md:mb-2`}>
                            {honeypotStatus.isHoneypot ? '⚠️ DANGER DETECTED' : '✓ SAFETY CHECK PASSED'}
                          </h4>
                          <p className="text-xs md:text-sm text-slate-300 leading-relaxed">{honeypotStatus.details}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Bottom Actions */}
                  <div className="px-4 md:px-6 lg:px-8 pb-4 md:pb-8 border-t border-white/5 pt-4 md:pt-6 bg-slate-900/80 backdrop-blur-sm">
                    <div className="flex flex-col sm:flex-row gap-2 md:gap-4">
                      <button onClick={savePosition} className="btn-glow glow-on-hover flex-1 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-black font-black py-3 md:py-4 rounded-lg md:rounded-xl uppercase text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/50">
                        <i className="fas fa-wallet"></i> Save to Portfolio
                      </button>
                      <button onClick={() => setShowVerdict(false)} className="sm:px-8 glass-card bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white font-bold py-3 md:py-4 rounded-lg md:rounded-xl uppercase text-xs transition-all">
                        Close
                      </button>
                    </div>
                  </div>
                  </div>
                  {/* End Scrollable Container */}
                </div>
              </section>
            )}
          </div>
        </section>

        <aside className="w-80 bg-gradient-to-b from-slate-950 to-slate-900 border-l border-white/5 p-6 hidden xl:block overflow-y-auto custom-scrollbar">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-2">
              <i className="fas fa-briefcase text-emerald-500"></i>
              <div className="text-xs uppercase font-black text-slate-400">Audited Portfolio</div>
            </div>
            <span className="bg-emerald-500/20 text-emerald-400 text-[10px] px-3 py-1 rounded-full font-bold border border-emerald-500/30">{portfolio.length} ACTIVE</span>
          </div>

          <div className="space-y-3">
            {portfolio.map(p => {
              const addr = p.contractAddress?.toLowerCase();
              const currPrice = tokenPrices[addr];
              const entryRaw = p.entryPrice;
              const isManual = entryRaw === 'manual' || !entryRaw;
              const entryNum = !isManual ? parseFloat(entryRaw) : null;
              const pnl = currPrice && entryNum ? ((currPrice / entryNum - 1) * 100).toFixed(2) : null;
              return (
                <div key={p.id} className="portfolio-card coin-slide glass-card bg-white/5 backdrop-blur-md border border-white/10 hover:border-emerald-500/30 rounded-xl p-4 transition-all group relative shadow-lg">
                  <button onClick={() => deletePosition(p.id)} className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 transition-all z-10">
                    <i className="fas fa-times-circle text-lg"></i>
                  </button>
                  <div className="font-black text-white text-lg tracking-tight mb-3">${p.token}</div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-center bg-black/30 p-2 rounded-lg">
                      <span className="text-slate-400">Entry</span>
                      <span className="font-mono text-emerald-400 font-bold">{isManual ? 'Manual' : formatPrice(entryNum)}</span>
                    </div>
                    <div className="flex justify-between items-center bg-black/30 p-2 rounded-lg">
                      <span className="text-slate-400">Current</span>
                      <span className="font-mono text-cyan-400 font-bold">{formatPrice(currPrice)}</span>
                    </div>
                    {pnl !== null && (
                      <div className={`flex justify-between items-center p-2 rounded-lg ${parseFloat(pnl) > 0 ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-rose-500/10 border border-rose-500/30'}`}>
                        <span className="font-bold">PNL</span>
                        <span className={`font-black text-sm ${parseFloat(pnl) > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {parseFloat(pnl) > 0 ? '↑' : '↓'} {pnl}%
                        </span>
                      </div>
                    )}
                    <div className={`flex justify-between items-center p-2 rounded-lg ${p.risk === 'LOW' ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-rose-500/10 border border-rose-500/30'}`}>
                      <span className="font-bold">Risk</span>
                      <span className={`font-black text-xs ${p.risk === 'LOW' ? 'text-emerald-400' : 'text-rose-400'}`}>{p.risk}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {portfolio.length === 0 && (
              <div className="glass-card text-center py-12 border-2 border-dashed border-white/5 rounded-2xl bg-black/20 backdrop-blur-md">
                <i className="fas fa-folder-open text-4xl text-slate-700 mb-3"></i>
                <p className="text-slate-600 text-xs uppercase italic font-bold">No active positions</p>
                <p className="text-slate-700 text-[10px] mt-1">Audit tokens to begin tracking</p>
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}

export default App;
