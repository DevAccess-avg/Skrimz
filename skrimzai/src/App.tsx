import React, { useState, useRef, useEffect, useMemo } from "react";
import { 
  Send, Image as ImageIcon, X, Loader2, Sparkles, User, Bot, 
  Layout, Maximize2, Minimize2, History, LogOut, CreditCard, 
  Activity, Menu, Plus, MessageSquare, ChevronLeft, ChevronRight,
  Settings, Shield, Palette, Trash2, CheckCircle2, AlertCircle,
  Code, Search, Zap, Clock, Info
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import Markdown from "react-markdown";
import { cn } from "./lib/utils";
import { chatWithGemini, Message } from "./services/gemini";

// --- Types ---
interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
}

interface UserProfile {
  id: number;
  username: string;
  email: string;
  is_pro: number;
  theme: string;
}

interface UsageStats {
  message_count: number;
  last_message_at: string | null;
  image_count: number;
  last_image_at: string | null;
}

type AIMode = 'regular' | 'coding' | 'ultra';

// --- Components ---

const BackgroundParticles = () => {
  const particles = useMemo(() => {
    return Array.from({ length: 30 }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      size: `${Math.random() * 3 + 1}px`,
      duration: `${Math.random() * 10 + 10}s`,
      delay: `${Math.random() * 10}s`,
      type: Math.random() > 0.7 ? 'glow' : 'dot'
    }));
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {particles.map((p) => (
        <div
          key={p.id}
          className={p.type === 'glow' ? 'glow-particle' : 'particle'}
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
            animationDuration: p.duration,
            animationDelay: p.delay,
            opacity: 0.3
          }}
        />
      ))}
    </div>
  );
};

