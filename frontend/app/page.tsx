'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth-provider'
export default function Page(){const {user,loading}=useAuth();const router=useRouter();useEffect(()=>{if(!loading)router.replace(user?(user.role==='ADMIN'?'/dashboard':'/my-complaints'):'/login')},[user,loading,router]);return <div className="loading-screen">Loading Residency…</div>}
