import { loggerService } from '@logger'
import { useImageCapableProviders } from '@renderer/hooks/useImageCapableProviders'
import { useAppDispatch } from '@renderer/store'
import { setDefaultPaintingProvider } from '@renderer/store/settings'
import { PaintingProvider } from '@renderer/types'
import { FC, useEffect, useMemo } from 'react'
import { Route, Routes, useParams } from 'react-router-dom'

import AihubmixPage from './AihubmixPage'
import DmxapiPage from './DmxapiPage'
import OpenAIImagePage from './OpenAIImagePage'
import NewApiPage from './NewApiPage'
import SiliconPage from './SiliconPage'
import TokenFluxPage from './TokenFluxPage'
import ZhipuPage from './ZhipuPage'

const logger = loggerService.withContext('PaintingsRoutePage')

const PaintingsRoutePage: FC = () => {
  const params = useParams()
  const provider = params['*']
  const dispatch = useAppDispatch()
  const imageCapableProviders = useImageCapableProviders()

  // Build dynamic options list: builtin + dynamically discovered providers
  const Options = useMemo(
    () => imageCapableProviders.map((p) => p.id),
    [imageCapableProviders]
  )

  // Dynamically discovered providers that need OpenAIImagePage
  const dynamicProviders = useMemo(
    () => imageCapableProviders.filter((p) => !p.isBuiltin),
    [imageCapableProviders]
  )

  useEffect(() => {
    logger.debug(`defaultPaintingProvider: ${provider}`)
    if (provider && Options.includes(provider)) {
      dispatch(setDefaultPaintingProvider(provider as PaintingProvider))
    }
  }, [provider, dispatch, Options])

  return (
    <Routes>
      {/* Builtin provider pages */}
      <Route path="*" element={<ZhipuPage Options={Options} />} />
      <Route path="/zhipu" element={<ZhipuPage Options={Options} />} />
      <Route path="/aihubmix" element={<AihubmixPage Options={Options} />} />
      <Route path="/silicon" element={<SiliconPage Options={Options} />} />
      <Route path="/dmxapi" element={<DmxapiPage Options={Options} />} />
      <Route path="/tokenflux" element={<TokenFluxPage Options={Options} />} />
      <Route path="/new-api" element={<NewApiPage Options={Options} />} />
      {/* Dynamic provider pages using OpenAIImagePage */}
      {dynamicProviders.map((p) => (
        <Route key={p.id} path={`/${p.id}`} element={<OpenAIImagePage providerId={p.id} Options={Options} />} />
      ))}
    </Routes>
  )
}

export default PaintingsRoutePage
