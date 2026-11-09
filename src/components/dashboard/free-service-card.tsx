'use client'

import { useCallback, useEffect, useState } from 'react'
import { MessageCircle, RotateCcw, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { loadFreeServiceUsage } from '@/lib/dashboard/queries'
import type { FreeServiceUsage } from '@/lib/dashboard/types'
import { SkeletonCard } from './skeleton'

const RESET_STORAGE_PREFIX = 'wacrm:free-service-reset:'

function resetStorageKey(accountId: string): string {
  return `${RESET_STORAGE_PREFIX}${accountId}`
}

function readResetAt(accountId: string): Date | null {
  try {
    const raw = localStorage.getItem(resetStorageKey(accountId))
    if (!raw) return null
    const parsed = new Date(raw)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  } catch {
    // localStorage can throw in private-browsing / sandboxed contexts.
    return null
  }
}

/**
 * Current-month count of outgoing free-form messages (agent + bot,
 * excluding templates). The reset button starts a fresh window from
 * "now"; the month boundary still resets automatically.
 *
 * NOTE: the manual reset is stored per account in localStorage, i.e.
 * device-scoped. Persisting it across devices would need a schema column
 * (deliberately out of scope for this change).
 */
export function FreeServiceCard() {
  const t = useTranslations('Dashboard.freeService')
  const { accountId } = useAuth()

  const [usage, setUsage] = useState<FreeServiceUsage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [resetting, setResetting] = useState(false)

  const load = useCallback(async () => {
    if (!accountId) return
    try {
      const next = await loadFreeServiceUsage(
        createClient(),
        readResetAt(accountId),
      )
      setUsage(next)
      setError(false)
    } catch (err) {
      console.error('[dashboard] free-service usage failed:', err)
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => {
    void load()
  }, [load])

  const handleReset = useCallback(async () => {
    if (!accountId || resetting) return
    setResetting(true)
    try {
      localStorage.setItem(
        resetStorageKey(accountId),
        new Date().toISOString(),
      )
    } catch {
      // Persistence is best-effort; still refresh the count below.
    }
    await load()
    toast.success(t('resetSuccess'))
    setResetting(false)
  }, [accountId, resetting, load, t])

  if (loading) return <SkeletonCard />

  const sinceLabel = usage
    ? new Date(usage.since).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
    : ''

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-muted-foreground">
          {t('title')}
        </p>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <MessageCircle className="h-4 w-4" />
        </div>
      </div>

      <p className="mt-3 text-[28px] leading-none font-bold tabular-nums text-foreground">
        {error || !usage ? '—' : usage.count.toLocaleString()}
      </p>

      <p className="mt-2 text-sm text-muted-foreground">
        {error
          ? t('loadError')
          : usage
            ? t('subtitle', { date: sinceLabel })
            : ''}
      </p>

      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleReset}
          disabled={resetting || !accountId}
          className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          {resetting ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RotateCcw className="h-3 w-3" />
          )}
          {t('reset')}
        </button>
        {usage?.reset && (
          <span className="text-[10px] text-muted-foreground">
            {t('customWindow')}
          </span>
        )}
      </div>
    </div>
  )
}
