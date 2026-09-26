import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { toast } from '@/stores/toast-store'

export interface SystemConfig {
  [key: string]: string | number | boolean | undefined
  waMaxMessages?: number
  waWarmupMode?: boolean
}

export interface BrandConfig {
  brandName: string
  tagline: string
  businessName: string
  businessCity: string
  businessCountry: string
  businessIndustry: string
  businessCertifications: string
  personaName: string
  personaGender: string
  personaTitle: string
  timezone: string
}

/**
 * Workspace identity + global automation defaults: the `/config` and
 * `/config/brand` queries, their form-state hydrators, and the two save
 * mutations. Used by the Workspace settings section.
 *
 * Query keys, payloads, and toasts are preserved verbatim from the former
 * monolithic settings.tsx — do not change them or the cache behaviour drifts.
 */
export function useWorkspaceConfig() {
  const queryClient = useQueryClient()
  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ['config'],
    queryFn: async () => {
      const res = await api.get<SystemConfig>('/config')
      if (!res) throw new Error('Empty response')
      return res
    },
  })

  const { data: brand, isLoading: brandLoading } = useQuery({
    queryKey: ['brand'],
    queryFn: async () => {
      const res = await api.get<BrandConfig>('/config/brand')
      if (!res) throw new Error('Empty response')
      return res
    },
  })

  // Every editable workspace field, keyed by its env-var name. Saved values
  // live in the database; see src/services/workspaceProfile.js.
  const { data: profile } = useQuery({
    queryKey: ['workspace-profile'],
    queryFn: async () => {
      const res = await api.get<Record<string, string>>('/workspace/profile')
      if (!res) throw new Error('Empty response')
      return res
    },
  })

  const [envForm, setEnvForm] = useState<Record<string, string>>({})
  const [configForm, setConfigForm] = useState<Record<string, string>>({})

  useEffect(() => {
    if (profile) setEnvForm({ ...profile })
  }, [profile])

  useEffect(() => {
    if (config) {
      setConfigForm({
        WA_DAILY_LIMIT: String(config.waMaxMessages ?? '200'),
        WA_MIN_DELAY: String(config.WA_MIN_DELAY ?? '30'),
        WA_MAX_DELAY: String(config.WA_MAX_DELAY ?? '90'),
        WARMUP_MODE: String(config.waWarmupMode ?? 'false'),
      })
    }
  }, [config])

  const envMutation = useMutation({
    mutationFn: (data: Record<string, string>) => api.put('/workspace/profile', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-profile'] })
      queryClient.invalidateQueries({ queryKey: ['brand'] })
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })
      toast.success('Workspace profile saved')
    },
    onError: (e: Error) => toast.error(`Failed to save workspace profile: ${e.message}`),
  })

  const configMutation = useMutation({
    mutationFn: (data: Record<string, string>) => api.patch('/config', data),
    onSuccess: () => toast.success('Global automation defaults saved'),
    onError: (e: Error) => toast.error(`Failed to save defaults: ${e.message}`),
  })

  return {
    config,
    brand,
    configLoading,
    brandLoading,
    envForm,
    setEnvForm,
    configForm,
    setConfigForm,
    envMutation,
    configMutation,
  }
}
