import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
  Outlet
} from 'react-router-dom';
import {
  MessageSquare, BookOpen, Video, Home, User, Settings,
  Send, Plus, Trash2, LogOut, Search, Ghost, Hash,
  ChevronRight, Play, FileText, Link as LinkIcon, Lock,
  Smartphone, UserPlus, Check, CheckCheck, Clock, ArrowLeft
} from 'lucide-react';
import { supabase } from './supabaseClient';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useOutletContext } from 'react-router-dom';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const getYoutubeId = (url) => {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url?.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
};

// --- Components ---

const GlassCard = ({ children, className, ...props }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className={cn("glass-card", className)}
    {...props}
  >
    {children}
  </motion.div>
);

const Button = ({ children, variant = 'primary', className, ...props }) => {
  const variants = {
    primary: "glass-button-primary",
    secondary: "glass-button-secondary",
    danger: "bg-red-500/20 border-red-500/30 text-red-200 hover:bg-red-500/40",
  };
  return (
    <button className={cn("glass-button px-4 py-2 flex items-center justify-center gap-2", variants[variant], className)} {...props}>
      {children}
    </button>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [notices, setNotices] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchGlobalData = async () => {
    if (!supabase.supabaseUrl || supabase.supabaseUrl.includes('your-project')) {
      console.error("Supabase connection error: Check your .env file!");
      return;
    }

    const [subRes, roomRes, noticeRes] = await Promise.all([
      supabase.from('subjects').select('*'),
      supabase.from('rooms').select('*'),
      supabase.from('notices').select('*').order('created_at', { ascending: false })
    ]);

    if (subRes.data) setSubjects(subRes.data);
    if (noticeRes.data) setNotices(noticeRes.data);

    if (roomRes.data && roomRes.data.length > 0) {
      setRooms(roomRes.data);
    } else {
      const defaultRooms = [
        { name: 'General Campus', type: 'group' },
        { name: 'Anonymous Hall', type: 'anonymous' }
      ];
      const { data: createdRooms } = await supabase.from('rooms').insert(defaultRooms).select();
      if (createdRooms) setRooms(createdRooms);
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const storedUser = localStorage.getItem('cc_user');
        if (storedUser) {
          const parsed = JSON.parse(storedUser);
          if (parsed.id) {
            setUser(parsed);
            setIsAdmin(parsed.isAdmin || parsed.studentId === 'admin123' || parsed.phoneNumber === 'admin123');
            await fetchGlobalData();
          }
        }
      } catch (e) {
        console.error("Initialization error:", e);
        localStorage.removeItem('cc_user');
      } finally {
        setLoading(false);
      }
    };
    init();

    const updateStatus = async (status) => {
      const storedUser = localStorage.getItem('cc_user');
      if (storedUser) {
        const parsed = JSON.parse(storedUser);
        await supabase.from('profiles').update({ is_online: status }).eq('id', parsed.id);
      }
    };

    updateStatus(true);
    window.addEventListener('beforeunload', () => updateStatus(false));

    const channel = supabase.channel('portal-updates')
      .on('postgres_changes', { event: '*', table: 'subjects' }, payload => {
        if (payload.eventType === 'INSERT') setSubjects(prev => [...prev, payload.new]);
        if (payload.eventType === 'DELETE') setSubjects(prev => prev.filter(s => s.id !== payload.old.id));
      })
      .on('postgres_changes', { event: '*', table: 'rooms' }, payload => {
        if (payload.eventType === 'INSERT') setRooms(prev => {
          if (prev.find(r => r.id === payload.new.id)) return prev;
          return [...prev, payload.new];
        });
      })
      .on('postgres_changes', { event: '*', table: 'notices' }, payload => {
        if (payload.eventType === 'INSERT') setNotices(prev => [payload.new, ...prev]);
        if (payload.eventType === 'DELETE') setNotices(prev => prev.filter(n => n.id !== payload.old.id));
        if (payload.eventType === 'UPDATE') setNotices(prev => prev.map(n => n.id === payload.new.id ? payload.new : n));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleLogin = async (name, phoneNumber) => {
    const newUser = {
      name,
      phoneNumber,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`,
      isAdmin: phoneNumber === 'admin123'
    };

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('student_id', phoneNumber)
      .single();

    if (!profile) {
      const safeHex = Array.from(phoneNumber)
        .map(c => c.charCodeAt(0).toString(16))
        .join('')
        .slice(0, 12)
        .padEnd(12, '0');
      const pseudoId = `00000000-0000-0000-0000-${safeHex}`;

      await supabase.from('profiles').insert([
        { id: pseudoId, student_id: phoneNumber, full_name: name, role: phoneNumber === 'admin123' ? 'admin' : 'student' }
      ]);
      newUser.id = pseudoId;
    } else {
      newUser.id = profile.id;
    }

    setUser(newUser);
    setIsAdmin(phoneNumber === 'admin123');
    localStorage.setItem('cc_user', JSON.stringify(newUser));
    await fetchGlobalData();
  };

  const handleLogout = async () => {
    if (user) {
      await supabase.from('profiles').update({ is_online: false }).eq('id', user.id);
    }
    setUser(null);
    setIsAdmin(false);
    localStorage.removeItem('cc_user');
  };

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-[#050510]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <span className="text-blue-400 font-medium tracking-[0.2em] text-[10px] uppercase">Connecting Portal</span>
      </div>
    </div>
  );

  return (
    <Router>
      <Routes>
        {!user ? (
          <Route path="*" element={<LoginScreen onLogin={handleLogin} />} />
        ) : (
          <Route element={<MainLayout user={user} isAdmin={isAdmin} handleLogout={handleLogout} rooms={rooms} subjects={subjects} notices={notices} setNotices={setNotices} setSubjects={setSubjects} />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard user={user} isAdmin={isAdmin} notices={notices} setNotices={setNotices} />} />
            <Route path="/subjects" element={<SubjectPortal isAdmin={isAdmin} subjects={subjects} setSubjects={setSubjects} />} />
            <Route path="/chat" element={<ChatPortal user={user} rooms={rooms} isAdmin={isAdmin} />} />
            <Route path="/videos" element={<VideoPortal />} />
            {isAdmin && <Route path="/admin" element={<AdminPanel subjects={subjects} setSubjects={setSubjects} notices={notices} setNotices={setNotices} rooms={rooms} />} />}
          </Route>
        )}
      </Routes>
    </Router>
  );
}

function MainLayout({ user, isAdmin, handleLogout, rooms, subjects, notices, setNotices, setSubjects }) {
  const navigate = useNavigate();
  const location = useLocation();
  const currentTab = location.pathname.split('/')[1] || 'dashboard';

  return (
    <div className="flex h-screen overflow-hidden bg-[#050510] text-slate-200 font-sans selection:bg-blue-500/30">
      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full pointer-events-none" />

      {/* Sidebar - Desktop */}
      <nav className="hidden md:flex flex-col w-72 glass border-r border-white/5 p-6 gap-4 z-20">
        <div className="flex items-center gap-4 px-2 mb-10">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20 box-glow rotate-3 hover:rotate-0 transition-transform duration-500">
            <Smartphone className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white leading-tight">Campus<span className="text-blue-400">Connect</span></h1>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Portal Active</span>
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <NavButton active={currentTab === 'dashboard'} onClick={() => navigate('/dashboard')} icon={<Home size={20} />} label="Dashboard" />
          <NavButton active={currentTab === 'subjects'} onClick={() => navigate('/subjects')} icon={<BookOpen size={20} />} label="Study Hub" />
          <NavButton active={currentTab === 'chat'} onClick={() => navigate('/chat')} icon={<MessageSquare size={20} />} label="Pulse Chat" />
          <NavButton active={currentTab === 'videos'} onClick={() => navigate('/videos')} icon={<Video size={20} />} label="Streaming" />
        </div>

        {isAdmin && (
          <div className="mt-8 pt-8 border-t border-white/5 space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] px-4 mb-3 block opacity-50">Administration</span>
            <NavButton active={currentTab === 'admin'} onClick={() => navigate('/admin')} icon={<Settings size={20} />} label="Command Center" />
          </div>
        )}

        <div className="mt-auto pt-6 border-t border-white/5">
          <div className="flex items-center gap-4 p-3 rounded-2xl bg-white/5 border border-white/5 group hover:bg-white/10 transition-colors cursor-pointer">
            <img src={user.avatar} className="w-10 h-10 rounded-full border border-white/20 p-0.5 group-hover:border-blue-500/50 transition-colors" />
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold text-white truncate">{user.name}</span>
              <span className="text-[10px] text-slate-500 truncate">{user.phoneNumber}</span>
            </div>
          </div>
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl mt-4 text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-all font-medium text-sm">
            <LogOut size={18} />
            Log Out
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative overflow-hidden h-full z-10">
        <header className="md:hidden glass p-4 flex items-center justify-between border-b border-white/5 z-30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Smartphone size={20} className="text-white" />
            </div>
            <h1 className="text-lg font-bold tracking-tight">Campus<span className="text-blue-400">Connect</span></h1>
          </div>
          <button onClick={handleLogout} className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-red-400">
            <LogOut size={20} />
          </button>
        </header>

        <section className="flex-1 overflow-y-auto custom-scrollbar relative px-4 py-6 md:p-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="max-w-7xl mx-auto h-full"
            >
              <Outlet context={{ user, isAdmin, subjects, setSubjects, notices, setNotices, rooms }} />
            </motion.div>
          </AnimatePresence>
        </section>

        <footer className="md:hidden glass border-t border-white/10 p-4 pb-10 flex justify-around items-center z-30">
          <MobileNavButton active={currentTab === 'dashboard'} onClick={() => navigate('/dashboard')} icon={<Home />} />
          <MobileNavButton active={currentTab === 'subjects'} onClick={() => navigate('/subjects')} icon={<BookOpen />} />
          <MobileNavButton active={currentTab === 'chat'} onClick={() => navigate('/chat')} icon={<MessageSquare />} />
          {isAdmin && <MobileNavButton active={currentTab === 'admin'} onClick={() => navigate('/admin')} icon={<Settings />} />}
        </footer>
      </main>
    </div>
  );
}

// --- Screens & Major Views ---

function LoginScreen({ onLogin }) {
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [error, setError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!name || !phoneNumber) {
      setError('Please fill in all fields');
      return;
    }

    // Bypass for admin testing
    if (phoneNumber === 'admin123') {
      onLogin(name, phoneNumber);
      return;
    }

    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(phoneNumber)) {
      setError('Please enter a valid 10-digit number');
      return;
    }

    setIsAuthenticating(true);
    // Simulate a smooth auth transition
    setTimeout(() => {
      setSuccess(true);
      setTimeout(() => {
        onLogin(name, phoneNumber);
      }, 800);
    }, 1200);
  };

  return (
    <div className="h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-600/20 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-600/20 blur-[120px] rounded-full" />

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass p-8 rounded-3xl w-full max-w-md border border-white/10 relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 animate-glass-shine" />

        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-blue-500/20">
            <Smartphone size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Welcome Back!</h1>
          <p className="text-slate-400 text-sm">Sign in to access your campus portal</p>
        </div>

        <form onSubmit={handleSubmit} className="space-x-0 space-y-4">
          <motion.div animate={success ? { opacity: 0, y: -10 } : { opacity: 1, y: 0 }}>
            <div>
              <label className="text-xs font-medium text-slate-400 ml-1 mb-1 block">Full Name</label>
              <input
                className="glass-input w-full"
                placeholder="e.g. John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="mt-4">
              <label className="text-xs font-medium text-slate-400 ml-1 mb-1 block">Phone Number</label>
              <input
                className="glass-input w-full"
                placeholder="10-digit number"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                maxLength={10}
              />
              <p className="text-[10px] text-slate-500 mt-1 ml-1">Authenticated via 10-digit PIN</p>
            </div>

            {error && <p className="text-red-400 text-xs text-center mt-4">{error}</p>}

            <Button
              type="submit"
              disabled={isAuthenticating}
              className="w-full py-4 mt-6 text-sm font-semibold tracking-wide overflow-hidden relative"
            >
              {isAuthenticating ? (
                <motion.div initial={{ y: 20 }} animate={{ y: 0 }} className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  AUTHENTICATING...
                </motion.div>
              ) : "ENTER PORTAL"}
            </Button>
          </motion.div>

          <AnimatePresence>
            {success && (
              <motion.div
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute inset-0 flex flex-col items-center justify-center bg-blue-600/10 backdrop-blur-md z-10"
              >
                <motion.div
                  initial={{ rotate: -45, scale: 0 }}
                  animate={{ rotate: 0, scale: 1 }}
                  className="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center shadow-2xl shadow-blue-500/50"
                >
                  <Check size={40} className="text-white" />
                </motion.div>
                <motion.span
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="mt-4 font-bold text-white tracking-widest text-sm"
                >
                  ACCESS GRANTED
                </motion.span>
              </motion.div>
            )}
          </AnimatePresence>
        </form>

        <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-500">
          <span>Beta Version 1.0</span>
          <span>&copy; 2024 CampusConnect</span>
        </div>
      </motion.div>
    </div>
  );
}

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const staggerItem = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1
  }
};

function NoticeDetailModal({ notice, onClose }) {
  if (!notice) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
      />
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="w-full max-w-lg glass p-8 rounded-3xl border border-white/10 relative z-10 overflow-hidden"
      >
        <div className={cn("absolute top-0 left-0 w-full h-1.5",
          notice.color === 'red' ? "bg-red-500" :
            notice.color === 'blue' ? "bg-blue-500" : "bg-purple-500")}
        />
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-xl bg-opacity-20",
              notice.color === 'red' ? "bg-red-500 text-red-400" :
                notice.color === 'blue' ? "bg-blue-500 text-blue-400" : "bg-purple-500 text-purple-400"
            )}>
              <Smartphone size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">{notice.title}</h3>
              <p className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold mt-0.5">Campus Official Notice</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors text-slate-400"><Plus size={24} className="rotate-45" /></button>
        </div>

        <div className="space-y-4">
          <p className="text-slate-300 leading-relaxed text-sm whitespace-pre-wrap">{notice.content}</p>
          <div className="pt-6 border-t border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center text-[10px] font-bold text-blue-400 italic">CC</div>
              <span className="text-[10px] font-bold text-slate-500">ADMINISTRATION</span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">{new Date(notice.created_at).toLocaleString()}</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function Dashboard() {
  const { user, isAdmin, notices, setNotices } = useOutletContext();
  const navigate = useNavigate();
  const [selectedNotice, setSelectedNotice] = useState(null);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h2 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">Hello, {user.name.split(' ')[0]}! 👋</h2>
          <p className="text-slate-400 font-medium tracking-tight">Here's what's happening on your campus today.</p>
        </div>
        <div className="flex gap-3">
          <Button onClick={() => navigate('/chat')} variant="secondary" className="rounded-2xl border-white/10 px-6"><Plus size={18} /> New Message</Button>
          {isAdmin && <Button onClick={() => navigate('/admin')} variant="primary" className="rounded-2xl px-6 shadow-lg shadow-blue-500/20"><Settings size={18} /> Management</Button>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <GlassCard className="col-span-1 md:col-span-2 space-y-4 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold flex items-center gap-2"><Smartphone size={20} className="text-blue-400" /> Notice Board</h3>
          </div>
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="space-y-4"
          >
            {notices.length > 0 ? notices.map(notice => (
              <motion.div
                key={notice.id}
                variants={staggerItem}
                whileHover={{ x: 4 }}
                onClick={() => setSelectedNotice(notice)}
                className="group flex items-start gap-4 p-5 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all cursor-pointer relative overflow-hidden"
              >
                <div className={cn("w-1.5 h-12 rounded-full absolute left-0 top-1/2 -translate-y-1/2",
                  notice.color === 'red' ? "bg-red-500" :
                    notice.color === 'blue' ? "bg-blue-500" : "bg-purple-500")}
                />
                <div className="flex-1 min-w-0 ml-2">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h4 className="text-sm font-bold text-slate-100 group-hover:text-blue-400 transition-colors">{notice.title}</h4>
                    {isAdmin && (
                      <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => { e.stopPropagation(); navigate('/admin', { state: { editNotice: notice } }); }} className="p-2 text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"><Settings size={14} /></button>
                        <button onClick={async (e) => {
                          e.stopPropagation();
                          if (window.confirm('Delete notice?')) {
                            const { error } = await supabase.from('notices').delete().eq('id', notice.id);
                            if (!error) setNotices(prev => prev.filter(n => n.id !== notice.id));
                          }
                        }} className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"><Trash2 size={14} /></button>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">{notice.content}</p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className="text-[9px] font-bold text-slate-500 tracking-wider font-mono uppercase">
                    {new Date(notice.created_at).toLocaleDateString()}
                  </span>
                  <ChevronRight size={16} className="text-slate-600 group-hover:text-blue-500 transition-colors" />
                </div>
              </motion.div>
            )) : (
              <div className="text-center py-12 text-slate-500 italic bg-white/5 rounded-2xl border border-dashed border-white/10">No active notices</div>
            )}
          </motion.div>
        </GlassCard>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="space-y-6"
        >
          <GlassCard variants={staggerItem} className="space-y-6 p-6">
            <h3 className="text-lg font-bold flex items-center gap-2 text-white/90"><Plus size={20} className="text-purple-400" /> Pulse Actions</h3>
            <div className="space-y-3">
              <ActionButton label="Anonymous Wall" icon={<Ghost size={16} />} onClick={() => navigate('/chat')} />
              <ActionButton label="Resources" icon={<BookOpen size={16} />} onClick={() => navigate('/subjects')} />
              <ActionButton label="Live Streams" icon={<Video size={16} />} onClick={() => navigate('/videos')} />
            </div>
          </GlassCard>

          <motion.div
            variants={staggerItem}
            className="md:hidden glass p-5 rounded-2xl border border-white/5 flex items-center justify-between shadow-xl"
          >
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[11px] font-bold tracking-widest text-slate-400 uppercase">SERVER CONNECTED</span>
            </div>
            <div className="text-[10px] font-mono text-slate-500">PORTAL: ACTIVE</div>
          </motion.div>
        </motion.div>
      </div>

      <AnimatePresence>
        {selectedNotice && (
          <NoticeDetailModal notice={selectedNotice} onClose={() => setSelectedNotice(null)} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
const ActionButton = ({ label, icon, onClick }) => (
  <button onClick={onClick} className="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all group">
    <div className="flex items-center gap-3">
      <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20 transition-colors">
        {icon}
      </div>
      <span className="text-sm font-medium">{label}</span>
    </div>
    <ChevronRight size={16} className="text-slate-600 group-hover:text-slate-400" />
  </button>
);

const QuickLinkCard = ({ icon, title, desc, color, onClick }) => (
  <GlassCard onClick={onClick} className={cn("p-4 cursor-pointer hover:scale-[1.02] transition-transform", color)}>
    <div className="flex items-center gap-4">
      <div className="p-3 rounded-2xl bg-white/10">
        {icon}
      </div>
      <div>
        <h4 className="font-semibold text-white">{title}</h4>
        <p className="text-[10px] text-slate-400">{desc}</p>
      </div>
    </div>
  </GlassCard>
);

const ChatMessage = ({ message, isMe, showRealNames, isAdmin }) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: isMe ? 20 : -20 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn("flex flex-col gap-1 w-full group", isMe ? "items-end" : "items-start")}
    >
      <div className="flex items-center gap-2 px-1">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          {message.is_anonymous && !isAdmin && !showRealNames ? "Ghost User" : message.profiles?.full_name || "Unknown"}
        </span>
        <span className="text-[9px] text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
          {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <div className={cn(
        "max-w-[85%] px-4 py-2.5 rounded-2xl text-sm shadow-xl relative",
        isMe
          ? "bg-blue-600 text-white rounded-tr-none"
          : "bg-white/10 text-white border border-white/5 rounded-tl-none backdrop-blur-md"
      )}>
        <p className="leading-relaxed">{message.content}</p>
        {isMe && (
          <div className="absolute -bottom-1 -right-4 flex items-center opacity-0 group-hover:opacity-100 transition-all">
            {message.is_read ? (
              <CheckCheck size={12} className="text-blue-400" />
            ) : (
              <Check size={12} className="text-slate-500" />
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};

function ChatPortal() {
  const { user, rooms, isAdmin } = useOutletContext();
  const [activeRoom, setActiveRoom] = useState(rooms[0]);
  const [inputText, setInputText] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [showRealNames, setShowRealNames] = useState(false);
  const [searchUser, setSearchUser] = useState('');
  const [availableProfiles, setAvailableProfiles] = useState([]);
  const [allProfiles, setAllProfiles] = useState([]);
  const [sidebarTab, setSidebarTab] = useState('rooms'); // 'rooms' or 'directory'
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const scrollRef = useRef();

  useEffect(() => {
    if (!activeRoom && rooms.length > 0) setActiveRoom(rooms[0]);
  }, [rooms, activeRoom]);

  // Fetch all profiles and messages
  useEffect(() => {
    const fetchInitial = async () => {
      const { data: profs } = await supabase.from('profiles').select('*');
      if (profs) setAllProfiles(profs);

      if (activeRoom) {
        const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
        const { data: msgs } = await supabase
          .from('messages')
          .select('*, profiles(full_name, student_id)')
          .eq('room_id', activeRoom.id)
          .gt('created_at', twoDaysAgo)
          .order('created_at', { ascending: true });
        if (msgs) setChatMessages(msgs);
      }
    };
    fetchInitial();

    // Profile status subscription
    const profChannel = supabase.channel('profile-status')
      .on('postgres_changes', { event: '*', table: 'profiles' }, payload => {
        if (payload.eventType === 'UPDATE') {
          setAllProfiles(prev => prev.map(p => p.id === payload.new.id ? payload.new : p));
        } else if (payload.eventType === 'INSERT') {
          setAllProfiles(prev => [...prev, payload.new]);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(profChannel);
    };
  }, [activeRoom]);

  // Message subscription
  useEffect(() => {
    if (!activeRoom) return;

    const msgSubscription = supabase
      .channel(`room:${activeRoom.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        table: 'messages',
        filter: `room_id=eq.${activeRoom.id}`
      }, async (payload) => {
        const { data: profile } = await supabase.from('profiles').select('full_name, student_id').eq('id', payload.new.sender_id).single();
        const newMsg = { ...payload.new, profiles: profile };
        setChatMessages(prev => [...prev, newMsg]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(msgSubscription);
    };
  }, [activeRoom]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [chatMessages]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || !activeRoom) return;
    const content = inputText;
    setInputText('');
    const { error } = await supabase.from('messages').insert([
      { room_id: activeRoom.id, sender_id: user.id, content: content, is_anonymous: activeRoom.type === 'anonymous' }
    ]);
    if (error) setInputText(content);
  };

  const startDM = async (targetProfile) => {
    const roomName = [user.id, targetProfile.id].sort().join(':');
    const { data: existing } = await supabase.from('rooms').select('*').eq('name', roomName).single();
    if (existing) {
      setActiveRoom(existing);
    } else {
      const { data: newRoom } = await supabase.from('rooms').insert([{ name: roomName, type: 'dm' }]).select().single();
      if (newRoom) setActiveRoom(newRoom);
    }
    setSearchUser('');
    setSidebarTab('rooms');
  };

  useEffect(() => {
    if (searchUser.length > 2) {
      supabase.from('profiles').select('*').ilike('full_name', `%${searchUser}%`).limit(5)
        .then(({ data }) => setAllProfiles(data || []));
    } else {
      setAllProfiles([]);
    }
  }, [searchUser]);

  return (
    <div className="flex h-full gap-4 overflow-hidden relative">
      {/* Room Selection Sidebar */}
      <div className={cn(
        "w-full md:w-80 flex flex-col gap-4 transition-all duration-300",
        mobileShowChat ? "hidden md:flex" : "flex"
      )}>
        <GlassCard className="p-2 flex gap-1 bg-white/5 rounded-2xl shrink-0">
          <button onClick={() => setSidebarTab('rooms')} className={cn("flex-1 py-2 px-4 rounded-xl text-xs font-bold transition-all", sidebarTab === 'rooms' ? "bg-blue-600 text-white shadow-lg" : "text-slate-400 hover:text-white")}>
            CHANNELS
          </button>
          <button onClick={() => setSidebarTab('directory')} className={cn("flex-1 py-2 px-4 rounded-xl text-xs font-bold transition-all", sidebarTab === 'directory' ? "bg-blue-600 text-white shadow-lg" : "text-slate-400 hover:text-white")}>
            STUDENTS
          </button>
        </GlassCard>

        {sidebarTab === 'rooms' ? (
          <div className="flex-1 flex flex-col gap-4 overflow-hidden">
            <GlassCard className="p-4 flex flex-col gap-2 shrink-0">
              <div className="relative flex items-center gap-2">
                <Search size={18} className="text-slate-500" />
                <input placeholder="Search users/rooms..." className="bg-transparent border-none focus:outline-none text-sm w-full" value={searchUser} onChange={(e) => setSearchUser(e.target.value)} />
              </div>
              {availableProfiles.length > 0 && (
                <div className="absolute top-16 left-0 w-full glass bg-slate-900/90 border border-white/10 rounded-xl overflow-hidden z-50 shadow-2xl">
                  {availableProfiles.map(p => (
                    <button key={p.id} onClick={() => startDM(p)} className="w-full p-3 text-left hover:bg-white/10 flex items-center gap-3 transition-colors border-b border-white/5 last:border-0">
                      <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-[10px] font-bold">{p.full_name[0]}</div>
                      <div><div className="text-xs font-medium text-white">{p.full_name}</div><div className="text-[10px] text-slate-500">{p.student_id}</div></div>
                    </button>
                  ))}
                </div>
              )}
            </GlassCard>

            <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-2">
              {rooms.map(room => {
                const hasUnread = chatMessages.some(m => m.room_id === room.id && !m.is_read && m.sender_id !== user.id);
                return (
                  <div key={room.id}
                    onClick={() => {
                      setActiveRoom(room);
                      setMobileShowChat(true);
                    }}
                    className={cn("p-4 rounded-2xl flex items-center gap-4 cursor-pointer transition-all border relative group", activeRoom?.id === room.id ? "bg-blue-600/20 border-blue-500/30" : "bg-white/5 border-transparent hover:bg-white/10")}>
                    <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shrink-0", room.type === 'anonymous' ? "bg-purple-600/20 text-purple-400" : "bg-blue-600/20 text-blue-400")}>
                      {room.type === 'anonymous' ? <Ghost size={24} /> : room.type === 'dm' ? <User size={24} /> : <Hash size={24} />}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <h4 className="font-medium text-sm truncate">{room.name.includes(':') ? room.name.split(':').filter(id => id !== user.id).map(id => allProfiles.find(p => p.id === id)?.full_name || 'Chat').join(', ') : room.name}</h4>
                      <p className="text-xs text-slate-500 truncate">{hasUnread ? "New messages" : "Tap to open"}</p>
                    </div>
                    {hasUnread && (
                      <div className="w-2.5 h-2.5 bg-green-500 rounded-full shadow-[0_0_10px_rgba(34,197,94,0.6)] animate-pulse" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-2">
            {allProfiles.filter(p => p.id !== user.id).map(profile => (
              <div key={profile.id} onClick={() => startDM(profile)} className="p-3 rounded-2xl flex items-center gap-4 bg-white/5 border border-transparent hover:bg-white/10 cursor-pointer transition-all">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center font-bold text-blue-400">
                    {profile.full_name[0]}
                  </div>
                  <div className={cn("absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#050510]", profile.is_online ? "bg-green-500" : "bg-slate-600")} />
                </div>
                <div className="flex-1 overflow-hidden">
                  <h4 className="text-sm font-medium text-white truncate">{profile.full_name}</h4>
                  <p className="text-[10px] text-slate-500 truncate">{profile.is_online ? "Active Now" : "Offline"}</p>
                </div>
                <UserPlus size={16} className="text-slate-600" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Chat Window */}
      <GlassCard className={cn(
        "flex-1 flex flex-col p-0 relative overflow-hidden transition-all duration-300",
        mobileShowChat ? "translate-x-0" : "translate-x-full md:translate-x-0 hidden md:flex"
      )}>
        <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/5">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileShowChat(false)}
              className="md:hidden p-2 -ml-2 text-slate-400 hover:text-white"
            >
              <ArrowLeft size={20} />
            </button>
            <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", activeRoom?.type === 'anonymous' ? "bg-purple-600/20" : "bg-blue-600/20")}>
              {activeRoom?.type === 'anonymous' ? <Ghost size={20} className="text-purple-400" /> : <Hash size={20} className="text-blue-400" />}
            </div>
            <div>
              <h4 className="font-bold text-sm">
                {activeRoom?.type === 'dm'
                  ? activeRoom.name.split(':').filter(id => id !== user.id).map(id => allProfiles.find(p => p.id === id)?.full_name || 'Student').join(', ')
                  : activeRoom?.name}
              </h4>
              <span className="text-[10px] text-green-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" /> Live Room
              </span>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            {isAdmin && activeRoom?.type === 'anonymous' && (
              <Button
                onClick={() => setShowRealNames(!showRealNames)}
                variant="secondary"
                className="text-[10px] py-1 px-3"
              >
                {showRealNames ? "Hide Real Names" : "Reveal Names"}
              </Button>
            )}
            <div className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center cursor-pointer transition-colors"><Search size={16} /></div>
            <div className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center cursor-pointer transition-colors"><Settings size={16} /></div>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {(!activeRoom || chatMessages.length === 0) && (
            <div className="h-full flex items-center justify-center text-slate-500 text-sm italic">
              {!activeRoom ? "Select a room to start chatting" : "No messages yet."}
            </div>
          )}
          {activeRoom && chatMessages.map(msg => (
            <ChatMessage
              key={msg.id}
              message={msg}
              isMe={msg.sender_id === user.id}
              showRealNames={showRealNames}
              isAdmin={isAdmin}
            />
          ))}
        </div>

        <form onSubmit={sendMessage} className="p-4 bg-white/5 border-t border-white/5 flex gap-3">
          <input
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={activeRoom?.type === 'anonymous' ? "Chat anonymously..." : "Type your message..."}
            className="flex-1 glass-input py-3"
          />
          <button type="submit" className="w-12 h-12 bg-blue-600 hover:bg-blue-500 text-white rounded-xl flex items-center justify-center transition-colors shadow-lg shadow-blue-500/20">
            <Send size={20} />
          </button>
        </form>
      </GlassCard>
    </div>
  );
}

function SubjectPortal() {
  const { isAdmin, subjects } = useOutletContext();
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [loading, setLoading] = useState(false);

  if (selectedSubject) return <SubjectDetail subject={selectedSubject} onBack={() => setSelectedSubject(null)} />;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Your Subjects</h2>
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className="glass-input pl-10 w-64" placeholder="Filter subjects..." />
        </div>
      </div>

      {loading ? (
        <p className="text-slate-400 italic">Finding your subjects...</p>
      ) : subjects.length === 0 ? (
        <p className="text-slate-400 italic">No subjects added yet. Contact administration.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {subjects.map(sub => (
            <GlassCard
              key={sub.id}
              onClick={() => setSelectedSubject(sub)}
              className="group cursor-pointer hover:translate-y-[-5px]"
            >
              <div className="text-4xl mb-4 group-hover:scale-110 transition-transform">📚</div>
              <h3 className="text-lg font-bold mb-1">{sub.name}</h3>
              <p className="text-xs text-slate-400">{sub.description || 'Access course materials and resources.'}</p>
              {isAdmin && (
                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={(e) => { e.stopPropagation(); navigate('/admin', { state: { editSubject: sub } }); }} className="p-2 bg-blue-500/10 text-blue-400 rounded-lg"><Settings size={14} /></button>
                  <button onClick={async (e) => {
                    e.stopPropagation();
                    if (window.confirm('Delete subject?')) {
                      await supabase.from('subjects').delete().eq('id', sub.id);
                    }
                  }} className="p-2 bg-red-500/10 text-red-400 rounded-lg"><Trash2 size={14} /></button>
                </div>
              )}
              <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold tracking-widest text-blue-400">View Materials</span>
                <ChevronRight size={16} className="text-blue-400 group-hover:translate-x-1 transition-transform" />
              </div>
            </GlassCard>
          ))}
        </div>
      )
      }
    </motion.div >
  );
}

function SubjectDetail({ subject, onBack }) {
  const { isAdmin } = useOutletContext();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('video');
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [playingVideo, setPlayingVideo] = useState(null);

  useEffect(() => {
    const fetchMaterials = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('materials')
        .select('*')
        .eq('subject_id', subject.id)
        .eq('type', activeTab);
      if (data) setMaterials(data);
      setLoading(false);
    };
    fetchMaterials();

    const matSub = supabase.channel(`subj:${subject.id}:${activeTab}`)
      .on('postgres_changes', { event: '*', table: 'materials', filter: `subject_id=eq.${subject.id}` }, fetchMaterials)
      .subscribe();

    return () => {
      supabase.removeChannel(matSub);
    };
  }, [subject.id, activeTab]);

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
      <button onClick={onBack} className="text-slate-400 hover:text-white flex items-center gap-2 text-sm transition-colors">
        <Trash2 size={16} className="rotate-45" /> Back to Subjects
      </button>

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold">{subject.name}</h2>
          <p className="text-slate-400 text-sm mt-1">{subject.description}</p>
        </div>
        <div className="p-1 glass flex rounded-xl w-fit">
          <TabItem active={activeTab === 'video'} onClick={() => setActiveTab('video')} icon={<Video size={16} />} label="Videos" />
          <TabItem active={activeTab === 'note'} onClick={() => setActiveTab('note')} icon={<FileText size={16} />} label="Notes" />
          <TabItem active={activeTab === 'link'} onClick={() => setActiveTab('link')} icon={<LinkIcon size={16} />} label="Other" />
        </div>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {materials.length === 0 && (
            <div className="col-span-full py-12 text-center text-slate-500 italic">
              No {activeTab}s uploaded yet for this subject.
            </div>
          )}
          {materials.map(item => (
            <GlassCard key={item.id} className="p-4 hover:bg-white/10 transition-colors group relative">
              <div className="flex items-start justify-between mb-4">
                <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400">
                  {item.type === 'video' ? <Video size={20} /> : item.type === 'note' ? <FileText size={20} /> : <LinkIcon size={20} />}
                </div>
                {item.type === 'video' && getYoutubeId(item.content) && (
                  <div className="absolute inset-0 z-0 opacity-10 pointer-events-none">
                    <img src={`https://img.youtube.com/vi/${getYoutubeId(item.content)}/0.jpg`} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="flex gap-2">
                  {item.type === 'video' ? (
                    <button
                      onClick={() => setPlayingVideo(item)}
                      className="w-8 h-8 rounded-full border border-white/5 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all z-10"
                    >
                      <Play size={14} fill="currentColor" />
                    </button>
                  ) : (
                    <a href={item.content} target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-full border border-white/5 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all">
                      <Send size={14} />
                    </a>
                  )}
                  {isAdmin && (
                    <div className="flex gap-1">
                      <button onClick={() => navigate('/admin', { state: { editMaterial: item } })} className="w-8 h-8 rounded-full border border-white/5 flex items-center justify-center hover:bg-blue-600/20 text-blue-400 transition-all">
                        <Settings size={14} />
                      </button>
                      <button
                        onClick={async () => {
                          if (window.confirm('Delete this material?')) {
                            await supabase.from('materials').delete().eq('id', item.id);
                          }
                        }}
                        className="w-8 h-8 rounded-full border border-white/5 flex items-center justify-center hover:bg-red-500/20 text-red-400 transition-all">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <h4 className="font-medium text-sm mb-1">{item.title}</h4>
              <span className="text-[10px] text-slate-500 uppercase tracking-tighter truncate block">
                {item.content}
              </span>
            </GlassCard>
          ))}
        </div>
      )}

      <AnimatePresence>
        {playingVideo && (
          <VideoPlayerModal video={playingVideo} onClose={() => setPlayingVideo(null)} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function VideoPlayerModal({ video, onClose }) {
  if (!video) return null;
  const ytId = getYoutubeId(video.content);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/90 backdrop-blur-sm"
      />
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="w-full max-w-5xl aspect-video bg-black rounded-3xl overflow-hidden shadow-2xl relative z-10 border border-white/10"
      >
        {ytId ? (
          <iframe
            src={`https://www.youtube.com/embed/${ytId}?autoplay=1`}
            className="w-full h-full"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <video src={video.content} controls autoPlay className="w-full h-full" />
        )}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-white/10 transition-colors z-20"
        >
          <Plus size={24} className="rotate-45" />
        </button>
      </motion.div>
    </div>
  );
}

function VideoPortal() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [playingVideo, setPlayingVideo] = useState(null);

  useEffect(() => {
    const fetchVideos = async () => {
      const { data } = await supabase
        .from('materials')
        .select('*, subjects(name)')
        .eq('type', 'video');
      if (data) setVideos(data);
      setLoading(false);
    };
    fetchVideos();

    const matChannel = supabase.channel('video-updates')
      .on('postgres_changes', { event: '*', table: 'materials' }, fetchVideos)
      .subscribe();

    return () => {
      supabase.removeChannel(matChannel);
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Educational Video Library</h2>
        <div className="hidden md:flex p-1 glass rounded-xl">
          <button className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 rounded-lg shadow-lg">PLAYLIST VIEW</button>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-400 italic">Loading video library...</p>
      ) : videos.length === 0 ? (
        <p className="text-slate-500 italic">No videos have been uploaded yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {videos.map(vid => {
            const ytId = getYoutubeId(vid.content);
            const thumb = ytId ? `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg` : `https://images.unsplash.com/photo-1509228468518-180dd4864904?q=80&w=2070&auto=format&fit=crop`;

            return (
              <GlassCard key={vid.id} className="p-0 overflow-hidden bg-black/40 border-white/5 group h-full flex flex-col">
                <div
                  className="aspect-video relative cursor-pointer overflow-hidden"
                  onClick={() => setPlayingVideo(vid)}
                >
                  <img
                    src={thumb}
                    className="w-full h-full object-cover opacity-80 group-hover:scale-110 group-hover:opacity-100 transition-all duration-700"
                    onError={(e) => {
                      if (ytId) e.target.src = `https://img.youtube.com/vi/${ytId}/0.jpg`;
                    }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-transparent transition-colors">
                    <div className="w-16 h-16 rounded-full bg-blue-600/90 flex items-center justify-center shadow-2xl shadow-blue-500/50 group-hover:scale-110 group-hover:bg-blue-600 transition-all">
                      <Play size={24} fill="white" className="text-white ml-1" />
                    </div>
                  </div>
                  {ytId && (
                    <div className="absolute bottom-3 right-3 px-2 py-1 bg-black/80 rounded px-1.5 py-0.5 text-[10px] font-bold text-white border border-white/10 uppercase tracking-widest">
                      YouTube
                    </div>
                  )}
                </div>
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <h4 className="font-bold text-slate-100 line-clamp-2 leading-snug group-hover:text-blue-400 transition-colors">{vid.title}</h4>
                    <p className="text-[10px] text-slate-500 mt-2 uppercase font-bold tracking-widest flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> {vid.subjects?.name}
                    </p>
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {playingVideo && (
          <VideoPlayerModal video={playingVideo} onClose={() => setPlayingVideo(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function AdminPanel() {
  const { subjects, setSubjects, notices, setNotices, rooms } = useOutletContext();
  const location = useLocation();
  const [newSubName, setNewSubName] = useState('');
  const [newSubDesc, setNewSubDesc] = useState('');

  // Material Form State
  const [mSubId, setMSubId] = useState('');
  const [mType, setMType] = useState('video');
  const [mTitle, setMTitle] = useState('');
  const [mContent, setMContent] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Notice Form State
  const [nTitle, setNTitle] = useState('');
  const [nContent, setNContent] = useState('');
  const [nColor, setNColor] = useState('blue');
  const [editingNotice, setEditingNotice] = useState(null);
  const [editingSubject, setEditingSubject] = useState(null);
  const [editingMaterial, setEditingMaterial] = useState(null);

  const [allStudents, setAllStudents] = useState([]);
  const [activeAdminTab, setActiveAdminTab] = useState('overview');
  const [msg, setMsg] = useState({ text: '', error: false });

  useEffect(() => {
    if (location.state?.editSubject) {
      const s = location.state.editSubject;
      setActiveAdminTab('overview');
      setEditingSubject(s);
      setNewSubName(s.name);
      setNewSubDesc(s.description || '');
    }
    if (location.state?.editMaterial) {
      const m = location.state.editMaterial;
      setActiveAdminTab('overview');
      setEditingMaterial(m);
      setMSubId(m.subject_id);
      setMType(m.type);
      setMTitle(m.title);
      setMContent(m.type === 'note' ? '' : m.content);
    }
    if (location.state?.editNotice) {
      const n = location.state.editNotice;
      setActiveAdminTab('overview');
      setEditingNotice(n);
      setNTitle(n.title);
      setNContent(n.content);
      setNColor(n.color || 'blue');
    }
  }, [location.state]);

  useEffect(() => {
    const fetchStudents = async () => {
      const { data } = await supabase.from('profiles').select('*').order('full_name');
      if (data) setAllStudents(data);
    };
    fetchStudents();
  }, []);

  const saveSubject = async (e) => {
    e.preventDefault();
    if (!newSubName) return;
    if (editingSubject) {
      const { error } = await supabase.from('subjects').update({ name: newSubName, description: newSubDesc }).eq('id', editingSubject.id);
      if (error) setMsg({ text: error.message, error: true });
      else {
        setSubjects(prev => prev.map(s => s.id === editingSubject.id ? { ...s, name: newSubName, description: newSubDesc } : s));
        setEditingSubject(null); setNewSubName(''); setNewSubDesc('');
        setMsg({ text: 'Subject updated!', error: false });
      }
    } else {
      const { data, error } = await supabase.from('subjects').insert([{ name: newSubName, description: newSubDesc }]).select();
      if (error) setMsg({ text: error.message, error: true });
      else {
        setSubjects([...subjects, data[0]]);
        setNewSubName(''); setNewSubDesc('');
        setMsg({ text: 'Subject created successfully!', error: false });
      }
    }
  };

  const deleteRoom = async (id) => {
    if (!window.confirm('Delete this room? All messages will be lost.')) return;
    const { error } = await supabase.from('rooms').delete().eq('id', id);
    if (error) setMsg({ text: error.message, error: true });
    else setMsg({ text: 'Room deleted.', error: false });
  };

  const deleteSubject = async (id) => {
    if (!window.confirm('Are you sure? This will delete all materials and messages for this subject.')) return;
    const { error } = await supabase.from('subjects').delete().eq('id', id);
    if (error) setMsg({ text: error.message, error: true });
    else {
      setSubjects(prev => prev.filter(s => s.id !== id));
      setMsg({ text: 'Subject deleted.', error: false });
    }
  };

  const saveMaterial = async (e) => {
    e.preventDefault();
    if (!mSubId || !mTitle) { setMsg({ text: 'Fill title and select subject', error: true }); return; }
    let finalContent = mContent;
    if (mType === 'note' && selectedFile) {
      setUploading(true);
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${mSubId}/${fileName}`;
      const { error: uploadError } = await supabase.storage.from('materials').upload(filePath, selectedFile);
      if (uploadError) { setMsg({ text: 'Upload failed', error: true }); setUploading(false); return; }
      const { data: { publicUrl } } = supabase.storage.from('materials').getPublicUrl(filePath);
      finalContent = publicUrl;
    }

    if (editingMaterial) {
      const { error } = await supabase.from('materials').update({ subject_id: mSubId, type: mType, title: mTitle, content: finalContent }).eq('id', editingMaterial.id);
      setUploading(false);
      if (error) setMsg({ text: error.message, error: true });
      else {
        setEditingMaterial(null); setMTitle(''); setMContent(''); setSelectedFile(null);
        setMsg({ text: 'Material updated!', error: false });
      }
    } else {
      const { error } = await supabase.from('materials').insert([{ subject_id: mSubId, type: mType, title: mTitle, content: finalContent }]);
      setUploading(false);
      if (error) setMsg({ text: error.message, error: true });
      else { setMTitle(''); setMContent(''); setSelectedFile(null); setMsg({ text: 'Material uploaded!', error: false }); }
    }
  };

  const saveNotice = async (e) => {
    e.preventDefault();
    if (!nTitle) return;
    if (editingNotice) {
      const { error } = await supabase.from('notices').update({ title: nTitle, content: nContent, color: nColor }).eq('id', editingNotice.id);
      if (error) setMsg({ text: error.message, error: true });
      else { setEditingNotice(null); setNTitle(''); setNContent(''); setMsg({ text: 'Notice updated!', error: false }); }
    } else {
      const { error } = await supabase.from('notices').insert([{ title: nTitle, content: nContent, color: nColor }]);
      if (error) setMsg({ text: error.message, error: true });
      else { setNTitle(''); setNContent(''); setMsg({ text: 'Notice posted!', error: false }); }
    }
  };

  const deleteNotice = async (id) => {
    const { error } = await supabase.from('notices').delete().eq('id', id);
    if (error) setMsg({ text: error.message, error: true });
    else setMsg({ text: 'Notice deleted.', error: false });
  };

  const purgeChats = async (days) => {
    if (!window.confirm(`Purge chats older than ${days} days?`)) return;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from('messages').delete().lt('created_at', cutoff);
    if (error) setMsg({ text: error.message, error: true });
    else setMsg({ text: 'Purge successful!', error: false });
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 md:w-20 md:h-20 rounded-3xl bg-blue-600 flex items-center justify-center text-white shadow-2xl shadow-blue-500/30 rotate-3 shrink-0">
            <Lock size={30} />
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">System Control</h2>
            <p className="text-slate-400 font-medium text-sm">Global campus management.</p>
          </div>
        </div>
        <div className="p-1 glass flex rounded-2xl bg-white/5 border border-white/10 shrink-0 self-start md:self-center overflow-x-auto max-w-full">
          {['overview', 'users', 'maint'].map(t => (
            <button key={t} onClick={() => setActiveAdminTab(t)} className={cn("px-4 md:px-6 py-2 rounded-xl text-[10px] font-bold transition-all uppercase tracking-widest", activeAdminTab === t ? "bg-blue-600 text-white shadow-lg" : "text-slate-400 hover:text-white")}>{t}</button>
          ))}
        </div>
      </div>

      {msg.text && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className={cn("p-4 rounded-2xl text-sm font-bold text-center border", msg.error ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-green-500/10 border-green-500/20 text-green-400")}>
          {msg.text}
        </motion.div>
      )}

      {activeAdminTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <GlassCard className="space-y-4">
              <h3 className="text-lg font-bold flex items-center gap-2 text-blue-400"><Plus size={20} /> {editingSubject ? 'Edit Subject' : 'Manage Subjects'}</h3>
              <form onSubmit={saveSubject} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input placeholder="Subject Name" className="glass-input" value={newSubName} onChange={(e) => setNewSubName(e.target.value)} />
                <input placeholder="Description" className="glass-input" value={newSubDesc} onChange={(e) => setNewSubDesc(e.target.value)} />
                <Button type="submit" className="md:col-span-2 py-3">{editingSubject ? 'Update Subject' : 'Create Subject'}</Button>
              </form>
              <div className="mt-6 space-y-2">
                {subjects.map(s => (
                  <div key={s.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                    <span className="text-sm font-medium">{s.name}</span>
                    <div className="flex gap-2">
                      <button onClick={() => { setEditingSubject(s); setNewSubName(s.name); setNewSubDesc(s.description || ''); }} className="p-2 text-blue-400 hover:bg-blue-500/20 rounded-lg transition-colors"><Settings size={16} /></button>
                      <button onClick={() => deleteSubject(s.id)} className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"><Trash2 size={16} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>

            <GlassCard className="space-y-4">
              <h3 className="text-lg font-bold flex items-center gap-2 text-pink-400"><Video size={20} /> {editingMaterial ? 'Edit Material' : 'Upload Materials'}</h3>
              <form onSubmit={saveMaterial} className="space-y-4">
                <select className="glass-input w-full bg-[#1a1a2e]" value={mSubId} onChange={(e) => setMSubId(e.target.value)}>
                  <option value="">Select Subject</option>
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <div className="flex flex-wrap gap-2">
                  {['video', 'note', 'link'].map(type => (
                    <button key={type} type="button" onClick={() => setMType(type)} className={cn("flex-1 px-4 py-2 rounded-xl border text-xs font-bold transition-all capitalize", mType === type ? "bg-blue-600/20 border-blue-500/50 text-white" : "bg-white/5 border-transparent text-slate-400")}>{type}</button>
                  ))}
                </div>
                <input placeholder="Material Title" className="glass-input w-full" value={mTitle} onChange={(e) => setMTitle(e.target.value)} />
                {mType === 'note' ? (
                  <input type="file" onChange={(e) => setSelectedFile(e.target.files[0])} className="glass-input w-full text-xs" />
                ) : (
                  <input placeholder="URL / Link" className="glass-input w-full" value={mContent} onChange={(e) => setMContent(e.target.value)} />
                )}
                <Button type="submit" disabled={uploading} className="w-full py-3">{uploading ? "Uploading..." : "Publish"}</Button>
              </form>
            </GlassCard>
          </div>

          <div className="space-y-8">
            <GlassCard className="space-y-4 border-purple-500/20">
              <h3 className="text-lg font-bold flex items-center gap-2 text-purple-400"><Hash size={20} /> {editingNotice ? 'Edit Notice' : 'Post Notice'}</h3>
              <form onSubmit={saveNotice} className="space-y-4">
                <input placeholder="Title" className="glass-input w-full" value={nTitle} onChange={(e) => setNTitle(e.target.value)} />
                <textarea placeholder="Content..." className="glass-input w-full h-32" value={nContent} onChange={(e) => setNContent(e.target.value)} />
                <div className="flex gap-2">
                  {['blue', 'red'].map(c => (
                    <button key={c} type="button" onClick={() => setNColor(c)} className={cn("flex-1 p-2 rounded-xl border flex items-center justify-center gap-2 text-xs", nColor === c ? "bg-blue-600/10 border-blue-400" : "border-white/5")}>
                      <div className={cn("w-2 h-2 rounded-full", c === 'blue' ? "bg-blue-500" : "bg-red-500")} /> {c}
                    </button>
                  ))}
                </div>
                <Button type="submit" className="w-full">{editingNotice ? 'Update' : 'Post'}</Button>
              </form>
            </GlassCard>
            <div className="space-y-3">
              {notices.map(n => (
                <div key={n.id} className="glass p-4 rounded-2xl border border-white/5">
                  <div className="flex justify-between items-start">
                    <h5 className="text-sm font-bold truncate pr-4">{n.title}</h5>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => { setEditingNotice(n); setNTitle(n.title); setNContent(n.content); setNColor(n.color); }} className="p-1.5 text-blue-400"><Settings size={14} /></button>
                      <button onClick={() => deleteNotice(n.id)} className="p-1.5 text-red-400"><Trash2 size={14} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeAdminTab === 'users' && (
        <GlassCard className="p-0 overflow-hidden">
          <div className="p-6 border-b border-white/5 bg-white/5"><h3 className="text-lg font-bold">Student Directory</h3></div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] text-slate-500 uppercase tracking-widest border-b border-white/5">
                  <th className="px-6 py-4">Student</th>
                  <th className="px-6 py-4">Phone Number</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {allStudents.map(student => (
                  <tr key={student.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 flex items-center gap-3"><span className="text-sm font-medium">{student.full_name}</span></td>
                    <td className="px-6 py-4 text-sm text-slate-400 font-mono">{student.student_id}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2"><div className={cn("w-2 h-2 rounded-full", student.is_online ? "bg-green-500" : "bg-slate-600")} /><span className="text-xs">{student.is_online ? "Online" : "Offline"}</span></div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button className="p-1.5 text-blue-400 hover:bg-blue-600/10 rounded-lg"><Settings size={14} /></button>
                        <button onClick={async () => {
                          if (window.confirm('Delete user?')) {
                            await supabase.from('profiles').delete().eq('id', student.id);
                            setAllStudents(prev => prev.filter(s => s.id !== student.id));
                          }
                        }} className="p-1.5 text-red-400 hover:bg-red-600/10 rounded-lg"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {activeAdminTab === 'maint' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-8">
            <GlassCard className="space-y-6">
              <h3 className="text-lg font-bold flex items-center gap-2 text-red-400"><Trash2 size={24} /> Chat Maintenance</h3>
              <div className="space-y-3">
                {[1, 7, 30].map(d => (
                  <button key={d} onClick={() => purgeChats(d)} className="w-full flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-red-500/10 transition-all text-sm font-medium">
                    Older than {d} {d === 1 ? 'day' : 'days'}
                    <ChevronRight size={18} />
                  </button>
                ))}
              </div>
            </GlassCard>

            <GlassCard className="space-y-6">
              <h3 className="text-lg font-bold flex items-center gap-2 text-blue-400"><Clock size={24} /> System Health</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-white/5 text-center"><div className="text-2xl font-bold">{rooms.length}</div><div className="text-[10px] text-slate-500">Rooms</div></div>
                <div className="p-4 rounded-2xl bg-white/5 text-center"><div className="text-2xl font-bold">{allStudents.filter(s => s.is_online).length}</div><div className="text-[10px] text-slate-500">Online</div></div>
              </div>
            </GlassCard>
          </div>

          <GlassCard className="space-y-6">
            <h3 className="text-lg font-bold flex items-center gap-2 text-purple-400"><MessageSquare size={24} /> Manage Rooms</h3>
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
              {rooms.map(room => (
                <div key={room.id} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 group">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center">
                      {room.type === 'anonymous' ? <Ghost size={20} /> : <Hash size={20} />}
                    </div>
                    <div>
                      <div className="text-sm font-bold">{room.name}</div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-widest">{room.type}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => deleteRoom(room.id)}
                    className="p-3 text-red-400 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 rounded-xl transition-all"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}

// --- Helper UI Components ---

function NavButton({ icon, label, active, onClick, variant = 'primary' }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-xl transition-all w-full",
        active
          ? "bg-blue-600/20 text-blue-400 shadow-[0_0_20px_rgba(37,99,235,0.1)] border border-blue-500/30"
          : "text-slate-400 hover:bg-white/5 hover:text-white border border-transparent",
        variant === 'danger' && "hover:bg-red-500/10 hover:text-red-400"
      )}
    >
      {icon}
      <span className="font-medium text-sm">{label}</span>
      {active && <motion.div layoutId="active" className="ml-auto w-1 h-4 bg-blue-500 rounded-full" />}
    </button>
  );
}

function MobileNavButton({ icon, active, onClick }) {
  return (
    <button onClick={onClick} className={cn("p-3 rounded-2xl transition-all", active ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30 scale-110" : "text-slate-400")}>
      {React.cloneElement(icon, { size: 24 })}
    </button>
  );
}

function TabItem({ icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all",
        active ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" : "text-slate-400 hover:text-white"
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
