'use client';

import { useState, useEffect } from 'react';
import { useAdminAuth } from '@/lib/admin-auth';
import { useRouter } from 'next/navigation';
import { Lock, Eye, EyeOff, ShieldCheck, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function AdminLoginPage() {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  const { login, isAuthenticated, isLoading } = useAdminAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push('/admin');
    }
  }, [isAuthenticated, isLoading, router]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const success = login(password);
    if (success) {
      router.push('/admin');
    } else {
      setError('Invalid admin credentials. Please try again.');
      setSubmitting(false);
    }
  };

  if (isLoading || isAuthenticated) {
    return <div className="mt-20 animate-pulse text-xl text-primary">Redirecting to Dashboard...</div>;
  }

  return (
    <div className="w-full max-w-md mt-10">
      <Link 
        href="/" 
        className="inline-flex items-center gap-2 text-foreground/60 hover:text-primary mb-6 transition-colors text-sm"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Home
      </Link>

      <div className="glass-card p-8 border border-white/10 relative overflow-hidden shadow-2xl">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center mb-4">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">Admin Portal Access</h1>
          <p className="text-sm text-foreground/70">Enter your secure administrator password to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <div className="flex justify-between items-end mb-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-foreground/80">
                Admin Security Password
              </label>
              <span className="text-xs font-mono text-foreground/50 font-medium">
                {password.length > 0 ? `${password.length} chars` : ''}
              </span>
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`w-full bg-background/60 border border-white/10 rounded-lg p-3.5 pr-12 text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-foreground/30 font-sans ${!showPassword && password.length > 0 ? 'text-lg tracking-widest' : ''}`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-foreground/50 hover:text-primary transition-colors p-1"
                aria-label="Toggle password visibility"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm text-center font-medium animate-fadeIn">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-primary text-background font-bold py-3.5 rounded-lg hover:bg-yellow-400 disabled:opacity-50 transition-all duration-200 shadow-[0_0_20px_rgba(226,183,20,0.3)] hover:scale-[1.02] active:scale-[0.98]"
          >
            {submitting ? 'Authenticating...' : 'Authenticate & Unlock'}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-center gap-2 text-xs text-foreground/50">
          <ShieldCheck className="w-4 h-4 text-green-400" /> Protected by Session Security
        </div>
      </div>
    </div>
  );
}
