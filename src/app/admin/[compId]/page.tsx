'use client';

import { useState, useEffect, useRef } from 'react';
import { doc, collection, query, onSnapshot, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Competition, Participant } from '@/types';
import { useAdminAuth } from '@/lib/admin-auth';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import Link from 'next/link';
import { ArrowLeft, Play, StopCircle, RotateCcw, UploadCloud, Download, Trophy, Users, AlertTriangle, Key, Clock, Search, CheckCircle2 } from 'lucide-react';

export default function CompetitionManage({ params }: { params: { compId: string } }) {
  const { isAuthenticated, isLoading: isAuthLoading } = useAdminAuth();
  const router = useRouter();

  const [comp, setComp] = useState<Competition | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.push('/admin/login');
      return;
    }

    if (isAuthenticated) {
      // Fetch Competition details live
      const unsubscribeComp = onSnapshot(doc(db, 'competitions', params.compId), (doc) => {
        if (doc.exists()) setComp({ id: doc.id, ...doc.data() } as Competition);
      });

      // Fetch Participants live with debounced sorting for high concurrency
      const q = query(collection(db, `competitions/${params.compId}/participants`));
      const unsubscribeParts = onSnapshot(q, (snapshot) => {
        const pData: Participant[] = [];
        snapshot.forEach(d => pData.push({ id: d.id, ...d.data() } as Participant));
        
        // Sort leaderboard (Completed high WPM first)
        pData.sort((a, b) => {
          if (!a.score) return 1;
          if (!b.score) return -1;
          if (b.score.wpm !== a.score.wpm) return b.score.wpm - a.score.wpm;
          return b.score.accuracy - a.score.accuracy;
        });

        // Throttle state updates to every 1.2 seconds to prevent DOM re-render lag during peak 80+ student submissions
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(() => {
          setParticipants(pData);
          setLoading(false);
        }, 1200);
      });

      return () => { 
        unsubscribeComp(); 
        unsubscribeParts(); 
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      };
    }
  }, [params.compId, isAuthenticated, isAuthLoading, router]);

  const toggleStatus = async () => {
    if (!comp) return;
    const nextStatus = comp.status === 'Upcoming' ? 'Live' : comp.status === 'Live' ? 'Ended' : 'Upcoming';
    await updateDoc(doc(db, 'competitions', comp.id), { status: nextStatus });
  };

  // Chunked CSV upload handling (Max 400 operations per batch to prevent Firestore 500-item limit crash)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setUploadProgress(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data as any[];
          const validRows = rows.filter(row => {
            const rollNo = row['Roll Number'] || row['Roll No'] || row['Roll'];
            const name = row['Student Name'] || row['Name'];
            return rollNo && name;
          });

          if (validRows.length === 0) {
            alert("No valid student rows found in CSV. Please ensure columns: Roll Number, Name exist.");
            setIsUploading(false);
            return;
          }

          const BATCH_SIZE = 400; // Safe chunk limit below Firestore 500 max limit
          let processed = 0;

          for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
            const chunk = validRows.slice(i, i + BATCH_SIZE);
            const batch = writeBatch(db);

            for (const row of chunk) {
              const rollNo = (row['Roll Number'] || row['Roll No'] || row['Roll']).toString().trim().toUpperCase();
              const name = (row['Student Name'] || row['Name']).toString().trim();
              const cls = (row['Class'] || '').toString().trim();
              const sec = (row['Section'] || '').toString().trim();

              const pRef = doc(db, `competitions/${comp!.id}/participants`, rollNo);
              batch.set(pRef, {
                rollNo,
                name,
                class: cls,
                section: sec,
                isRegistered: true,
                hasParticipated: false,
                status: 'Pending',
                warnings: 0
              });
            }

            await batch.commit();
            processed += chunk.length;
            setUploadProgress({ current: processed, total: validRows.length });
          }

          alert(`Successfully registered ${processed} students across ${Math.ceil(validRows.length / BATCH_SIZE)} chunked batch transactions!`);
        } catch (err) {
          console.error("Error uploading CSV batch:", err);
          alert("Error uploading CSV data.");
        } finally {
          setIsUploading(false);
          setUploadProgress(null);
          e.target.value = ''; // Reset file input
        }
      }
    });
  };

  const exportExcel = () => {
    const exportData = participants.map((p, idx) => ({
      Rank: p.score ? idx + 1 : '-',
      Name: p.name,
      'Roll Number': p.rollNo,
      Class: p.class,
      Section: p.section,
      WPM: p.score?.wpm || 0,
      Accuracy: p.score?.accuracy ? p.score.accuracy + '%' : '0%',
      Errors: p.score?.errors || 0,
      Status: p.status,
      Warnings: p.warnings || 0
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Leaderboard");
    XLSX.writeFile(wb, `${comp?.name.replace(/\s+/g, '_')}_Leaderboard.xlsx`);
  };

  const filteredParticipants = participants.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.rollNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.class.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isAuthLoading || loading || !comp) return <div className="mt-12 animate-pulse text-xl text-primary font-bold">Loading Competition Management Portal...</div>;

  const completedCount = participants.filter(p => p.status === 'Completed').length;
  const disqualifiedCount = participants.filter(p => p.status === 'Disqualified').length;
  const pendingCount = participants.filter(p => p.status === 'Pending').length;

  return (
    <div className="w-full max-w-7xl mt-4 space-y-6">
      <Link 
        href="/admin" 
        className="inline-flex items-center gap-2 text-foreground/60 hover:text-primary transition-colors text-sm font-medium"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Admin Dashboard
      </Link>
      
      {/* Top Banner Control Card */}
      <div className="glass-card p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border border-white/10 shadow-2xl">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-extrabold text-white tracking-tight">{comp.name}</h1>
            <span className={`px-3 py-1 text-xs font-bold rounded-full border ${
              comp.status === 'Live' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 animate-pulse' :
              comp.status === 'Ended' ? 'bg-red-500/20 text-red-400 border-red-500/40' : 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40'
            }`}>
              {comp.status}
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono text-foreground/70">
            <span className="flex items-center gap-1"><Key className="w-3.5 h-3.5 text-primary" /> Passcode: <strong>{comp.password}</strong></span>
            <span>•</span>
            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-cyan-400" /> Duration: <strong>{Math.floor(comp.duration / 60)}m</strong></span>
          </div>
        </div>

        {/* Status Toggle CTA */}
        <button 
          onClick={toggleStatus}
          className={`font-extrabold px-6 py-3.5 rounded-xl shadow-lg transition-all hover:scale-105 inline-flex items-center gap-2 text-slate-950 ${
            comp.status === 'Upcoming' ? 'bg-emerald-400 hover:bg-emerald-300' :
            comp.status === 'Live' ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-cyan-400 hover:bg-cyan-300'
          }`}
        >
          {comp.status === 'Upcoming' && <><Play className="w-5 h-5" /> Launch Competition (Go Live)</>}
          {comp.status === 'Live' && <><StopCircle className="w-5 h-5" /> End Competition Now</>}
          {comp.status === 'Ended' && <><RotateCcw className="w-5 h-5" /> Reset to Upcoming</>}
        </button>
      </div>

      {/* Overview Metric Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card p-4 flex items-center gap-3">
          <Users className="w-5 h-5 text-cyan-400" />
          <div>
            <div className="text-xl font-bold text-white">{participants.length}</div>
            <div className="text-[11px] text-foreground/50 uppercase font-semibold">Registered</div>
          </div>
        </div>

        <div className="glass-card p-4 flex items-center gap-3">
          <Trophy className="w-5 h-5 text-emerald-400" />
          <div>
            <div className="text-xl font-bold text-emerald-400">{completedCount}</div>
            <div className="text-[11px] text-foreground/50 uppercase font-semibold">Completed</div>
          </div>
        </div>

        <div className="glass-card p-4 flex items-center gap-3">
          <Clock className="w-5 h-5 text-primary" />
          <div>
            <div className="text-xl font-bold text-primary">{pendingCount}</div>
            <div className="text-[11px] text-foreground/50 uppercase font-semibold">Pending</div>
          </div>
        </div>

        <div className="glass-card p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400" />
          <div>
            <div className="text-xl font-bold text-red-400">{disqualifiedCount}</div>
            <div className="text-[11px] text-foreground/50 uppercase font-semibold">Disqualified</div>
          </div>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Left Sidebar Tools */}
        <div className="lg:col-span-1 space-y-6">
          <div className="glass-card p-6 border border-white/10 space-y-3">
            <h3 className="text-base font-bold text-primary flex items-center gap-2">
              <UploadCloud className="w-5 h-5" /> Import Participants (CSV)
            </h3>
            <p className="text-xs text-foreground/60 leading-relaxed">
              Upload CSV with columns: <strong>Roll Number, Name, Class, Section</strong>.
            </p>

            <input 
              type="file" 
              accept=".csv"
              onChange={handleFileUpload}
              disabled={isUploading}
              className="block w-full text-xs text-foreground/70 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-primary file:text-slate-950 hover:file:bg-yellow-400 cursor-pointer"
            />

            {/* Chunked Upload Progress Indicator */}
            {isUploading && uploadProgress && (
              <div className="space-y-1.5 pt-2">
                <div className="flex justify-between text-xs text-primary font-semibold">
                  <span>Uploading Chunks...</span>
                  <span>{uploadProgress.current} / {uploadProgress.total}</span>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-white/10">
                  <div 
                    className="bg-primary h-full transition-all duration-300"
                    style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="glass-card p-6 border border-white/10 space-y-3">
            <h3 className="text-base font-bold text-primary flex items-center gap-2">
              <Download className="w-5 h-5" /> Export Reports
            </h3>
            <p className="text-xs text-foreground/60 leading-relaxed">
              Download the live leaderboard report with WPM, Accuracy, and Status.
            </p>
            <button 
              onClick={exportExcel} 
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-lg border border-white/10 transition-colors text-xs flex items-center justify-center gap-2"
            >
              Export Excel (.xlsx)
            </button>
          </div>
        </div>

        {/* Right Main Table */}
        <div className="lg:col-span-3">
          <div className="glass-card p-6 border border-white/10 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                  Live Leaderboard & Telemetry
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
                </h2>
                <p className="text-xs text-foreground/60">Throttled live sync for smooth performance during peak exams</p>
              </div>

              {/* Table Search */}
              <div className="relative w-full sm:w-60">
                <Search className="w-4 h-4 text-foreground/40 absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                  type="text" 
                  placeholder="Search student..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full glass-input pl-9 pr-3 py-2 rounded-lg text-xs outline-none"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs uppercase font-bold text-primary tracking-wider">
                    <th className="p-3">Rank</th>
                    <th className="p-3">Candidate Name</th>
                    <th className="p-3">Roll No</th>
                    <th className="p-3">WPM</th>
                    <th className="p-3">Accuracy</th>
                    <th className="p-3">Errors</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredParticipants.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-foreground/40 text-xs">
                        No participants found matching your criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredParticipants.map((p, idx) => (
                      <tr key={p.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="p-3 font-mono font-bold text-foreground/70">{p.score ? `#${idx + 1}` : '-'}</td>
                        <td className="p-3 font-bold text-white">{p.name}</td>
                        <td className="p-3 font-mono text-xs text-foreground/80">{p.rollNo}</td>
                        <td className="p-3 font-black text-primary text-base">{p.score?.wpm || 0}</td>
                        <td className="p-3 font-semibold">{p.score?.accuracy || 0}%</td>
                        <td className="p-3 font-semibold text-red-400">{p.score?.errors || 0}</td>
                        <td className="p-3">
                          <span className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold ${
                            p.status === 'Completed' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                            p.status === 'Disqualified' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-slate-800 text-foreground/60 border border-white/10'
                          }`}>
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
