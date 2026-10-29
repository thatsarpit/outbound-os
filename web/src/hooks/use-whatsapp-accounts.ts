import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { toast } from '@/stores/toast-store'
import type { WhatsAppAccount } from '@/api/types'
import {
  toAccountForm,
  toDelayJson,
  type AccountFormState,
} from '@/components/settings/settings-format'

export type CloudFormState = {
  provider: 'meta' | 'ycloud'
  ycloudApiKey: string
  ycloudWebhookSecret: string
  ycloudPhoneNumber: string
  ycloudWabaId: string
  metaPhoneNumberId: string
  metaAccessToken: string
  metaWabaId: string
  templateLanguage: string
  defaultCampaignName: string
}

const EMPTY_CLOUD_FORM: CloudFormState = {
  provider: 'meta',
  ycloudApiKey: '',
  ycloudWebhookSecret: '',
  ycloudPhoneNumber: '',
  ycloudWabaId: '',
  metaPhoneNumberId: '',
  metaAccessToken: '',
  metaWabaId: '',
  templateLanguage: 'en',
  defaultCampaignName: '',
}

/**
 * WhatsApp account matrix: the `/whatsapp/accounts` list + per-account editor
 * state (selected account, persona/limits form, Cloud API form) and every
 * mutation (save, provider credentials, enable, disable, delete).
 */
export function useWhatsAppAccounts(timezoneOffset: number) {
  const queryClient = useQueryClient()
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null)

  const { data: rawAccounts, isLoading: accountsLoading } = useQuery({
    queryKey: ['settings-wa-accounts'],
    queryFn: async () => {
      const res = await api.get<WhatsAppAccount[]>(`/whatsapp/accounts?tzOffset=${timezoneOffset}`)
      if (!res) throw new Error('Empty response')
      return res
    },
    refetchInterval: 15_000,
  })

  const accounts = useMemo(() => (Array.isArray(rawAccounts) ? rawAccounts : []), [rawAccounts])
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) ?? null

  const [accountForm, setAccountForm] = useState<AccountFormState | null>(null)
  const [cloudForm, setCloudForm] = useState<CloudFormState>(EMPTY_CLOUD_FORM)
  const initializedAccount = useRef<number | null>(null)

  useEffect(() => {
    if (!selectedAccountId && accounts.length > 0) {
      setSelectedAccountId(accounts[0].id)
    }
  }, [accounts, selectedAccountId])

  useEffect(() => {
    if (selectedAccount && initializedAccount.current !== selectedAccount.id) {
      initializedAccount.current = selectedAccount.id
      setAccountForm(toAccountForm(selectedAccount))
      setCloudForm({
        ...EMPTY_CLOUD_FORM,
        provider: selectedAccount.provider || 'meta',
        ycloudPhoneNumber: selectedAccount.ycloudPhoneNumber || '',
        ycloudWabaId: selectedAccount.ycloudWabaId || '',
        metaPhoneNumberId: selectedAccount.metaPhoneNumberId || '',
        metaWabaId: selectedAccount.metaWabaId || '',
        templateLanguage: selectedAccount.templateLanguage || 'en',
        defaultCampaignName: selectedAccount.defaultCampaignName || '',
      })
    }
  }, [selectedAccount])

  const accountMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAccount || !accountForm) throw new Error('No WhatsApp account selected')
      return api.put(`/whatsapp/accounts/${selectedAccount.id}`, {
        ...accountForm,
        followupDelays: toDelayJson(accountForm.followupDelays),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-wa-accounts'] })
      toast.success('WhatsApp account settings saved')
    },
    onError: (e: Error) => toast.error(`Failed to save account settings: ${e.message}`),
  })

  const cloudMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAccount) throw new Error('No WhatsApp account selected')
      // Secrets are only sent when typed, so saving other fields never
      // requires pasting a token again.
      const payload: Record<string, string> = {
        provider: cloudForm.provider,
        templateLanguage: cloudForm.templateLanguage.trim() || 'en',
        defaultCampaignName: cloudForm.defaultCampaignName.trim(),
      }
      if (cloudForm.provider === 'ycloud') {
        payload.ycloudPhoneNumber = cloudForm.ycloudPhoneNumber.trim()
        payload.ycloudWabaId = cloudForm.ycloudWabaId.trim()
        if (cloudForm.ycloudApiKey.trim()) payload.ycloudApiKey = cloudForm.ycloudApiKey.trim()
        if (cloudForm.ycloudWebhookSecret.trim()) payload.ycloudWebhookSecret = cloudForm.ycloudWebhookSecret.trim()
      } else {
        payload.metaPhoneNumberId = cloudForm.metaPhoneNumberId.trim()
        payload.metaWabaId = cloudForm.metaWabaId.trim()
        if (cloudForm.metaAccessToken.trim()) payload.metaAccessToken = cloudForm.metaAccessToken.trim()
      }
      return api.patch(`/whatsapp/accounts/${selectedAccount.id}/cloud-credentials`, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-wa-accounts'] })
      setCloudForm((prev) => ({
        ...prev,
        metaAccessToken: '',
        ycloudApiKey: '',
        ycloudWebhookSecret: '',
      }))
      toast.success('WhatsApp connection saved')
    },
    onError: (e: Error) => toast.error(`Failed to save WhatsApp connection: ${e.message}`),
    // This hook shows its own message; skip the generic global toast.
    meta: { silent: true },
  })

  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAccount) throw new Error('No WhatsApp account selected')
      return api.post<{ ok: boolean; message: string }>(
        `/whatsapp/accounts/${selectedAccount.id}/test-connection`,
      )
    },
    onSuccess: (res) => toast.success(res?.message || 'WhatsApp connection works'),
    onError: (e: Error) => toast.error(`Connection test failed: ${e.message}`),
    // This hook shows its own message; skip the generic global toast.
    meta: { silent: true },
  })

  const enableMutation = useMutation({
    mutationFn: (accountId: number) => api.post(`/whatsapp/accounts/${accountId}/enable`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-wa-accounts'] })
      toast.success('Account enabled')
    },
    onError: (e: Error) => toast.error(`Failed to enable account: ${e.message}`),
  })

  const disableMutation = useMutation({
    mutationFn: (accountId: number) => api.post(`/whatsapp/accounts/${accountId}/disable`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-wa-accounts'] })
      toast.success('Account disabled')
    },
    onError: (e: Error) => toast.error(`Failed to disable account: ${e.message}`),
  })

  const waDeleteMutation = useMutation({
    mutationFn: (accountId: number) => api.delete(`/whatsapp/accounts/${accountId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-wa-accounts'] })
      setSelectedAccountId(null)
      toast.success('WhatsApp account removed')
    },
    onError: (e: Error) => toast.error(`Failed to remove account: ${e.message}`),
  })

  return {
    accounts,
    accountsLoading,
    selectedAccountId,
    setSelectedAccountId,
    selectedAccount,
    accountForm,
    setAccountForm,
    cloudForm,
    setCloudForm,
    accountMutation,
    cloudMutation,
    testConnectionMutation,
    enableMutation,
    disableMutation,
    waDeleteMutation,
  }
}
