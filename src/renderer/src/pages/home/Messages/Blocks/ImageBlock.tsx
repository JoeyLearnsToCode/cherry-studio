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
    logger.error('Incremental download failed:', error as Error)
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

const ImageBlock: React.FC<Props> = ({ block, isSingle = false }) => {
  const store = useAppStore()
  const downloadAttempted = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 图片本地化：流完成后或重新打开聊天时，检测并下载远程图片到本地
  // 使用短延迟避免与 imageCallbacks.onImageGenerated 的并发下载（产生重复文件）
  useEffect(() => {
    if (downloadAttempted.current) return
    if (block.status !== MessageBlockStatus.STREAMING && block.status !== MessageBlockStatus.SUCCESS) return

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

    downloadAttempted.current = true
    // 短延迟：让 imageCallbacks.onImageGenerated 的后台下载先完成
    // 如果 onImageGenerated 已更新 localFiles，missingIndices 为空，不会重复下载
    timerRef.current = setTimeout(() => {
      // 重新获取最新的 block 状态
      const latestBlock = store.getState().messageBlocks.entities[block.id] as ImageMessageBlock | undefined
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
              id: block.id,
              changes: {
                metadata: updatedMetadata
              } as Partial<ImageMessageBlock>
            })
          )
          // 持久化到 Dexie，确保重启后不需要重新下载
          db.message_blocks.update(block.id, { metadata: updatedMetadata } as any).catch(() => {})
        }
      })
    }, 1000)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [block.id, block.metadata, block.status, store])

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
