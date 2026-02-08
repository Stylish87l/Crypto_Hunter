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
        const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true');
        if (!res.ok) throw new Error('Network response was not ok');
        const data = await res.json();
        setTickers([
          { symbol: 'BTC', price: data.bitcoin.usd.toLocaleString(), change: (data.bitcoin.usd_24h_change || 0).toFixed(2) + '%' },
          { symbol: 'ETH', price: data.ethereum.usd.toLocaleString(), change: (data.ethereum.usd_24h_change || 0).toFixed(2) + '%' },
          { symbol: 'SOL', price: data.solana.usd.toLocaleString(), change: (data.solana.usd_24h_change || 0).toFixed(2) + '%' }
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
      <header className="px-6 py-4 bg-black border-b border-white/5 flex justify-between items-center z-10">
        <div className="flex items-center gap-3">
          <i className="fas fa-bolt text-emerald-500 text-2xl animate-pulse"></i>
          <h1 className="font-black text-white uppercase text-lg tracking-wider">Agent Hunter <span className="text-emerald-500">Pro</span> v6.5</h1>
        </div>
        <div className="flex gap-4">
          <button onClick={connectEVM} className="bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-500/50 px-6 py-2 rounded-lg text-xs uppercase font-black flex items-center gap-2 transition-all">
            <i className="fas fa-wallet"></i> {evmAddress ? shortenAddress(evmAddress) : 'Connect EVM'}
          </button>
          <button onClick={connectSolana} className="bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 border border-purple-500/50 px-6 py-2 rounded-lg text-xs uppercase font-black flex items-center gap-2 transition-all">
            <i className="fas fa-ghost"></i> {solAddress ? shortenAddress(solAddress) : 'Connect SOL'}
          </button>
        </div>
      </header>

      {/* Ticker */}
      <div className="bg-[#020408] border-b border-white/5 py-2 overflow-hidden whitespace-nowrap flex">
        <div className="animate-marquee inline-block">
          {[...tickers, ...tickers].map((t, i) => (
            <span key={i} className="mx-6 text-xs font-mono font-bold text-slate-400">
              {t.symbol} <span className="text-white">${t.price}</span> <span className={t.change.includes('-') ? 'text-red-500' : 'text-green-500'}>({t.change})</span>
            </span>
          ))}
        </div>
      </div>

      <main className="flex-1 flex overflow-hidden">
        <section className="flex-1 overflow-y-auto p-6 space-y-8 min-w-0">
          <div className="max-w-4xl mx-auto">
            <div className="flex bg-[#0d1421] border border-white/10 rounded-xl p-2 shadow-lg focus-within:border-emerald-500/50 transition-colors">
              <i className="fas fa-search text-emerald-500 self-center ml-4"></i>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && performAnalysis()}
                placeholder="PASTE TOKEN ADDRESS OR TICKER..."
                className="bg-transparent flex-1 px-4 outline-none uppercase font-bold text-white placeholder-slate-600"
              />
              <button
                onClick={performAnalysis}
                disabled={isAnalyzing}
                className="bg-emerald-500 hover:bg-emerald-400 text-black font-black px-6 rounded-lg text-xs uppercase transition-colors"
              >
                {isAnalyzing ? <i className="fas fa-spinner fa-spin"></i> : 'AUDIT'}
              </button>
            </div>

            {/* Terminal */}
            <div className="bg-black/80 border border-white/10 rounded-xl p-4 overflow-y-auto text-xs font-mono shadow-inner custom-scrollbar" style={{ height: '200px' }}>
              {terminalLines.map((l, i) => (
                <div key={i} className={`mb-1 ${l.includes('ERROR') ? 'text-red-500' : l.includes('WHALE') ? 'text-amber-400' : l.includes('LAUNCH') ? 'text-purple-400' : 'text-emerald-500/80'}`}>
                  <span className="opacity-50 mr-2">[{new Date().toLocaleTimeString()}]</span>
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
              <section className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
                <div className="w-full max-w-4xl bg-[#0b121d] border border-emerald-500/30 rounded-2xl shadow-2xl overflow-hidden my-auto">
                  {/* Header */}
                  <div className="p-6 border-b border-white/10 bg-black/30">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xs text-emerald-500 font-black uppercase tracking-widest">Forensic Verdict</span>
                        <h2 className={`text-4xl font-black italic mt-2 ${analysisResult.riskLevel === 'LOW' ? 'text-emerald-400' : analysisResult.riskLevel === 'CRITICAL' ? 'text-rose-500' : 'text-amber-400'}`}>
                          {analysisResult.verdict}
                        </h2>
                        <p className="text-sm uppercase font-bold text-slate-400 mt-1">Risk: {analysisResult.riskLevel} • Confidence: {analysisResult.confidence}%</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-slate-500 uppercase font-bold tracking-widest block">Social Vibe</span>
                        <span className="text-lg font-black text-white">{analysisResult.socialSentiment?.vibe || 'Neutral'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                        <h3 className="text-xs font-black text-emerald-500 uppercase mb-3">Key Findings</h3>
                        <ul className="space-y-2 text-sm">
                          {analysisResult.findings?.map((f, i) => (
                            <li key={i} className="flex gap-2 text-slate-300">
                              <i className="fas fa-circle text-emerald-500 text-[6px] mt-2"></i>
                              {f}
                            </li>
                          ))}
                        </ul>
                      </div>
                      {analysisResult.redFlags?.length > 0 && (
                        <div className="bg-rose-900/20 p-4 rounded-xl border border-rose-500/30">
                          <h3 className="text-xs font-black text-rose-500 uppercase mb-3">Red Flags</h3>
                          <ul className="space-y-2 text-sm">
                            {analysisResult.redFlags.map((flag, i) => (
                              <li key={i} className="flex gap-2 text-rose-300">
                                <i className="fas fa-exclamation-triangle text-rose-500 text-xs mt-1"></i>
                                {flag}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    <div className="space-y-4">
                      <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                        <h3 className="text-xs font-black text-slate-500 uppercase mb-3">Developer Profile</h3>
                        <p className="text-sm text-slate-300">{analysisResult.devProfile?.history || 'No data'}</p>
                        {analysisResult.devProfile?.reputation && <p className="text-xs text-slate-400 mt-2">Reputation: {analysisResult.devProfile.reputation}</p>}
                      </div>
                      {analysisResult.targets && (
                        <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                          <h3 className="text-xs font-black text-slate-500 uppercase mb-3">Suggested Targets</h3>
                          <div className="grid grid-cols-2 gap-4 text-lg font-black">
                            <div className="text-emerald-400">Entry: {formatPrice(analysisResult.targets.entry)}</div>
                            <div className="text-rose-400">Exit: {formatPrice(analysisResult.targets.exit)}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Live Stats */}
                  <div className="px-6 pb-6">
                    <h3 className="text-xs font-black text-slate-500 uppercase mb-4">Live Market Stats</h3>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      {[
                        { label: 'Price', val: formatPrice(currentPrice) },
                        { label: 'Liquidity', val: formatLiq(liquidity) },
                        { label: 'MC/FDV', val: formatMC(marketCap) },
                        { label: 'Holders', val: holders ?? '—' },
                        {
                          label: '5m Price Δ',
                          val: volumeChange5m ? `${volumeChange5m}%` : '—',
                          color: volumeChange5m > 0 ? 'text-green-500' : volumeChange5m < 0 ? 'text-red-500' : 'text-white'
                        }
                      ].map((stat, i) => (
                        <div key={i} className="bg-black/30 p-3 rounded-lg border border-white/5 text-center">
                          <div className="text-xs text-slate-500 uppercase">{stat.label}</div>
                          <div className={`text-lg font-black truncate ${stat.color || 'text-white'}`}>
                            {stat.val}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Contract & Chart */}
                  <div className="px-6 pb-6 space-y-6">
                    <div className="bg-black/40 p-4 rounded-lg border border-white/5 flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <i className="fas fa-file-code text-slate-500"></i>
                        <span className="font-mono text-sm text-slate-300 truncate max-w-xs">{analysisResult.contractAddress}</span>
                      </div>
                      <button onClick={() => copyToClipboard(analysisResult.contractAddress)} className="text-emerald-500 hover:text-emerald-400 font-bold uppercase text-xs">Copy CA</button>
                    </div>
                    <div className="bg-black/20 rounded-xl border border-white/5 p-4">
                      <div className="h-60 relative">
                        <canvas ref={chartRef} />
                      </div>
                    </div>
                  </div>

                  {/* Action Links */}
                  <div className="px-6 pb-8">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {pairChain === 'solana' ? (
                        <button className="bg-green-600 hover:bg-green-500 text-black font-black py-3 rounded-xl uppercase text-xs flex items-center justify-center gap-2 transition-all">
                          <i className="fas fa-bolt"></i> Buy Jupiter
                        </button>
                      ) : (
                        <button className="bg-blue-600 hover:bg-blue-500 text-white font-black py-3 rounded-xl uppercase text-xs flex items-center justify-center gap-2 transition-all">
                          <i className="fas fa-exchange-alt"></i> Trade
                        </button>
                      )}

                      <button
                        onClick={checkHoneypot}
                        disabled={isCheckingHoneypot || !analysisResult?.contractAddress}
                        className={`bg-orange-600 hover:bg-orange-500 text-white font-black py-3 rounded-xl uppercase text-xs flex items-center justify-center gap-2 transition-all ${isCheckingHoneypot ? 'opacity-50 cursor-wait' : ''
                          }`}
                      >
                        <i className={`fas ${isCheckingHoneypot ? 'fa-spinner fa-spin' : 'fa-vial'}`}></i>
                        {isCheckingHoneypot ? 'Checking...' : 'Honeypot'}
                      </button>

                      {pairChain === 'solana' && (
                        <button
                          onClick={checkHoneypot}
                          disabled={isCheckingHoneypot || !analysisResult?.contractAddress}
                          className={`bg-red-600 hover:bg-red-500 text-white font-black py-3 rounded-xl uppercase text-xs flex items-center justify-center gap-2 transition-all ${isCheckingHoneypot ? 'opacity-50 cursor-wait' : ''
                            }`}
                        >
                          <i className={`fas ${isCheckingHoneypot ? 'fa-spinner fa-spin' : 'fa-skull'}`}></i>
                          Rug Check
                        </button>
                      )}

                      <button className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black py-3 rounded-xl uppercase text-xs flex items-center justify-center gap-2 transition-all">
                        <i className="fas fa-external-link-alt"></i> DexScreener
                      </button>
                    </div>
                  </div>

                  {/* Honeypot Result Display */}
                  {honeypotStatus && (
                    <div className={`mx-6 mb-6 p-4 rounded-xl border ${honeypotStatus.isHoneypot ? 'bg-red-900/20 border-red-500/30' : 'bg-green-900/20 border-green-500/30'}`}>
                      <div className="flex items-start gap-3">
                        <i className={`fas ${honeypotStatus.isHoneypot ? 'fa-exclamation-triangle text-red-500' : 'fa-check-circle text-green-500'} text-xl`}></i>
                        <div>
                          <h4 className={`font-black text-sm uppercase ${honeypotStatus.isHoneypot ? 'text-red-400' : 'text-green-400'}`}>
                            {honeypotStatus.isHoneypot ? 'DANGER DETECTED' : 'SAFETY CHECK PASSED'}
                          </h4>
                          <p className="text-xs text-slate-300 mt-1">{honeypotStatus.details}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Bottom Actions */}
                  <div className="px-6 pb-6 border-t border-white/10 pt-6">
                    <div className="flex gap-4">
                      <button onClick={savePosition} className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black font-black py-4 rounded-xl uppercase text-xs flex items-center justify-center gap-2 transition-all shadow-lg">
                        <i className="fas fa-wallet"></i> Save to Portfolio
                      </button>
                      <button onClick={() => setShowVerdict(false)} className="px-8 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold py-4 rounded-xl uppercase text-xs transition-all">
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            )}
          </div>
        </section>

        <aside className="w-80 bg-[#080d17] border-l border-white/5 p-6 hidden xl:block overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <div className="text-xs uppercase font-black text-slate-500">Audited Portfolio</div>
            <span className="bg-emerald-500/20 text-emerald-500 text-[10px] px-2 py-0.5 rounded-full font-bold">{portfolio.length} ACTIVE</span>
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
                <div key={p.id} className="bg-white/5 border border-white/10 hover:border-emerald-500/30 rounded-xl p-4 transition-colors group relative">
                  <button onClick={() => deletePosition(p.id)} className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 transition-opacity">
                    <i className="fas fa-times-circle"></i>
                  </button>
                  <div className="font-black text-white text-lg tracking-tight">${p.token}</div>
                  <div className="mt-3 space-y-1 text-xs">
                    <div className="flex justify-between text-slate-400">
                      <span>Entry</span>
                      <span className="font-mono text-white">{isManual ? 'Manual' : formatPrice(entryNum)}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Current</span>
                      <span className="font-mono text-white">{formatPrice(currPrice)}</span>
                    </div>
                    {pnl !== null && (
                      <div className="flex justify-between">
                        <span>PNL</span>
                        <span className={`font-bold ${parseFloat(pnl) > 0 ? 'text-green-500' : 'text-red-500'}`}>{pnl}%</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Risk</span>
                      <span className={`font-bold ${p.risk === 'LOW' ? 'text-emerald-500' : 'text-rose-400'}`}>{p.risk}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {portfolio.length === 0 && (
              <div className="text-center py-10 border-2 border-dashed border-white/5 rounded-xl text-slate-600 text-xs uppercase italic">
                No active positions<br />Audit to begin tracking
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}

export default App;
