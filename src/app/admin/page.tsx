'use client';

import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, deleteDoc, doc, getDocs, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Competition } from '@/types';
import { useAdminAuth } from '@/lib/admin-auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Shield, Plus, LogOut, Key, Clock, FileText, CheckCircle2, Trophy, Sparkles, X, Trash2 } from 'lucide-react';

export default function AdminDashboard() {
  const { isAuthenticated, isLoading: isAuthLoading, logout } = useAdminAuth();
  const router = useRouter();

  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [coord, setCoord] = useState('');
  const [password, setPassword] = useState('');
  const [duration, setDuration] = useState(60);
  const [texts, setTexts] = useState(['', '', '', '', '']);

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.push('/admin/login');
      return;
    }

    if (isAuthenticated) {
      const q = query(collection(db, 'competitions'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const compsData: Competition[] = [];
        snapshot.forEach((doc) => compsData.push({ id: doc.id, ...doc.data() } as Competition));
        setCompetitions(compsData);
        setLoading(false);
      });

      return () => unsubscribe();
    }
  }, [isAuthenticated, isAuthLoading, router]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (texts.some(t => t.trim() === '')) {
      alert("All 5 text passages must be filled out.");
      return;
    }

    try {
      await addDoc(collection(db, 'competitions'), {
        name,
        description: desc,
        coordinator: coord,
        password,
        duration: Number(duration),
        status: 'Upcoming',
        texts,
        createdAt: serverTimestamp()
      });
      setShowModal(false);
      // Reset form
      setName(''); setDesc(''); setCoord(''); setPassword('');
      setTexts(['', '', '', '', '']);
    } catch (err) {
      console.error("Error creating competition:", err);
      alert("Error creating competition.");
    }
  };

  const handleDeleteCompetition = async (compId: string, compName: string) => {
    if (!window.confirm(`Are you sure you want to delete competition "${compName}"? This will permanently delete the contest and all associated student participant scores.`)) {
      return;
    }

    setDeletingId(compId);
    try {
      // 1. Delete all subcollection participants first
      const participantsRef = collection(db, `competitions/${compId}/participants`);
      const pSnap = await getDocs(participantsRef);
      
      if (!pSnap.empty) {
        const batch = writeBatch(db);
        pSnap.forEach((docSnap) => {
          batch.delete(docSnap.ref);
        });
        await batch.commit();
      }

      // 2. Delete parent competition document
      await deleteDoc(doc(db, 'competitions', compId));
    } catch (err) {
      console.error("Error deleting competition:", err);
      alert("Error deleting competition. Please check permissions.");
    } finally {
      setDeletingId(null);
    }
  };


  if (isAuthLoading || loading) return <div className="text-xl animate-pulse mt-12 text-primary font-bold">Loading Admin Command Center...</div>;

  const liveCount = competitions.filter(c => c.status === 'Live').length;
  const upcomingCount = competitions.filter(c => c.status === 'Upcoming').length;
  const endedCount = competitions.filter(c => c.status === 'Ended').length;

  return (
    <div className="w-full max-w-7xl mt-4 space-y-8">
      {/* Header Bar */}
      <div className="flex justify-between items-center flex-wrap gap-4 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <Shield className="w-8 h-8 text-primary" /> Admin Command Center
          </h1>
          <p className="text-sm text-foreground/60">Configure speed typing contests & monitor live participants</p>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowModal(true)} 
            className="bg-primary text-slate-950 font-extrabold px-6 py-3 rounded-xl hover:bg-yellow-400 shadow-[0_0_20px_rgba(226,183,20,0.3)] transition-all hover:scale-105 inline-flex items-center gap-2"
          >
            <Plus className="w-5 h-5" /> Host New Competition
          </button>

          <button 
            onClick={logout} 
            className="bg-slate-900 hover:bg-red-500/20 hover:text-red-400 text-foreground/80 px-4 py-3 rounded-xl border border-white/10 transition-colors font-semibold text-sm inline-flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      </div>

      {/* Metrics Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="glass-card p-6 border-l-4 border-l-emerald-500">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-xs uppercase font-bold text-foreground/50 tracking-wider">Live Contests</div>
              <div className="text-4xl font-extrabold text-emerald-400 mt-1">{liveCount}</div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            </div>
          </div>
        </div>

        <div className="glass-card p-6 border-l-4 border-l-cyan-500">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-xs uppercase font-bold text-foreground/50 tracking-wider">Upcoming Contests</div>
              <div className="text-4xl font-extrabold text-cyan-400 mt-1">{upcomingCount}</div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
              <Clock className="w-6 h-6 text-cyan-400" />
            </div>
          </div>
        </div>

        <div className="glass-card p-6 border-l-4 border-l-slate-500">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-xs uppercase font-bold text-foreground/50 tracking-wider">Completed Contests</div>
              <div className="text-4xl font-extrabold text-foreground/60 mt-1">{endedCount}</div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
              <Trophy className="w-6 h-6 text-foreground/50" />
            </div>
          </div>
        </div>
      </div>

      {/* Competitions Grid */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
          Hosted Competitions ({competitions.length})
        </h2>

        {competitions.length === 0 ? (
          <div className="glass-card p-12 text-center text-foreground/50 border border-white/10">
            No competitions created yet. Click "+ Host New Competition" to start.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {competitions.map(comp => (
              <div key={comp.id} className="glass-card p-6 flex flex-col justify-between border border-white/10 hover:border-primary/40 transition-all">
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="text-xl font-bold text-white line-clamp-1">{comp.name}</h3>
                    <span className={`px-2.5 py-1 text-xs font-bold rounded-full border ${
                      comp.status === 'Live' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 
                      comp.status === 'Ended' ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                    }`}>
                      {comp.status}
                    </span>
                  </div>
                  <p className="text-xs text-foreground/70 mb-6 line-clamp-2 leading-relaxed">{comp.description}</p>
                </div>

                <div className="pt-4 border-t border-white/10 flex justify-between items-center gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-mono text-primary bg-primary/10 px-2.5 py-1 rounded border border-primary/20">
                    <Key className="w-3.5 h-3.5" /> {comp.password}
                  </div>

                  <div className="flex items-center gap-2">
                    <Link href={`/admin/${comp.id}`}>
                      <button className="bg-white/10 hover:bg-white/20 text-white font-bold px-3.5 py-2 rounded-lg text-xs transition-colors">
                        Manage →
                      </button>
                    </Link>

                    <button 
                      onClick={() => handleDeleteCompetition(comp.id, comp.name)}
                      disabled={deletingId === comp.id}
                      className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 p-2 rounded-lg transition-colors text-xs disabled:opacity-50"
                      title="Delete Competition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Host New Competition Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-[100] flex items-center justify-center p-4 sm:p-6 overflow-hidden">
          <div className="glass-card w-full max-w-2xl p-6 sm:p-8 relative border border-primary/40 shadow-2xl max-h-[90vh] flex flex-col my-auto animate-fadeIn bg-slate-900/90">

            <button 
              onClick={() => setShowModal(false)} 
              className="absolute top-4 right-4 text-foreground/50 hover:text-red-400 transition-colors p-1 z-10"
              aria-label="Close Modal"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="flex items-center gap-3 mb-4 shrink-0 pr-8">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Host New Competition</h2>
                <p className="text-xs text-foreground/60">Create a typing contest for student participation</p>
              </div>
            </div>
            
            <form onSubmit={handleCreate} className="space-y-4 overflow-y-auto pr-2 max-h-[calc(90vh-160px)]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-foreground/80 mb-1">Competition Title</label>
                  <input type="text" required value={name} onChange={e => setName(e.target.value)} className="w-full glass-input rounded-lg p-3 text-sm outline-none" placeholder="e.g. SpeedTyping 2026 Finals" />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-foreground/80 mb-1">Coordinator Name</label>
                  <input type="text" required value={coord} onChange={e => setCoord(e.target.value)} className="w-full glass-input rounded-lg p-3 text-sm outline-none" placeholder="e.g. Prof. Alan Turing" />
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-semibold uppercase text-foreground/80 mb-1">Short Description</label>
                <input type="text" required value={desc} onChange={e => setDesc(e.target.value)} className="w-full glass-input rounded-lg p-3 text-sm outline-none" placeholder="Enter contest details" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-foreground/80 mb-1">Unique ID (Password)</label>
                  <input type="text" required value={password} onChange={e => setPassword(e.target.value)} className="w-full glass-input rounded-lg p-3 text-sm outline-none font-mono" placeholder="e.g. ST2026-KEY" />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-foreground/80 mb-1">Test Duration</label>
                  <select value={duration} onChange={e => setDuration(Number(e.target.value))} className="w-full glass-input rounded-lg p-3 text-sm outline-none bg-slate-900">
                    <option value={30}>30 Seconds</option>
                    <option value={60}>1 Minute</option>
                    <option value={120}>2 Minutes</option>
                    <option value={180}>3 Minutes</option>
                  </select>
                </div>
              </div>

              <div className="pt-2">
                <label className="block text-xs font-semibold uppercase text-primary mb-2 flex items-center gap-1.5">
                  <FileText className="w-4 h-4" /> Typing Passages (Exactly 5 Passages Required)
                </label>
                <div className="space-y-3">
                  {texts.map((t, idx) => (
                    <textarea
                      key={idx}
                      required
                      placeholder={`Passage ${idx + 1} text...`}
                      value={t}
                      onChange={e => {
                        const newTexts = [...texts];
                        newTexts[idx] = e.target.value;
                        setTexts(newTexts);
                      }}
                      className="w-full glass-input rounded-lg p-3 text-sm outline-none h-20 font-mono text-xs resize-y"
                    />
                  ))}
                </div>
              </div>

              <button type="submit" className="w-full bg-primary text-slate-950 font-bold py-3.5 rounded-lg mt-4 hover:bg-yellow-400 transition-all shadow-[0_0_20px_rgba(226,183,20,0.3)]">
                Create & Publish Competition
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
