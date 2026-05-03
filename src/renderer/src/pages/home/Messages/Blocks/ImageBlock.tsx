import { loggerService } from '@logger'
import ImageViewer from '@renderer/components/ImageViewer'
import db from '@renderer/databases'
import FileManager from '@renderer/services/FileManager'
import { useAppStore } from '@renderer/store'
import { updateOneBlock } from '@renderer/store/messageBlock'
import { FileMetadata } from '@renderer/types'
import { type ImageMessageBlock, MessageBlockStatus } from '@renderer/types/newMessage'
import { Skeleton } from 'antd'
import React, { useEffect, useRef } from 'react'
import styled from 'styled-components'

const logger = loggerService.withContext('ImageBlock')

interface Props {
  block: ImageMessageBlock
  isSingle?: boolean
}

async function downloadImageToLocal(imageSrc: string): Promise<FileMetadata | null> {
  try {
    if (imageSrc.startsWith('data:')) {
      return await window.api.file.saveBase64ImageLocal(imageSrc)
    } else {
      return await window.api.file.downloadImage(imageSrc)
    }
  } catch (error) {
    logger.error('Download image to local failed:', error as Error)
    return null
  }
}

function getImageSources(block: ImageMessageBlock): string[] {
  const { metadata, file } = block
  const localFiles = metadata?.localFiles
  const generateImages = metadata?.generateImageResponse?.images

  // Priority 1: user-uploaded file
  if (!generateImages?.length && file) {
    return [`file://${FileManager.getFilePath(file)}`]
  }

  if (!generateImages?.length) return []

  return generateImages.map((imageSrc, index) => {
    // Priority: local file > remote URL/base64
    const localFile = localFiles?.[index]
    if (localFile) {
      return `file://${FileManager.getFilePath(localFile)}`
    }
    return imageSrc
  })
}

function doLocalizeImages(blockId: string, store: ReturnType<typeof useAppStore>) {
  const latestBlock = store.getState().messageBlocks.entities[blockId] as ImageMessageBlock | undefined
  if (!latestBlock?.metadata?.generateImageResponse?.images?.length) return

  const latestLocalFiles = latestBlock.metadata?.localFiles
  const latestMissingIndices: number[] = []
  latestBlock.metadata.generateImageResponse.images.forEach((_, index) => {
    if (!latestLocalFiles?.[index]) {
      latestMissingIndices.push(index)
    }
  })

  if (latestMissingIndices.length === 0) return

  const newLocalFiles: (FileMetadata | null)[] = [
    ...(latestLocalFiles || latestBlock.metadata.generateImageResponse.images.map(() => null))
  ]

  Promise.all(
    latestMissingIndices.map(async (index) => {
      const file = await downloadImageToLocal(latestBlock.metadata!.generateImageResponse!.images[index])
      return { index, file }
    })
  ).then((results) => {
    let hasUpdate = false
    for (const { index, file } of results) {
      if (file) {
        newLocalFiles[index] = file
        hasUpdate = true
      }
    }

    if (hasUpdate) {
      const updatedMetadata = { ...latestBlock.metadata, localFiles: newLocalFiles }
      store.dispatch(
        updateOneBlock({
          id: blockId,
          changes: {
            metadata: updatedMetadata
          } as Partial<ImageMessageBlock>
        })
      )
      // 持久化到 Dexie，确保重启后不需要重新下载
      db.message_blocks.update(blockId, { metadata: updatedMetadata } as any).catch(() => {})
    }
  })
}

const ImageBlock: React.FC<Props> = ({ block, isSingle = false }) => {
  const store = useAppStore()
  const localizeAttempted = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 追踪是否在本次组件生命周期内经历过流式渲染
  // 用于区分"流式响应期间"和"打开会话时加载已有数据"两种场景
  const seenStreaming = useRef(false)

  // 图片本地化兜底：打开会话时检查是否有未本地化的图片
  // 主要逻辑在 imageCallbacks.onImageGenerated 中执行，这里仅作兜底
  useEffect(() => {
    if (localizeAttempted.current) return
    if (block.status !== MessageBlockStatus.SUCCESS) return

    const { metadata } = block
    const generateImages = metadata?.generateImageResponse?.images
    if (!generateImages?.length) return

    const localFiles = metadata?.localFiles
    const missingIndices: number[] = []
    generateImages.forEach((_, index) => {
      if (!localFiles?.[index]) {
        missingIndices.push(index)
      }
    })

    if (missingIndices.length === 0) return

    localizeAttempted.current = true

    if (seenStreaming.current) {
      // 流式响应期间：延迟执行，给 imageCallbacks 的后台下载留时间
      timerRef.current = setTimeout(() => {
        doLocalizeImages(block.id, store)
      }, 2000)
    } else {
      // 打开会话加载：直接执行，无需等待
      doLocalizeImages(block.id, store)
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [block.id, block.metadata, block.status, store])

  // 追踪流式状态变化
  if (block.status === MessageBlockStatus.STREAMING) {
    seenStreaming.current = true
  }

  if (block.status === MessageBlockStatus.PENDING) {
    return <Skeleton.Image active style={{ width: 200, height: 200 }} />
  }

  if (block.status === MessageBlockStatus.STREAMING || block.status === MessageBlockStatus.SUCCESS) {
    const images = getImageSources(block)

    return (
      <Container>
        {images.map((src, index) => (
          <ImageViewer
            src={src}
            key={`image-${index}`}
            style={
              isSingle
                ? { maxWidth: 500, maxHeight: 'min(500px, 50vh)', padding: 0, borderRadius: 8 }
                : { width: 280, height: 280, objectFit: 'cover', padding: 0, borderRadius: 8 }
            }
          />
        ))}
      </Container>
    )
  }

  return null
}

const Container = styled.div`
  display: block;
`
export default React.memo(ImageBlock)
