import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

import { requireRole, toErrorResponse } from '@/lib/auth/account'
import {
  BLOCKED_TAG_COLOR,
  BLOCKED_TAG_NAME,
} from '@/lib/contacts/blocked'
import { supabaseAdmin } from '@/lib/flows/admin-client'

async function findBlockedTagId(
  db: SupabaseClient,
  accountId: string,
): Promise<string | null> {
  const { data } = await db
    .from('tags')
    .select('id')
    .eq('account_id', accountId)
    .ilike('name', BLOCKED_TAG_NAME)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return data?.id ?? null
}

/**
 * Resolve the reserved "Blocked" tag, creating it on first use. Tag
 * creation is admin-only under RLS, so an agent blocking a contact
 * needs the service-role client for this one insert.
 */
async function ensureBlockedTagId(
  accountId: string,
  userId: string,
): Promise<string> {
  const admin = supabaseAdmin()
  const existing = await findBlockedTagId(admin, accountId)
  if (existing) return existing

  const { data, error } = await admin
    .from('tags')
    .insert({
      account_id: accountId,
      user_id: userId,
      name: BLOCKED_TAG_NAME,
      color: BLOCKED_TAG_COLOR,
    })
    .select('id')
    .single()

  if (error || !data) {
    console.error('[contacts/block] failed to create Blocked tag:', error)
    throw new Error('Failed to prepare the Blocked tag')
  }

  return data.id
}

async function assertContactInAccount(
  db: SupabaseClient,
  accountId: string,
  contactId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from('contacts')
    .select('id')
    .eq('id', contactId)
    .eq('account_id', accountId)
    .maybeSingle()

  if (error) {
    console.error('[contacts/block] contact lookup failed:', error)
    throw new Error('Could not verify contact')
  }
  return Boolean(data)
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole('agent')
    const { id: contactId } = await params

    if (!(await assertContactInAccount(ctx.supabase, ctx.accountId, contactId))) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    const tagId = await ensureBlockedTagId(ctx.accountId, ctx.userId)
    const { error } = await ctx.supabase
      .from('contact_tags')
      .insert({ contact_id: contactId, tag_id: tagId })

    // Already blocked — the unique (contact_id, tag_id) constraint makes
    // the second insert a harmless no-op.
    if (error && error.code !== '23505') {
      console.error('[contacts/block] failed to add Blocked tag:', error)
      return NextResponse.json(
        { error: 'Failed to block contact' },
        { status: 500 },
      )
    }

    return NextResponse.json({ ok: true, blocked: true, tag_id: tagId })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole('agent')
    const { id: contactId } = await params

    if (!(await assertContactInAccount(ctx.supabase, ctx.accountId, contactId))) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    const tagId = await findBlockedTagId(ctx.supabase, ctx.accountId)
    if (!tagId) return NextResponse.json({ ok: true, blocked: false })

    const { error } = await ctx.supabase
      .from('contact_tags')
      .delete()
      .eq('contact_id', contactId)
      .eq('tag_id', tagId)

    if (error) {
      console.error('[contacts/block] failed to remove Blocked tag:', error)
      return NextResponse.json(
        { error: 'Failed to unblock contact' },
        { status: 500 },
      )
    }

    return NextResponse.json({ ok: true, blocked: false })
  } catch (error) {
    return toErrorResponse(error)
  }
}
