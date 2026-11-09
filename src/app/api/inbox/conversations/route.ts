import { NextResponse } from 'next/server'

import { requireRole, toErrorResponse } from '@/lib/auth/account'

/**
 * Delete one or more conversations (and, by cascade, all of their
 * messages/reactions/notifications). Used by the Inbox row delete and
 * the "select all → delete" bulk action.
 *
 * `deals.conversation_id` has a plain FK (no ON DELETE action), so it
 * must be detached before the conversations can be removed. Flow runs
 * and AI logs are already ON DELETE SET NULL.
 */
export async function DELETE(request: Request) {
  try {
    const ctx = await requireRole('agent')

    const body = (await request.json().catch(() => null)) as {
      ids?: unknown
    } | null

    const ids = Array.isArray(body?.ids)
      ? [
          ...new Set(
            body.ids
              .filter((id): id is string => typeof id === 'string')
              .map((id) => id.trim())
              .filter(Boolean),
          ),
        ]
      : []

    if (ids.length === 0) {
      return NextResponse.json(
        { error: 'At least one conversation id is required' },
        { status: 400 },
      )
    }

    const { error: detachError } = await ctx.supabase
      .from('deals')
      .update({ conversation_id: null })
      .in('conversation_id', ids)
      .eq('account_id', ctx.accountId)

    if (detachError) {
      console.error('[inbox/conversations] failed to detach deals:', detachError)
      return NextResponse.json(
        { error: 'Failed to delete conversations' },
        { status: 500 },
      )
    }

    const { data, error: deleteError } = await ctx.supabase
      .from('conversations')
      .delete()
      .in('id', ids)
      .eq('account_id', ctx.accountId)
      .select('id')

    if (deleteError) {
      console.error('[inbox/conversations] delete failed:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete conversations' },
        { status: 500 },
      )
    }

    const deletedIds = (data ?? []).map((row) => row.id)

    return NextResponse.json({
      ok: true,
      deleted: deletedIds.length,
      ids: deletedIds,
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}
