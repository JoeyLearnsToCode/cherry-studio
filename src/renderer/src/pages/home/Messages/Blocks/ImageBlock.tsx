import { loggerService } from '@logger'
import ImageViewer from '@renderer/components/ImageViewer'
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

  // Incremental download: try to download images that are still remote
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

    ;(async () => {
      const newLocalFiles: (FileMetadata | null)[] = [...(localFiles || generateImages.map(() => null))]

      const results = await Promise.all(
        missingIndices.map(async (index) => {
          const file = await downloadImageToLocal(generateImages[index])
          return { index, file }
        })
      )

      let hasUpdate = false
      for (const { index, file } of results) {
        if (file) {
          newLocalFiles[index] = file
          hasUpdate = true
        }
      }

      if (hasUpdate) {
        store.dispatch(
          updateOneBlock({
            id: block.id,
            changes: {
              metadata: {
                ...metadata,
                localFiles: newLocalFiles
              }
            } as Partial<ImageMessageBlock>
          })
        )
      }
    })()
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
