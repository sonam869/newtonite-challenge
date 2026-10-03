'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading) {
      router.replace(user ? '/dashboard' : '/login');
    }
  }, [user, loading, router]);
  return null;
}