export default function App() {
  // --- UI States ---
  const [isWidget, setIsWidget] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeModal, setActiveModal] = useState<'auth' | 'settings' | 'pro' | null>(null);
  const [authStep, setAuthStep] = useState<'login' | 'register'>('login');
  const [settingsTab, setSettingsTab] = useState<'general' | 'theme' | 'account'>('general');
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
  
  // --- Data States ---
  const [user, setUser] = useState<UserProfile | null>(null);
  const [usage, setUsage] = useState<UsageStats>({ message_count: 0, last_message_at: null, image_count: 0, last_image_at: null });
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>(localStorage.getItem('skrimz_session_id') || Math.random().toString(36).substr(2, 9));
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [aiMode, setAiMode] = useState<AIMode>('regular');
  const [serverStatus, setServerStatus] = useState({ status: "Checking...", latency: "0ms" });
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  // --- Auth Form States ---
  const [formData, setFormData] = useState({ username: '', email: '', password: '', confirmPassword: '' });
  const [authError, setAuthError] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Themes ---
  const themes = [
    { id: 'crimson', name: 'Crimson Gloss', bg: '#1a0505', accent: '#c41e1e' },
    { id: 'obsidian', name: 'Obsidian Void', bg: '#050505', accent: '#3b82f6' },
    { id: 'emerald', name: 'Emerald Glass', bg: '#051a05', accent: '#10b981' },
    { id: 'midnight', name: 'Midnight Blue', bg: '#05051a', accent: '#6366f1' },
  ];

  useEffect(() => {
    const theme = themes.find(t => t.id === (user?.theme || 'crimson')) || themes[0];
    document.documentElement.style.setProperty('--theme-bg', theme.bg);
    document.documentElement.style.setProperty('--theme-accent', theme.accent);
    
    // Set RGB for glow effects
    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '196, 30, 30';
    };
    document.documentElement.style.setProperty('--theme-accent-rgb', hexToRgb(theme.accent));
  }, [user?.theme]);

  // --- Initial Load & Persistence ---
  useEffect(() => {
    const savedUser = localStorage.getItem('skrimz_user');
    if (savedUser) setUser(JSON.parse(savedUser));

    const checkStatus = async () => {
      try {
        const res = await fetch("/api/status");
        const data = await res.json();
        setServerStatus(data);
      } catch (e) {
        setServerStatus({ status: "Offline", latency: "N/A" });
      }
    };
    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (user) {
      localStorage.setItem('skrimz_user', JSON.stringify(user));
      fetchSessions();
      fetchUsage();
    } else {
      localStorage.removeItem('skrimz_user');
      setSessions([]);
      setMessages([{ id: 'welcome', role: "model", text: "Welcome to SkrimzAI. How can I help you today?" }]);
    }
  }, [user]);

  useEffect(() => {
    localStorage.setItem('skrimz_session_id', currentSessionId);
  }, [currentSessionId]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // --- API Calls ---

  const fetchSessions = async () => {
    if (!user) return;
    const res = await fetch(`/api/chats/${user.id}`);
    const data = await res.json();
    // Ensure unique IDs to prevent React key warnings
    const uniqueSessions = Array.from(new Map(data.map((s: any) => [s.id, s])).values()) as ChatSession[];
    setSessions(uniqueSessions);
    const current = uniqueSessions.find((s: any) => s.id === currentSessionId);
    if (current) setMessages(current.messages);
    else if (messages.length === 0) startNewChat();
  };

  const fetchUsage = async () => {
    if (!user) return;
    const res = await fetch(`/api/usage/${user.id}`);
    const data = await res.json();
    setUsage(data);
  };

  const trackUsage = async (type: 'message' | 'image') => {
    if (!user) return;
    await fetch("/api/usage/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, type })
    });
    fetchUsage();
  };

  const handleAuth = async () => {
    setAuthError("");
    try {
      if (authStep === 'register') {
        if (formData.password !== formData.confirmPassword) return setAuthError("Passwords do not match");
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData)
        });
        if (!res.ok) throw new Error((await res.json()).error);
        setUser(await res.json());
        setActiveModal(null);
      } else {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: formData.email, password: formData.password })
        });
        if (!res.ok) throw new Error((await res.json()).error);
        setUser(await res.json());
        setActiveModal(null);
      }
    } catch (e: any) {
      setAuthError(e.message);
    }
  };

  const saveCurrentChat = async (msgs: Message[]) => {
    if (!user) return;
    const title = msgs.find(m => m.role === 'user')?.text.slice(0, 30) || "New Conversation";
    await fetch("/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: currentSessionId,
        userId: user.id,
        title,
        messages: msgs
      })
    });
    fetchSessions();
  };

  const startNewChat = () => {
    const newId = Math.random().toString(36).substr(2, 9);
    setCurrentSessionId(newId);
    setMessages([{ id: Math.random().toString(36).substr(2, 9), role: "model", text: "How can SkrimzAI help you today?" }]);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const handleSend = async () => {
    if ((!input.trim() && images.length === 0) || isLoading) return;

    // Check Limits
    if (user?.is_pro === 0) {
      if (input.trim() && usage.message_count >= 250) return alert("Message limit reached. Resets in 5 hours.");
      if (images.length > 0 && usage.image_count >= 10) return alert("Image limit reached. Resets in 10 hours.");
    }

    const userMessage: Message = { 
      id: Math.random().toString(36).substr(2, 9),
      role: "user", 
      text: input, 
      images: [...images] 
    };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setImages([]);
    setIsLoading(true);

    try {
      const response = await chatWithGemini(input || "Analyze this image", userMessage.images, messages, aiMode);
      const finalMessages: Message[] = [
        ...newMessages, 
        { id: Math.random().toString(36).substr(2, 9), role: "model", text: response }
      ];
      setMessages(finalMessages);
      if (user) {
        saveCurrentChat(finalMessages);
        if (input.trim()) trackUsage('message');
        if (userMessage.images?.length) trackUsage('image');
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: "model", text: "Error processing request. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpgrade = async () => {
    if (!user) return setActiveModal('auth');
    
    // Simulate payment processing
    const confirmPayment = confirm("Proceed with $7.99 payment via SkrimzBank?");
    if (confirmPayment) {
      try {
        const res = await fetch("/api/settings/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id, is_pro: 1 })
        });
        if (!res.ok) throw new Error("Failed to update status");
        
        const newUser = { ...user, is_pro: 1 };
        setUser(newUser);
        setActiveModal(null);
        alert("Welcome to SkrimzAI Pro!");
      } catch (e) {
        alert("Payment verification failed. Please try again.");
      }
    }
  };

  const loadSession = (session: ChatSession) => {
    setCurrentSessionId(session.id);
    setMessages(session.messages);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newImages: string[] = [];
    const processFiles = async () => {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!user?.is_pro && usage.image_count + newImages.length >= 10) {
          alert("Image limit reached! Upgrade to Pro for unlimited uploads.");
          break;
        }

        const reader = new FileReader();
        const promise = new Promise<string>((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
        });
        reader.readAsDataURL(file);
        const base64 = await promise;
        newImages.push(base64);
      }
      setImages(prev => [...prev, ...newImages]);
    };
    processFiles();
  };

  // --- Timer Logic ---
  const getTimer = (lastAt: string | null, hours: number) => {
    if (!lastAt) return null;
    const resetAt = new Date(new Date(lastAt).getTime() + hours * 3600000);
    const diff = resetAt.getTime() - Date.now();
    if (diff <= 0) return "Ready";
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h}h ${m}m`;
  };

  const msgTimer = getTimer(usage.last_message_at, 5);
  const imgTimer = getTimer(usage.last_image_at, 10);

  // --- Render Helpers ---

  const renderAuthModal = () => (
    <div key="auth-modal" className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setActiveModal(null)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative glass-panel p-8 rounded-3xl w-full max-w-md border-white/10 overflow-hidden">
        <div className="absolute inset-0 glossy-overlay opacity-20 pointer-events-none" />
        <h3 className="text-2xl font-bold mb-2">{authStep === 'login' ? 'Welcome Back' : 'Create Account'}</h3>
        <p className="text-white/40 text-sm mb-6">
          {authStep === 'login' ? 'Login to SkrimzAI' : 'Join the future of intelligence'}
        </p>

        <div className="space-y-4">
          {authStep === 'register' && (
            <input value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} placeholder="Username" className="glass-input w-full" />
          )}
          {(authStep === 'register' || authStep === 'login') && (
            <input value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="Email Address" className="glass-input w-full" />
          )}
          {(authStep === 'register' || authStep === 'login') && (
            <input type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} placeholder="Password" className="glass-input w-full" />
          )}
          {authStep === 'register' && (
            <input type="password" value={formData.confirmPassword} onChange={e => setFormData({...formData, confirmPassword: e.target.value})} placeholder="Confirm Password" className="glass-input w-full" />
          )}
          
          {authError && <div className="text-red-400 text-xs flex items-center gap-2 bg-red-400/10 p-3 rounded-xl"><AlertCircle size={14} /> {authError}</div>}
          
          <button onClick={handleAuth} className="glass-button w-full py-4 shadow-theme-accent/20 shadow-lg glass-shimmer">
            {authStep === 'login' ? 'Login' : 'Register'}
          </button>

          <div className="text-center space-y-2">
            <button onClick={() => setAuthStep(authStep === 'login' ? 'register' : 'login')} className="text-xs text-white/40 hover:text-theme-accent transition-colors">
              {authStep === 'login' ? "Don't have an account? Register" : "Already have an account? Login"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );

  const renderSettingsModal = () => (
    <div key="settings-modal" className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setActiveModal(null)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative glass-panel rounded-3xl w-full max-w-2xl border-white/10 flex flex-col h-[500px] overflow-hidden">
        <div className="flex border-b border-white/10">
          {[
            { id: 'general', icon: Settings, label: 'General' },
            { id: 'theme', icon: Palette, label: 'Theme' },
            { id: 'account', icon: Shield, label: 'Account' }
          ].map(tab => (
            <button key={tab.id} onClick={() => setSettingsTab(tab.id as any)} className={cn("flex-1 flex items-center justify-center gap-2 py-4 text-sm font-bold transition-all", settingsTab === tab.id ? "bg-white/5 text-theme-accent border-b-2 border-theme-accent" : "text-white/40 hover:bg-white/5")}>
              <tab.icon size={16} /> {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
          {settingsTab === 'general' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold">Widget Mode</h4>
                  <p className="text-xs text-white/40">Enable floating bubble interface</p>
                </div>
                <button onClick={() => setIsWidget(!isWidget)} className={cn("w-12 h-6 rounded-full transition-all relative", isWidget ? "bg-theme-accent" : "bg-white/10")}>
                  <div className={cn("absolute top-1 w-4 h-4 rounded-full bg-white transition-all", isWidget ? "right-1" : "left-1")} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold">Auto-Save Chats</h4>
                  <p className="text-xs text-white/40">Sync conversations to cloud</p>
                </div>
                <div className="text-emerald-400 flex items-center gap-2 text-xs font-bold"><CheckCircle2 size={14} /> Active</div>
              </div>
            </div>
          )}

          {settingsTab === 'theme' && (
            <div className="grid grid-cols-2 gap-4">
              {themes.map(t => (
                <button 
                  key={t.id} 
                  onClick={async () => {
                    if (user) {
                      const newUser = { ...user, theme: t.id };
                      setUser(newUser);
                      await fetch("/api/settings/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: user.id, theme: t.id }) });
                    }
                  }}
                  className={cn("p-4 rounded-2xl border transition-all text-left group", user?.theme === t.id ? "border-theme-accent bg-theme-accent/10" : "border-white/5 hover:bg-white/5")}
                >
                  <div className="w-full h-12 rounded-lg mb-3" style={{ background: t.bg }} />
                  <span className="text-sm font-bold">{t.name}</span>
                </button>
              ))}
            </div>
          )}

          {settingsTab === 'account' && (
            <div className="space-y-6">
              <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold mb-1">Email Address</p>
                <p className="font-bold">{user?.email}</p>
              </div>
              <button 
                onClick={async () => {
                  if (confirm("Are you sure? This will delete all your data permanently.")) {
                    await fetch(`/api/users/${user?.id}`, { method: "DELETE" });
                    setUser(null);
                    setActiveModal(null);
                  }
                }}
                className="w-full p-4 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-2xl flex items-center justify-center gap-2 font-bold transition-all"
              >
                <Trash2 size={18} /> Delete Account
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );

  const renderProModal = () => (
    <div key="pro-modal" className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setActiveModal(null)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative glass-panel p-8 rounded-3xl w-full max-w-md border-white/10">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-theme-accent rounded-2xl shadow-lg shadow-theme-accent/20">
            <CreditCard size={24} />
          </div>
          <h3 className="text-2xl font-bold">SkrimzAI Pro</h3>
        </div>
        
        <div className="space-y-4 mb-8">
          <div className="flex items-center gap-3 text-sm font-medium">
            <Zap size={16} className="text-theme-accent" />
            <span>Unlimited Messages & Images</span>
          </div>
          <div className="flex items-center gap-3 text-sm font-medium">
            <Search size={16} className="text-theme-accent" />
            <span>UltraSearchAI Research Mode</span>
          </div>
          <div className="flex items-center gap-3 text-sm font-medium">
            <Shield size={16} className="text-theme-accent" />
            <span>Bank-Level Security & Priority</span>
          </div>
        </div>

        <div className="bg-white/5 p-6 rounded-2xl border border-white/10 mb-6">
          <div className="flex justify-between items-center mb-4">
            <span className="text-sm font-bold">Monthly Plan</span>
            <span className="text-xl font-bold">$7.99</span>
          </div>
          <div className="mb-4 p-3 bg-theme-accent/10 rounded-xl border border-theme-accent/20">
            <p className="text-[10px] text-theme-accent font-bold uppercase tracking-widest mb-1">Direct Payment Option</p>
            <p className="text-xs font-bold">CashApp: <span className="text-white">$NotAGluestick</span></p>
            <p className="text-[10px] text-white/40 mt-1 italic">Include your email in the note for manual activation.</p>
          </div>
          <div className="space-y-3">
            <input placeholder="Card Number" className="glass-input w-full" />
            <div className="flex gap-3">
              <input placeholder="MM/YY" className="glass-input w-1/2" />
              <input placeholder="CVC" className="glass-input w-1/2" />
            </div>
          </div>
        </div>

        <button onClick={handleUpgrade} className="glass-button w-full py-4 flex items-center justify-center gap-2">
          <Shield size={18} /> Confirm Secure Payment
        </button>
        <p className="text-[10px] text-center mt-4 text-white/20 uppercase tracking-widest">Verified by Stripe & SkrimzBank</p>
      </motion.div>
    </div>
  );

  // --- Main Layout ---

  if (isWidget) {
    return (
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
        <BackgroundParticles />
        <AnimatePresence>
          <motion.div initial={{ opacity: 0, scale: 0.8, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="w-80 h-[500px] glass-panel rounded-3xl mb-4 flex flex-col overflow-hidden shadow-2xl border-white/10">
            <div className="p-4 bg-theme-accent/20 flex items-center justify-between border-b border-white/10">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-theme-accent" />
                <span className="font-bold text-sm">SkrimzAI</span>
              </div>
              <button onClick={() => setIsWidget(false)} className="text-white/40 hover:text-white"><Maximize2 size={14} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {messages.map((msg) => (
                <div key={msg.id} className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[85%] p-3 rounded-2xl text-xs", msg.role === 'user' ? "bg-theme-accent/40 rounded-tr-none" : "bg-white/5 rounded-tl-none")}>
                    <Markdown>{msg.text}</Markdown>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <div className="p-3 bg-black/20 border-t border-white/10">
              <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2">
                <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} placeholder="Ask Skrimz..." className="flex-1 bg-transparent border-none text-xs focus:ring-0" />
                <button onClick={handleSend} className="text-theme-accent"><Send size={16} /></button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
        <button onClick={() => setIsWidget(false)} className="w-14 h-14 rounded-full bg-theme-accent flex items-center justify-center shadow-xl hover:scale-110 transition-transform"><Bot className="text-white" /></button>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-theme-bg overflow-hidden text-white font-sans relative">
      <BackgroundParticles />
      
      {/* Sidebar */}
      <motion.aside initial={false} animate={{ width: isSidebarOpen ? 280 : 0, opacity: isSidebarOpen ? 1 : 0 }} className="glass-panel border-r border-white/5 flex flex-col z-40 relative">
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="text-theme-accent" size={20} />
            <span className="font-bold text-xl tracking-tighter">SkrimzAI</span>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden"><X size={20} /></button>
        </div>

        <div className="px-4 mb-4">
          <button onClick={startNewChat} className="w-full flex items-center gap-2 bg-white/5 hover:bg-white/10 p-3 rounded-xl transition-colors border border-white/5">
            <Plus size={18} /> <span className="text-sm font-bold">New Chat</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 space-y-2 custom-scrollbar">
          <div className="text-[10px] uppercase tracking-widest text-white/20 font-bold mb-2 px-2">History</div>
          {sessions.map((s) => (
            <button key={s.id} onClick={() => loadSession(s)} className={cn("w-full text-left p-3 rounded-xl text-sm transition-all flex items-center gap-3 group", currentSessionId === s.id ? "bg-theme-accent/20 text-theme-accent border border-theme-accent/20" : "hover:bg-white/5 text-white/60")}>
              <MessageSquare size={14} className="shrink-0" />
              <span className="truncate">{s.title}</span>
            </button>
          ))}
        </div>

        <div className="p-4 border-t border-white/5 space-y-2">
          {user ? (
            <div className="flex items-center justify-between p-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-theme-accent flex items-center justify-center text-xs font-bold">{user.username[0].toUpperCase()}</div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold truncate max-w-[100px]">{user.username}</span>
                  <span className="text-[10px] text-theme-accent font-bold uppercase tracking-tighter">{user.is_pro ? "Pro Member" : "Free Tier"}</span>
                </div>
              </div>
              <button onClick={() => setActiveModal('settings')} className="text-white/20 hover:text-white"><Settings size={16} /></button>
            </div>
          ) : (
            <button onClick={() => setActiveModal('auth')} className="w-full p-3 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-bold transition-colors">Login / Sign Up</button>
          )}
          <button onClick={() => setActiveModal('pro')} className="w-full p-3 bg-gradient-to-r from-theme-accent to-theme-accent/60 rounded-xl text-sm font-bold shadow-lg hover:brightness-110 transition-all flex items-center justify-center gap-2 glass-shimmer">
            <CreditCard size={16} /> Membership
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative z-10">
        {/* Usage Panel */}
        {user && user.is_pro === 0 && (
          <div className="bg-white/5 border-b border-white/5 px-6 py-2 flex items-center justify-center gap-8 text-[10px] font-bold uppercase tracking-widest text-white/40">
            <div className="flex items-center gap-2">
              <MessageSquare size={12} className="text-theme-accent" />
              <span>Messages: {250 - usage.message_count}/250</span>
              {msgTimer && <span className="text-theme-accent ml-2">Reset: {msgTimer}</span>}
            </div>
            <div className="flex items-center gap-2">
              <ImageIcon size={12} className="text-theme-accent" />
              <span>Images: {10 - usage.image_count}/10</span>
              {imgTimer && <span className="text-theme-accent ml-2">Reset: {imgTimer}</span>}
            </div>
          </div>
        )}

        {/* Header */}
        <header className="h-16 flex items-center justify-between px-6 border-b border-white/5 glass-panel">
          <div className="flex items-center gap-4">
            {!isSidebarOpen && (
              <button onClick={() => setIsSidebarOpen(true)} className="p-2 hover:bg-white/5 rounded-lg transition-colors"><Menu size={20} /></button>
            )}
            <div className="flex flex-col">
              <h2 className="text-sm font-bold tracking-tight">SkrimzAI Interface</h2>
              <div className="flex items-center gap-2">
                <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", serverStatus.status === "Operational" ? "bg-emerald-500" : "bg-red-500")} />
                <span className="text-[10px] text-white/40 uppercase tracking-widest font-bold">{serverStatus.status} • {serverStatus.latency}</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="relative">
              <button 
                onClick={() => setIsModeMenuOpen(!isModeMenuOpen)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 bg-white/5 rounded-xl text-xs font-bold hover:bg-white/10 transition-all border border-white/5",
                  isModeMenuOpen && "border-theme-accent bg-theme-accent/10"
                )}
              >
                {aiMode === 'regular' ? <Sparkles size={14} /> : aiMode === 'coding' ? <Code size={14} /> : <Search size={14} />}
                {aiMode === 'regular' ? 'Regular Mode' : aiMode === 'coding' ? 'Coding Mode' : 'UltraSearchAI'}
              </button>
              <AnimatePresence>
                {isModeMenuOpen && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute top-full right-0 mt-2 w-48 glass-panel rounded-2xl overflow-hidden shadow-2xl z-50 border-white/10"
                  >
                    <button onClick={() => { setAiMode('regular'); setIsModeMenuOpen(false); }} className={cn("w-full p-4 text-left text-xs font-bold hover:bg-white/5 flex items-center gap-3 transition-colors", aiMode === 'regular' && "text-theme-accent bg-white/5")}>
                      <Sparkles size={14} /> Regular Mode
                    </button>
                    <button onClick={() => { setAiMode('coding'); setIsModeMenuOpen(false); }} className={cn("w-full p-4 text-left text-xs font-bold hover:bg-white/5 flex items-center gap-3 transition-colors", aiMode === 'coding' && "text-theme-accent bg-white/5")}>
                      <Code size={14} /> Coding Mode
                    </button>
                    <button onClick={() => { if(user?.is_pro) { setAiMode('ultra'); setIsModeMenuOpen(false); } else { setActiveModal('pro'); setIsModeMenuOpen(false); } }} className={cn("w-full p-4 text-left text-xs font-bold hover:bg-white/5 flex items-center justify-between transition-colors", aiMode === 'ultra' && "text-theme-accent bg-white/5")}>
                      <div className="flex items-center gap-3"><Search size={14} /> UltraSearchAI</div>
                      {!user?.is_pro && <Zap size={12} className="text-theme-accent" />}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button onClick={() => setActiveModal('settings')} className="p-2 hover:bg-white/5 rounded-xl transition-all text-white/40 hover:text-white"><Settings size={20} /></button>
            <button onClick={() => setIsWidget(true)} className="p-2 hover:bg-white/5 rounded-xl transition-all text-white/40 hover:text-white"><Minimize2 size={20} /></button>
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar relative">
          <div className="max-w-4xl mx-auto space-y-8">
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={cn("flex gap-6", msg.role === "user" ? "flex-row-reverse" : "")}>
                  <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-lg border border-white/10", msg.role === "user" ? "bg-white/10" : "bg-theme-accent shadow-theme-accent/40")}>
                    {msg.role === "user" ? <User size={20} /> : <Bot size={20} />}
                  </div>
                  <div className={cn("flex flex-col gap-2 max-w-[80%]", msg.role === "user" ? "items-end" : "items-start")}>
                    <div className={cn(
                      "glass-card p-5 shadow-2xl transition-all duration-500", 
                      msg.role === "user" ? "bg-white/5 hover:bg-white/10" : "bg-white/5 border-theme-accent/20 hover:border-theme-accent/40 glow-border"
                    )}>
                      {msg.images?.map((img, i) => (
                        <img key={`${msg.id}-img-${i}`} src={img} className="max-w-full h-64 object-cover rounded-xl mb-4 border border-white/10" />
                      ))}
                      <div className="prose prose-invert prose-sm max-w-none leading-relaxed">
                        <Markdown>{msg.text}</Markdown>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {isLoading && (
              <div className="flex gap-6">
                <div className="w-10 h-10 rounded-2xl bg-theme-accent flex items-center justify-center shrink-0 animate-pulse">
                  <Loader2 size={20} className="animate-spin" />
                </div>
                <div className="glass-card p-5 bg-white/5 italic text-white/30 text-sm">SkrimzAI is analyzing...</div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className="p-6">
          <div className="max-w-4xl mx-auto relative">
            <AnimatePresence>
              {images.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute bottom-full left-0 right-0 mb-4 flex gap-3 p-4 glass-panel rounded-2xl">
                  {images.map((img, i) => (
                    <div key={i} className="relative group">
                      <img src={img} className="w-20 h-20 object-cover rounded-xl border border-white/20" />
                      <button onClick={() => setImages(prev => prev.filter((_, idx) => idx !== i))} className="absolute -top-2 -right-2 bg-theme-accent rounded-full p-1 shadow-lg"><X size={12} /></button>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="glass-panel p-3 rounded-3xl flex items-end gap-3 shadow-2xl border-white/10 relative overflow-hidden">
              <div className="absolute inset-0 glossy-overlay opacity-30 pointer-events-none" />
              <button onClick={() => fileInputRef.current?.click()} className="p-3 text-white/40 hover:text-theme-accent transition-colors"><ImageIcon size={24} /></button>
              <input type="file" ref={fileInputRef} onChange={handleImageUpload} multiple accept="image/*" className="hidden" />
              <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())} placeholder={`Message SkrimzAI (${aiMode})...`} className="flex-1 bg-transparent border-none focus:ring-0 text-white placeholder:text-white/20 py-3 resize-none max-h-40 min-h-[48px] custom-scrollbar" rows={1} />
              <button onClick={handleSend} disabled={isLoading || (!input.trim() && images.length === 0)} className="w-12 h-12 rounded-2xl bg-theme-accent flex items-center justify-center hover:scale-105 active:scale-95 transition-all disabled:opacity-50 shadow-lg shadow-theme-accent/20 glass-shimmer">
                {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
              </button>
            </div>
          </div>
        </div>
      </main>

      <AnimatePresence>
        {activeModal === 'auth' && renderAuthModal()}
        {activeModal === 'settings' && renderSettingsModal()}
        {activeModal === 'pro' && renderProModal()}
        {toast && (
          <motion.div 
            key="toast-notification"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={cn(
              "fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] px-6 py-3 rounded-2xl shadow-2xl border flex items-center gap-3 font-bold text-sm",
              toast.type === 'success' ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" : "bg-red-500/20 border-red-500/50 text-red-400"
            )}
          >
            {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
