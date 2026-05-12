import { isGenerateImageModel } from '@renderer/config/models'
import { useAllProviders } from '@renderer/hooks/useProvider'
import { Provider } from '@renderer/types'
import { useMemo } from 'react'

/** Provider types that support OpenAI-compatible image generation API */
const OPENAI_COMPATIBLE_PROVIDER_TYPES = ['openai', 'openai-response', 'azure-openai']

/** Hardcoded painting provider IDs (existing dedicated painting pages) */
export const BUILTIN_PAINTING_PROVIDER_IDS = ['zhipu', 'aihubmix', 'silicon', 'dmxapi', 'tokenflux', 'new-api']

function hasImageCapableModel(provider: Provider): boolean {
  return provider.models.some(
    (model) =>
      // Check via capabilities (new system)
      model.capabilities?.some((c) => c.type === 'image' && c.isUserSelected !== false) ||
      // Fallback: check via regex-based detection
      isGenerateImageModel(model)
  )
}

export interface ImageCapableProvider {
  id: string
  name: string
  provider: Provider
  isBuiltin: boolean
}

/**
 * Returns all providers that can be used for painting.
 * Combines hardcoded painting providers with dynamically discovered
 * OpenAI-compatible providers that have image-capable models.
 */
export function useImageCapableProviders(): ImageCapableProvider[] {
  const allProviders = useAllProviders()

  return useMemo(() => {
    const result: ImageCapableProvider[] = []

    // Add all builtin painting providers
    for (const id of BUILTIN_PAINTING_PROVIDER_IDS) {
      const provider = allProviders.find((p) => p.id === id)
      if (provider) {
        result.push({ id: provider.id, name: provider.name, provider, isBuiltin: true })
      }
    }

    // Add OpenAI-compatible providers with image-capable models (non-builtin)
    for (const provider of allProviders) {
      if (BUILTIN_PAINTING_PROVIDER_IDS.includes(provider.id)) continue
      if (!OPENAI_COMPATIBLE_PROVIDER_TYPES.includes(provider.type)) continue
      if (!provider.enabled) continue
      if (hasImageCapableModel(provider)) {
        result.push({ id: provider.id, name: provider.name, provider, isBuiltin: false })
      }
    }

    return result
  }, [allProviders])
}
