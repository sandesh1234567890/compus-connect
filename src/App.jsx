import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare, BookOpen, Video, Home, User, Settings,
  Send, Plus, Trash2, LogOut, Search, Ghost, Hash,
  ChevronRight, Play, FileText, Link as LinkIcon, Lock,
  Smartphone, UserPlus
} from 'lucide-react';
import { supabase } from './supabaseClient';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

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
  const [activeTab, setActiveTab] = useState('dashboard');
  const [subjects, setSubjects] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [notices, setNotices] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchGlobalData = async () => {
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
      // Initialize default rooms if they don't exist
      const defaultRooms = [
        { name: 'General Campus', type: 'group' },
        { name: 'Anonymous Hall', type: 'anonymous' }
      ];
      const { data: createdRooms } = await supabase.from('rooms').insert(defaultRooms).select();
      if (createdRooms) setRooms(createdRooms);
    }
  };

  // Initialize Data
  useEffect(() => {
    const init = async () => {
      try {
        const storedUser = localStorage.getItem('cc_user');
        if (storedUser) {
          const parsed = JSON.parse(storedUser);
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (!uuidRegex.test(parsed.id)) {
            localStorage.removeItem('cc_user');
            setUser(null);
          } else {
            setUser(parsed);
            setIsAdmin(parsed.studentId === 'admin123');
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

    // Presence logic
    const updateStatus = async (status) => {
      const storedUser = localStorage.getItem('cc_user');
      if (storedUser) {
        const parsed = JSON.parse(storedUser);
        await supabase.from('profiles').update({ is_online: status }).eq('id', parsed.id);
      }
    };

    updateStatus(true);
    window.addEventListener('beforeunload', () => updateStatus(false));

    // Subscriptions for real-time updates
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

  const handleLogin = async (name, studentId) => {
    const newUser = {
      name,
      studentId,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`
    };

    // Profiles check/creation
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('student_id', studentId)
      .single();

    if (!profile) {
      // Hex-compliant pseudoId generation from student ID
      const safeHex = Array.from(studentId)
        .map(c => c.charCodeAt(0).toString(16))
        .join('')
        .slice(0, 12)
        .padEnd(12, '0');
      const pseudoId = `00000000-0000-0000-0000-${safeHex}`;

      await supabase.from('profiles').insert([
        { id: pseudoId, student_id: studentId, full_name: name, role: studentId === 'admin123' ? 'admin' : 'student' }
      ]);
      newUser.id = pseudoId;
    } else {
      newUser.id = profile.id;
    }

    setUser(newUser);
    setIsAdmin(studentId === 'admin123');
    localStorage.setItem('cc_user', JSON.stringify(newUser));
    // Re-fetch data for the newly logged in user
    await fetchGlobalData();
    setActiveTab('dashboard');
  };

  const handleLogout = async () => {
    if (user) {
      await supabase.from('profiles').update({ is_online: false }).eq('id', user.id);
    }
    setUser(null);
    setIsAdmin(false);
    localStorage.removeItem('cc_user');
  };

  if (loading) return <div className="h-screen flex items-center justify-center">Loading...</div>;
  if (!user) return <LoginScreen onLogin={handleLogin} />;

  return (
    <div className="flex h-screen overflow-hidden bg-[#050510]">
      {/* Sidebar - Desktop */}
      <nav className="hidden md:flex flex-col w-64 glass border-r border-white/5 p-4 gap-4">
        <div className="flex items-center gap-3 px-2 mb-8">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Smartphone className="text-white" />
          </div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-white to-blue-400 bg-clip-text text-transparent">CampusConnect</h1>
        </div>

        <NavButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<Home size={20} />} label="Dashboard" />
        <NavButton active={activeTab === 'subjects'} onClick={() => setActiveTab('subjects')} icon={<BookOpen size={20} />} label="Subjects" />
        <NavButton active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} icon={<MessageSquare size={20} />} label="Messaging" />
        <NavButton active={activeTab === 'videos'} onClick={() => setActiveTab('videos')} icon={<Video size={20} />} label="Video Library" />

        {isAdmin && (
          <NavButton active={activeTab === 'admin'} onClick={() => setActiveTab('admin')} icon={<Settings size={20} />} label="Admin Panel" />
        )}

        <div className="mt-auto pt-4 border-t border-white/5">
          <div className="flex items-center gap-3 px-2 mb-4">
            <img src={user.avatar} className="w-8 h-8 rounded-full border border-white/20" />
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-medium truncate">{user.name}</span>
              <span className="text-[10px] text-slate-400 truncate">{user.studentId}</span>
            </div>
          </div>
          <NavButton variant="danger" onClick={handleLogout} icon={<LogOut size={20} />} label="Log Out" />
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative overflow-hidden h-full">
        {/* Top Header - Mobile Only */}
        <header className="md:hidden glass p-4 flex items-center justify-between border-b border-white/5">
          <h1 className="text-lg font-bold">CampusConnect</h1>
          <img src={user.avatar} className="w-8 h-8 rounded-full" />
        </header>

        <section className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && <Dashboard key="dash" user={user} isAdmin={isAdmin} setTab={setActiveTab} notices={notices} setNotices={setNotices} />}
            {activeTab === 'subjects' && <SubjectPortal key="subs" isAdmin={isAdmin} subjects={subjects} setSubjects={setSubjects} />}
            {activeTab === 'chat' && <ChatPortal key="chat" user={user} rooms={rooms} isAdmin={isAdmin} />}
            {activeTab === 'videos' && <VideoPortal key="vid" />}
            {activeTab === 'admin' && <AdminPanel key="admin" subjects={subjects} setSubjects={setSubjects} notices={notices} setNotices={setNotices} />}
          </AnimatePresence>
        </section>

        {/* Bottom Nav - Mobile Only */}
        <footer className="md:hidden glass border-t border-white/5 p-2 flex justify-around">
          <MobileNavButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<Home />} />
          <MobileNavButton active={activeTab === 'subjects'} onClick={() => setActiveTab('subjects')} icon={<BookOpen />} />
          <MobileNavButton active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} icon={<MessageSquare />} />
          <MobileNavButton active={activeTab === 'admin' && isAdmin} onClick={() => isAdmin && setActiveTab('admin')} icon={<Settings />} />
        </footer>
      </main>
    </div>
  );
}

// --- Screens & Major Views ---

function LoginScreen({ onLogin }) {
  const [name, setName] = useState('');
  const [id, setId] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (name && id) {
      onLogin(name, id);
    } else {
      setError('Please fill in all fields');
    }
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
          <div>
            <label className="text-xs font-medium text-slate-400 ml-1 mb-1 block">Full Name</label>
            <input
              className="glass-input w-full"
              placeholder="e.g. John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-400 ml-1 mb-1 block">Student ID</label>
            <input
              className="glass-input w-full"
              placeholder="e.g. STU-101"
              value={id}
              onChange={(e) => setId(e.target.value)}
            />
            <p className="text-[10px] text-slate-500 mt-1 ml-1">Use 'admin123' for admin access</p>
          </div>

          {error && <p className="text-red-400 text-xs text-center">{error}</p>}

          <Button type="submit" className="w-full py-4 mt-4 text-sm font-semibold tracking-wide">
            ENTER PORTAL
          </Button>
        </form>

        <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-500">
          <span>Beta Version 1.0</span>
          <span>&copy; 2024 CampusConnect</span>
        </div>
      </motion.div>
    </div>
  );
}

function Dashboard({ user, isAdmin, setTab, notices }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white">Hello, {user.name.split(' ')[0]}! 👋</h2>
          <p className="text-slate-400">Everything looks great today at your campus.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setTab('chat')} variant="secondary"><Plus size={18} /> New Chat</Button>
          {isAdmin && <Button onClick={() => setTab('admin')} variant="primary"><Settings size={18} /> Manage</Button>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <GlassCard className="col-span-1 md:col-span-2 space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2"><Smartphone size={20} className="text-blue-400" /> Notice Board</h3>
          </div>
          <div className="space-y-3">
            {notices.length > 0 ? notices.map(notice => (
              <div key={notice.id} className="flex items-start gap-4 p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                <div className={cn("w-1 h-12 rounded-full mt-1",
                  notice.color === 'red' ? "bg-red-500" :
                    notice.color === 'blue' ? "bg-blue-500" : "bg-purple-500")}
                />
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-white mb-1 uppercase tracking-wider">{notice.title}</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">{notice.content}</p>
                  <span className="text-[10px] text-slate-500 mt-2 block">{new Date(notice.created_at).toLocaleDateString()}</span>
                </div>
                <ChevronRight size={16} className="text-slate-600 self-center" />
              </div>
            )) : (
              <div className="text-center py-8 text-slate-500 italic">No active notices</div>
            )}
          </div>
        </GlassCard>

        <GlassCard className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2"><Plus size={20} className="text-purple-400" /> Quick Actions</h3>
          <div className="space-y-2">
            <ActionButton label="Anonymous Hall" icon={<Ghost size={16} />} onClick={() => setTab('chat')} />
            <ActionButton label="Subject Library" icon={<BookOpen size={16} />} onClick={() => setTab('subjects')} />
            <ActionButton label="Video Lessons" icon={<Video size={16} />} onClick={() => setTab('videos')} />
          </div>
        </GlassCard>
      </div>
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

const MessageBubble = ({ message, isMe, showName }) => {
  const senderName = message.is_anonymous
    ? (message.profiles?.student_id === 'admin123' ? "Admin (Ghost)" : "Anonymous student")
    : (message.profiles?.full_name || 'Student');

  return (
    <motion.div
      initial={{ opacity: 0, x: isMe ? 20 : -20 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn("flex flex-col group", isMe ? "items-end" : "items-start")}
    >
      <div className="flex items-center gap-2 mb-1 px-2">
        {showName && !isMe && <span className="text-[10px] font-bold text-slate-400">{senderName}</span>}
        <span className="text-[9px] text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
          {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <div className={cn(
        "max-w-[85%] px-4 py-2.5 rounded-2xl text-sm shadow-xl",
        isMe
          ? "bg-blue-600 text-white rounded-tr-none"
          : "bg-white/10 text-white border border-white/5 rounded-tl-none backdrop-blur-md"
      )}>
        <p className="leading-relaxed">{message.content}</p>
      </div>
    </motion.div>
  );
};

function ChatPortal({ user, rooms, isAdmin }) {
  const [activeRoom, setActiveRoom] = useState(rooms[0]);
  const [inputText, setInputText] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [showRealNames, setShowRealNames] = useState(false);
  const [searchUser, setSearchUser] = useState('');
  const [availableProfiles, setAvailableProfiles] = useState([]);
  const [allProfiles, setAllProfiles] = useState([]);
  const [sidebarTab, setSidebarTab] = useState('rooms'); // 'rooms' or 'directory'
  const scrollRef = useRef();

  // Fetch all profiles and messages
  useEffect(() => {
    const fetchInitial = async () => {
      const { data: profs } = await supabase.from('profiles').select('*');
      if (profs) setAllProfiles(profs);

      if (activeRoom) {
        const { data: msgs } = await supabase
          .from('messages')
          .select('*, profiles(full_name, student_id)')
          .eq('room_id', activeRoom.id)
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
      <div className="w-full md:w-80 flex flex-col gap-4">
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
              {rooms.map(room => (
                <div key={room.id} onClick={() => setActiveRoom(room)} className={cn("p-4 rounded-2xl flex items-center gap-4 cursor-pointer transition-all border", activeRoom?.id === room.id ? "bg-blue-600/20 border-blue-500/30" : "bg-white/5 border-transparent hover:bg-white/10")}>
                  <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shrink-0", room.type === 'anonymous' ? "bg-purple-600/20 text-purple-400" : "bg-blue-600/20 text-blue-400")}>
                    {room.type === 'anonymous' ? <Ghost size={24} /> : room.type === 'dm' ? <User size={24} /> : <Hash size={24} />}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <h4 className="font-medium text-sm truncate">{room.name.includes(':') ? room.name.split(':').filter(id => id !== user.id).map(id => allProfiles.find(p => p.id === id)?.full_name || 'Chat').join(', ') : room.name}</h4>
                    <p className="text-xs text-slate-500 truncate">Tap to open</p>
                  </div>
                </div>
              ))}
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
      <GlassCard className="flex-1 hidden md:flex flex-col p-0 relative overflow-hidden">
        <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/5">
          <div className="flex items-center gap-3">
            <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", activeRoom?.type === 'anonymous' ? "bg-purple-600/20" : "bg-blue-600/20")}>
              {activeRoom?.type === 'anonymous' ? <Ghost size={20} className="text-purple-400" /> : <Hash size={20} className="text-blue-400" />}
            </div>
            <div>
              <h4 className="font-bold text-sm">{activeRoom?.name}</h4>
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

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {(!activeRoom || chatMessages.length === 0) && (
            <div className="h-full flex items-center justify-center text-slate-500 text-sm italic">
              {!activeRoom ? "Select a room to start chatting" : "No messages yet. Start the conversation!"}
            </div>
          )}
          {activeRoom && chatMessages.map(msg => {
            const isMe = msg.sender_id === user.id;
            const senderName = (activeRoom.type === 'anonymous' && !isMe)
              ? (isAdmin && showRealNames ? msg.profiles?.full_name : "Anonymous Student")
              : (isMe ? "You" : (msg.profiles?.full_name || 'Student'));

            return (
              <motion.div
                initial={{ opacity: 0, x: isMe ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                key={msg.id}
                className={cn("flex flex-col", isMe ? "items-end" : "items-start")}
              >
                <span className="text-[10px] text-slate-500 mx-2 mb-1">{senderName}</span>
                <div className={isMe ? "chat-bubble-sender" : "chat-bubble-receiver"}>
                  <p className="text-sm">{msg.content}</p>
                  <span className="text-[9px] text-white/40 mt-1 block text-right">
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </motion.div>
            );
          })}
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

function SubjectPortal({ isAdmin, subjects }) {
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
              <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold tracking-widest text-blue-400">View Materials</span>
                <ChevronRight size={16} className="text-blue-400 group-hover:translate-x-1 transition-transform" />
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function SubjectDetail({ subject, onBack }) {
  const [activeTab, setActiveTab] = useState('video');
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);

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
            <GlassCard key={item.id} className="p-4 hover:bg-white/10 transition-colors">
              <div className="flex items-start justify-between mb-4">
                <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400">
                  {item.type === 'video' ? <Video size={20} /> : item.type === 'note' ? <FileText size={20} /> : <LinkIcon size={20} />}
                </div>
                <div className="flex gap-2">
                  <a href={item.content} target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-full border border-white/5 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all">
                    {item.type === 'video' ? <Play size={14} fill="currentColor" /> : <Send size={14} />}
                  </a>
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
    </motion.div>
  );
}

function VideoPortal() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);

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

    // Subscribe to material changes for zero-reload sync
    const matChannel = supabase.channel('video-updates')
      .on('postgres_changes', { event: '*', table: 'materials' }, fetchVideos)
      .subscribe();

    return () => {
      supabase.removeChannel(matChannel);
    };
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Educational Video Library</h2>
      {loading ? (
        <p className="text-slate-400 italic">Loading video library...</p>
      ) : videos.length === 0 ? (
        <p className="text-slate-500 italic">No videos have been uploaded yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {videos.map(vid => (
            <GlassCard key={vid.id} className="p-0 overflow-hidden bg-black/40 border-none group">
              <div className="aspect-video relative">
                <img
                  src={`https://images.unsplash.com/photo-1509228468518-180dd4864904?q=80&w=2070&auto=format&fit=crop`}
                  className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <a
                    href={vid.content}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center shadow-2xl shadow-blue-500/50 group-hover:scale-110 transition-transform"
                  >
                    <Play size={24} fill="white" className="text-white ml-1" />
                  </a>
                </div>
              </div>
              <div className="p-4">
                <h4 className="font-bold">{vid.title}</h4>
                <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider">{vid.subjects?.name} • Resources</p>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminPanel({ subjects, setSubjects, notices, setNotices }) {
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

  const [msg, setMsg] = useState({ text: '', error: false });

  const addSubject = async (e) => {
    e.preventDefault();
    if (!newSubName) return;

    const { data, error } = await supabase
      .from('subjects')
      .insert([{ name: newSubName, description: newSubDesc }])
      .select();

    if (error) {
      setMsg({ text: error.message, error: true });
    } else {
      setSubjects([...subjects, data[0]]);
      setNewSubName('');
      setNewSubDesc('');
      setMsg({ text: 'Subject created successfully!', error: false });
    }
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

  const addMaterial = async (e) => {
    e.preventDefault();
    if (!mSubId || !mTitle) {
      setMsg({ text: 'Please fill title and select subject', error: true });
      return;
    }

    let finalContent = mContent;

    if (mType === 'note' && selectedFile) {
      setUploading(true);
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${mSubId}/${fileName}`;

      const { data, error: uploadError } = await supabase.storage
        .from('materials')
        .upload(filePath, selectedFile);

      if (uploadError) {
        setMsg({ text: 'Upload failed: ' + uploadError.message, error: true });
        setUploading(false);
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('materials')
        .getPublicUrl(filePath);

      finalContent = publicUrl;
    }

    if (!finalContent && mType !== 'note') {
      setMsg({ text: 'Please provide content/link', error: true });
      return;
    }

    const { error } = await supabase
      .from('materials')
      .insert([
        {
          subject_id: mSubId,
          type: mType,
          title: mTitle,
          content: finalContent
        }
      ]);

    setUploading(false);
    if (error) {
      setMsg({ text: error.message, error: true });
    } else {
      setMTitle('');
      setMContent('');
      setSelectedFile(null);
      setMsg({ text: 'Material uploaded successfully!', error: false });
    }
  };

  const saveNotice = async (e) => {
    e.preventDefault();
    if (!nTitle) return;

    if (editingNotice) {
      const { error } = await supabase.from('notices').update({
        title: nTitle,
        content: nContent,
        color: nColor
      }).eq('id', editingNotice.id);

      if (error) setMsg({ text: error.message, error: true });
      else {
        setEditingNotice(null);
        setNTitle(''); setNContent('');
        setMsg({ text: 'Notice updated!', error: false });
      }
    } else {
      const { error } = await supabase.from('notices').insert([{
        title: nTitle,
        content: nContent,
        color: nColor
      }]);
      if (error) setMsg({ text: error.message, error: true });
      else {
        setNTitle(''); setNContent('');
        setMsg({ text: 'Notice posted!', error: false });
      }
    }
  };

  const deleteNotice = async (id) => {
    const { error } = await supabase.from('notices').delete().eq('id', id);
    if (error) setMsg({ text: error.message, error: true });
    else setMsg({ text: 'Notice deleted.', error: false });
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-20">
      <div className="p-6 rounded-3xl bg-blue-600/10 border border-blue-500/20 flex flex-col md:flex-row items-center gap-6">
        <div className="w-20 h-20 rounded-2xl bg-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
          <Lock size={40} />
        </div>
        <div>
          <h2 className="text-2xl font-bold">Admin Central Control</h2>
          <p className="text-slate-400 text-sm">Full Management: Subjects, Materials, and Notices.</p>
        </div>
      </div>

      {msg.text && (
        <div className={cn("p-4 rounded-xl text-sm text-center animate-bounce", msg.error ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400")}>
          {msg.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <GlassCard className="space-y-4">
            <h3 className="text-lg font-bold flex items-center gap-2 text-blue-400"><Plus size={20} /> Manage Subjects</h3>
            <form onSubmit={addSubject} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input placeholder="Subject Name" className="glass-input" value={newSubName} onChange={(e) => setNewSubName(e.target.value)} />
              <input placeholder="Description" className="glass-input" value={newSubDesc} onChange={(e) => setNewSubDesc(e.target.value)} />
              <Button type="submit" className="md:col-span-2 py-3">Create Subject</Button>
            </form>

            <div className="mt-6 space-y-2">
              {subjects.map(s => (
                <div key={s.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                  <div className="flex items-center gap-3">
                    <BookOpen size={16} className="text-blue-400" />
                    <span className="text-sm font-medium">{s.name}</span>
                  </div>
                  <button onClick={() => deleteSubject(s.id)} className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard className="space-y-4">
            <h3 className="text-lg font-bold flex items-center gap-2 text-pink-400"><Video size={20} /> Upload Materials</h3>
            <form onSubmit={addMaterial} className="space-y-4">
              <select className="glass-input w-full bg-[#1a1a2e]" value={mSubId} onChange={(e) => setMSubId(e.target.value)}>
                <option value="">Select Subject</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <div className="flex gap-4">
                <button type="button" onClick={() => setMType('video')} className={cn("flex-1 p-3 rounded-xl border transition-all", mType === 'video' ? "bg-blue-600/20 border-blue-500/50" : "bg-white/5 border-transparent")}>Video</button>
                <button type="button" onClick={() => setMType('note')} className={cn("flex-1 p-3 rounded-xl border transition-all", mType === 'note' ? "bg-blue-600/20 border-blue-500/50" : "bg-white/5 border-transparent")}>Note (PDF/URL)</button>
                <button type="button" onClick={() => setMType('link')} className={cn("flex-1 p-3 rounded-xl border transition-all", mType === 'link' ? "bg-blue-600/20 border-blue-500/50" : "bg-white/5 border-transparent")}>Link/Other</button>
              </div>
              <input placeholder="Material Title" className="glass-input w-full" value={mTitle} onChange={(e) => setMTitle(e.target.value)} />

              {mType === 'note' ? (
                <div className="space-y-2">
                  <label className="text-[10px] text-slate-400 ml-1 uppercase font-bold tracking-widest">Upload PDF or File</label>
                  <input type="file" onChange={(e) => setSelectedFile(e.target.files[0])} className="glass-input w-full text-xs" />
                  <p className="text-[10px] text-slate-500 text-center">--- OR ---</p>
                  <input placeholder="Enter External Download URL" className="glass-input w-full" value={mContent} onChange={(e) => setMContent(e.target.value)} />
                </div>
              ) : (
                <input placeholder="YouTube / Resource Link" className="glass-input w-full" value={mContent} onChange={(e) => setMContent(e.target.value)} />
              )}

              <Button type="submit" disabled={uploading} className="w-full py-3">
                {uploading ? "Uploading..." : "Upload Resource"}
              </Button>
            </form>
          </GlassCard>
        </div>

        <div className="space-y-8">
          <GlassCard className="space-y-4 border-purple-500/20">
            <h3 className="text-lg font-bold flex items-center gap-2 text-purple-400"><Hash size={20} /> {editingNotice ? 'Edit Notice' : 'Post Notice'}</h3>
            <form onSubmit={saveNotice} className="space-y-4">
              <input placeholder="Notice Title" className="glass-input w-full" value={nTitle} onChange={(e) => setNTitle(e.target.value)} />
              <textarea placeholder="Content..." className="glass-input w-full h-32" value={nContent} onChange={(e) => setNContent(e.target.value)} />
              <div className="flex gap-4">
                <button type="button" onClick={() => setNColor('blue')} className={cn("flex-1 p-2 rounded-xl border flex items-center justify-center gap-2", nColor === 'blue' ? "bg-blue-600/20 border-blue-400" : "border-white/5")}>
                  <div className="w-3 h-3 rounded-full bg-blue-500" /> Blue
                </button>
                <button type="button" onClick={() => setNColor('red')} className={cn("flex-1 p-2 rounded-xl border flex items-center justify-center gap-2", nColor === 'red' ? "bg-red-600/20 border-red-400" : "border-white/5")}>
                  <div className="w-3 h-3 rounded-full bg-red-500" /> Red
                </button>
              </div>
              <div className="flex gap-2">
                {editingNotice && <Button type="button" variant="secondary" onClick={() => { setEditingNotice(null); setNTitle(''); setNContent(''); }} className="flex-1">Cancel</Button>}
                <Button type="submit" className="flex-1">{editingNotice ? 'Update' : 'Post Notice'}</Button>
              </div>
            </form>
          </GlassCard>

          <div className="space-y-3">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2">Active Notices</h4>
            {notices.map(n => (
              <div key={n.id} className="glass p-4 rounded-2xl border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <h5 className="text-sm font-bold truncate pr-4">{n.title}</h5>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => { setEditingNotice(n); setNTitle(n.title); setNContent(n.content); setNColor(n.color || 'blue'); }} className="p-1.5 text-blue-400 hover:bg-blue-500/20 rounded-lg"><Settings size={14} /></button>
                    <button onClick={() => deleteNotice(n.id)} className="p-1.5 text-red-400 hover:bg-red-500/20 rounded-lg"><Trash2 size={14} /></button>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 line-clamp-2">{n.content}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
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
    <button onClick={onClick} className={cn("p-3 rounded-2xl", active ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30" : "text-slate-400")}>
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
