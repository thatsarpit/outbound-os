import { api } from '../client'

export interface WorkspaceMemberOption {
  key: string
  provider: 'local' | 'clerk'
  externalId: string
  orgId: string
  name: string
  email?: string | null
  role: 'admin' | 'manager' | 'agent'
  lastVerifiedAt?: string | null
}

export const workspaceMembersApi = {
  list: async () => {
    const result = await api.get<{ members: WorkspaceMemberOption[] }>('/workspace/members')
    if (!result || !Array.isArray(result.members))
      throw new Error('The team directory returned no data.')
    return result.members
  },
  assign: (leadId: number, memberKey: string | null) =>
    api.post<{ id: number; assignedToId: number | null; assignedMemberKey: string | null }>(
      `/leads/${leadId}/assign`,
      { memberKey },
    ),
}
