import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { emailAccountsApi } from '@/api/endpoints/email'
import { toast } from '@/stores/toast-store'
import {
  toEmailAccountForm,
  type EmailAccountFormState,
} from '@/components/settings/settings-format'

/**
 * Email accounts: the `/email/accounts` list, the selected-account editor form,
 * and the save mutation that enforces the brand-persona mapping.
 *
 * Query key (`['settings-email-accounts']`), 30s refetch, and the
 * `whatsappAccountId` validation ('' → null, Number.isFinite) are preserved
 * verbatim — the validation gates real sends.
 */
export function useEmailAccounts() {
  const queryClient = useQueryClient()

  const { data: rawEmailAccounts, isLoading: emailAccountsLoading } = useQuery({
    queryKey: ['settings-email-accounts'],
    queryFn: async () => {
      const res = await emailAccountsApi.list()
      if (!Array.isArray(res)) return []
      return res
    },
    refetchInterval: 30_000,
  })

  const emailAccounts = useMemo(
    () => (Array.isArray(rawEmailAccounts) ? rawEmailAccounts : []),
    [rawEmailAccounts],
  )
  const unmappedEmailAccounts = useMemo(
    () => emailAccounts.filter((acc) => acc.whatsappAccountId == null),
    [emailAccounts],
  )

  const [selectedEmailAccountId, setSelectedEmailAccountId] = useState<number | null>(null)
  const selectedEmailAccount =
    emailAccounts.find((acc) => acc.id === selectedEmailAccountId) ?? null

  const [emailAccountForm, setEmailAccountForm] = useState<EmailAccountFormState | null>(null)

  useEffect(() => {
    if (!selectedEmailAccountId && emailAccounts.length > 0) {
      setSelectedEmailAccountId(emailAccounts[0].id)
    }
  }, [emailAccounts, selectedEmailAccountId])

  useEffect(() => {
    if (selectedEmailAccount) {
      setEmailAccountForm(toEmailAccountForm(selectedEmailAccount))
    } else {
      setEmailAccountForm(null)
    }
  }, [selectedEmailAccount])

  const emailAccountMutation = useMutation({
    mutationFn: async () => {
      if (!selectedEmailAccount || !emailAccountForm) {
        throw new Error('No email account selected')
      }
      const hourlyLimitNum = Number(emailAccountForm.hourlyLimit)
      const dailyLimitNum = Number(emailAccountForm.dailyLimit)
      const waIdRaw = emailAccountForm.whatsappAccountId.trim()
      const whatsappAccountId = waIdRaw === '' ? null : Number(waIdRaw)
      if (
        whatsappAccountId !== null &&
        (!Number.isFinite(whatsappAccountId) || whatsappAccountId < 1)
      ) {
        throw new Error('Brand persona must be a valid WhatsApp account or unset')
      }
      return emailAccountsApi.update(selectedEmailAccount.id, {
        name: emailAccountForm.name,
        senderName: emailAccountForm.senderName,
        signature: emailAccountForm.signature,
        hourlyLimit: Number.isFinite(hourlyLimitNum) ? hourlyLimitNum : undefined,
        dailyLimit: Number.isFinite(dailyLimitNum) ? dailyLimitNum : undefined,
        whatsappAccountId,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-email-accounts'] })
      toast.success('Email account saved')
    },
    onError: (e: Error) => toast.error(`Failed to save email account: ${e.message}`),
  })

  return {
    emailAccounts,
    emailAccountsLoading,
    unmappedEmailAccounts,
    selectedEmailAccountId,
    setSelectedEmailAccountId,
    selectedEmailAccount,
    emailAccountForm,
    setEmailAccountForm,
    emailAccountMutation,
  }
}
