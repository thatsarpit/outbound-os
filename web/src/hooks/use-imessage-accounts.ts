import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { imessageAccountsApi } from '@/api/endpoints/imessage'
import { toast } from '@/stores/toast-store'

export type IMessageFormState = {
  name: string
  serverUrl: string
  password: string
  appleId: string
  hourlyLimit: string
  dailyLimit: string
  enabled: boolean
}

export const emptyIMessageForm: IMessageFormState = {
  name: '',
  serverUrl: '',
  password: '',
  appleId: '',
  hourlyLimit: '15',
  dailyLimit: '100',
  enabled: true,
}

/**
 * iMessage (BlueBubbles) servers: the `/imessage/accounts` list, the add/edit
 * form, and the create / update / delete / ping mutations.
 *
 * CRITICAL: the password is write-only. The form hydrator keeps it blank (the
 * API never returns it), and update only sends a password when the operator
 * typed a new one. Preserve this exactly — hydrating it would push an empty or
 * garbage password into the encrypted column.
 */
export function useIMessageAccounts() {
  const queryClient = useQueryClient()

  const { data: rawIMessageAccounts } = useQuery({
    queryKey: ['settings-imessage-accounts'],
    queryFn: async () => {
      const res = await imessageAccountsApi.list()
      if (!Array.isArray(res)) return []
      return res
    },
    refetchInterval: 30_000,
  })

  const imessageAccounts = useMemo(
    () => (Array.isArray(rawIMessageAccounts) ? rawIMessageAccounts : []),
    [rawIMessageAccounts],
  )

  const [selectedIMessageAccountId, setSelectedIMessageAccountId] = useState<number | null>(null)
  const selectedIMessageAccount =
    imessageAccounts.find((acc) => acc.id === selectedIMessageAccountId) ?? null
  const [showAddIMessage, setShowAddIMessage] = useState(false)

  const [imessageForm, setIMessageForm] = useState<IMessageFormState>(emptyIMessageForm)
  // When the user picks an account, hydrate the form (password stays blank — never returned by the API)
  useEffect(() => {
    if (selectedIMessageAccount) {
      setIMessageForm({
        name: selectedIMessageAccount.name,
        serverUrl: selectedIMessageAccount.serverUrl,
        password: '',
        appleId: selectedIMessageAccount.appleId || '',
        hourlyLimit: String(selectedIMessageAccount.hourlyLimit ?? 15),
        dailyLimit: String(selectedIMessageAccount.dailyLimit ?? 100),
        enabled: selectedIMessageAccount.enabled,
      })
    }
  }, [selectedIMessageAccount])

  const imessageCreateMutation = useMutation({
    mutationFn: () => {
      if (!imessageForm.name.trim()) throw new Error('Server name is required')
      if (!imessageForm.serverUrl.trim()) throw new Error('Server URL is required')
      if (!imessageForm.password.trim()) throw new Error('BlueBubbles password is required')
      return imessageAccountsApi.create({
        name: imessageForm.name.trim(),
        serverUrl: imessageForm.serverUrl.trim(),
        password: imessageForm.password,
        appleId: imessageForm.appleId.trim(),
        hourlyLimit: Number(imessageForm.hourlyLimit) || 15,
        dailyLimit: Number(imessageForm.dailyLimit) || 100,
        enabled: imessageForm.enabled,
      })
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['settings-imessage-accounts'] })
      if (created) setSelectedIMessageAccountId(created.id)
      setShowAddIMessage(false)
      setIMessageForm(emptyIMessageForm)
      toast.success('iMessage server added — pinging now…')
    },
  })

  const imessageUpdateMutation = useMutation({
    mutationFn: () => {
      if (!selectedIMessageAccount) throw new Error('No iMessage server selected')
      return imessageAccountsApi.update(selectedIMessageAccount.id, {
        name: imessageForm.name.trim(),
        serverUrl: imessageForm.serverUrl.trim(),
        // Only send password if the operator typed a new one — otherwise keep the encrypted value on the server
        ...(imessageForm.password.trim() ? { password: imessageForm.password } : {}),
        appleId: imessageForm.appleId.trim(),
        hourlyLimit: Number(imessageForm.hourlyLimit) || 15,
        dailyLimit: Number(imessageForm.dailyLimit) || 100,
        enabled: imessageForm.enabled,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-imessage-accounts'] })
      setIMessageForm((prev) => ({ ...prev, password: '' }))
      toast.success('iMessage server saved')
    },
  })

  const imessageDeleteMutation = useMutation({
    mutationFn: (id: number) => imessageAccountsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-imessage-accounts'] })
      setSelectedIMessageAccountId(null)
      toast.success('iMessage server removed')
    },
  })

  const imessagePingMutation = useMutation({
    mutationFn: (id: number) => imessageAccountsApi.ping(id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['settings-imessage-accounts'] })
      toast[res?.online ? 'success' : 'warning'](
        res?.online ? 'BlueBubbles server is online' : 'BlueBubbles server did not respond',
      )
    },
  })

  return {
    imessageAccounts,
    selectedIMessageAccountId,
    setSelectedIMessageAccountId,
    selectedIMessageAccount,
    showAddIMessage,
    setShowAddIMessage,
    imessageForm,
    setIMessageForm,
    emptyIMessageForm,
    imessageCreateMutation,
    imessageUpdateMutation,
    imessageDeleteMutation,
    imessagePingMutation,
  }
}
