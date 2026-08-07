'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc, collection, query, onSnapshot, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Competition, Participant } from '@/types';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import Link from 'next/link';

export default function CompetitionManage({ params }: { params: { compId: string } }) {
  const [comp, setComp] = useState<Competition | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    // Basic Auth Check
    if (!sessionStorage.getItem('admin_auth')) {
      window.location.href = '/';
      return;
    }

    // Fetch Competition details once (or live)
    const unsubscribeComp = onSnapshot(doc(db, 'competitions', params.compId), (doc) => {
      if (doc.exists()) setComp({ id: doc.id, ...doc.data() } as Competition);
    });

    // Fetch Participants live
    const q = query(collection(db, `competitions/${params.compId}/participants`));
    const unsubscribeParts = onSnapshot(q, (snapshot) => {
      const pData: Participant[] = [];
      snapshot.forEach(d => pData.push({ id: d.id, ...d.data() } as Participant));
      
      // Sort leaderboard
      pData.sort((a, b) => {
        if (!a.score) return 1;
        if (!b.score) return -1;
        if (b.score.wpm !== a.score.wpm) return b.score.wpm - a.score.wpm;
        return b.score.accuracy - a.score.accuracy;
      });
      
      setParticipants(pData);
      setLoading(false);
    });

    return () => { unsubscribeComp(); unsubscribeParts(); };
  }, [params.compId]);

  const toggleStatus = async () => {
    if (!comp) return;
    const nextStatus = comp.status === 'Upcoming' ? 'Live' : comp.status === 'Live' ? 'Ended' : 'Upcoming';
    await updateDoc(doc(db, 'competitions', comp.id), { status: nextStatus });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const batch = writeBatch(db);
          let count = 0;
          for (const row of results.data as any[]) {
            const rollNo = row['Roll Number'] || row['Roll No'] || row['Roll'];
            const name = row['Student Name'] || row['Name'];
            const cls = row['Class'] || '';
            const sec = row['Section'] || '';
            
            if (rollNo && name) {
              const pRef = doc(db, `competitions/${comp!.id}/participants`, rollNo.toString().toUpperCase());
              batch.set(pRef, {
                rollNo: rollNo.toString().toUpperCase(),
                name,
                class: cls,
                section: sec,
                isRegistered: true,
                hasParticipated: false,
                status: 'Pending',
                warnings: 0
              });
              count++;
            }
          }
          await batch.commit();
          alert(`Successfully registered ${count} students!`);
        } catch (err) {
          console.error(err);
          alert("Error uploading CSV data.");
        } finally {
          setIsUploading(false);
          e.target.value = ''; // Reset input
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
      Status: p.status
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Leaderboard");
    XLSX.writeFile(wb, `${comp?.name.replace(/\s+/g, '_')}_Leaderboard.xlsx`);
  };

  if (loading || !comp) return <div className="mt-10 animate-pulse text-xl">Loading Management Portal...</div>;

  return (
    <div className="w-full max-w-7xl mt-4">
      <Link href="/admin" className="text-foreground/60 hover:text-primary mb-4 inline-block">← Back to Dashboard</Link>
      
      <div className="glass-card p-8 mb-8 flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">{comp.name}</h1>
          <p className="text-foreground/70">ID: {comp.password} • Duration: {Math.floor(comp.duration / 60)}m</p>
        </div>
        <div className="flex gap-4 items-center">
          <button 
            onClick={toggleStatus}
            className={`font-bold px-6 py-3 rounded shadow-lg transition-colors ${
              comp.status === 'Live' ? 'bg-error text-white' : 'bg-green-500 text-white'
            }`}
          >
            {comp.status === 'Upcoming' ? 'Start Competition (Go Live)' : comp.status === 'Live' ? 'End Competition' : 'Reset to Upcoming'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Left Sidebar Tools */}
        <div className="lg:col-span-1 space-y-6">
          <div className="glass-card p-6">
            <h3 className="text-lg font-bold text-primary mb-4">Upload Participants</h3>
            <p className="text-sm text-foreground/60 mb-4">Upload a CSV with columns: Roll Number, Name, Class, Section.</p>
            <input 
              type="file" 
              accept=".csv"
              onChange={handleFileUpload}
              disabled={isUploading}
              className="block w-full text-sm text-foreground/70 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-background hover:file:bg-yellow-400 cursor-pointer"
            />
            {isUploading && <p className="text-xs text-primary mt-2">Uploading to Firestore...</p>}
          </div>

          <div className="glass-card p-6">
            <h3 className="text-lg font-bold text-primary mb-4">Export Reports</h3>
            <button onClick={exportExcel} className="w-full bg-white/10 hover:bg-white/20 text-white py-3 rounded transition-colors font-bold flex items-center justify-center gap-2">
              Export Excel (.xlsx)
            </button>
          </div>
        </div>

        {/* Right Main Table */}
        <div className="lg:col-span-3">
          <div className="glass-card p-6 overflow-x-auto">
            <h2 className="text-2xl font-bold text-white mb-6">Live Leaderboard & Participants</h2>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-primary">
                  <th className="p-3">Rank</th>
                  <th className="p-3">Name</th>
                  <th className="p-3">Roll No</th>
                  <th className="p-3">WPM</th>
                  <th className="p-3">Acc</th>
                  <th className="p-3">Errors</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {participants.length === 0 ? (
                  <tr><td colSpan={7} className="p-8 text-center text-foreground/50">No participants registered yet.</td></tr>
                ) : (
                  participants.map((p, idx) => (
                    <tr key={p.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="p-3 font-bold text-foreground/70">{p.score ? `#${idx + 1}` : '-'}</td>
                      <td className="p-3 font-bold text-white">{p.name}</td>
                      <td className="p-3 font-mono text-sm text-foreground/80">{p.rollNo}</td>
                      <td className="p-3 font-bold text-primary">{p.score?.wpm || 0}</td>
                      <td className="p-3">{p.score?.accuracy || 0}%</td>
                      <td className="p-3 text-error">{p.score?.errors || 0}</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          p.status === 'Completed' ? 'bg-green-500/20 text-green-400' :
                          p.status === 'Disqualified' ? 'bg-red-500/20 text-red-400' : 'bg-gray-500/20 text-gray-400'
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
  );
}
