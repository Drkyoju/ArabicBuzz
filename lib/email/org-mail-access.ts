import { NextResponse } from 'next/server'
import { isWorkspaceOwnerEmail } from '@/lib/auth/roles'
import { canAccessOpsUi, orgRoleForEmail } from '@/lib/auth/rbac'

/**
 * Org IMAP inbox (info@) is not for ordinary MEMBERs.
 * Owner email or ops-capable roles (manager+) only.
 */
export function forbidOrgMailIfMember(user: {
  id: string
  email?: string | null
}): NextResponse | null {
  const role = orgRoleForEmail(user.email, { userId: user.id })
  if (isWorkspaceOwnerEmail(user.email) || canAccessOpsUi(role)) return null
  return NextResponse.json(
    { error: 'بريد الجمعية للمدير/المالك فقط.', code: 'FORBIDDEN' },
    { status: 403 }
  )
}
