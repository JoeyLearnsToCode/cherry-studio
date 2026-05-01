import { loggerService } from '@logger'
import { FileMetadata } from '@renderer/types'
import { ImageMessageBlock, MessageBlockStatus, MessageBlockType } from '@renderer/types/newMessage'
import { createImageBlock } from '@renderer/utils/messageUtils/create'

import { BlockManager } from '../BlockManager'

const logger = loggerService.withContext('ImageCallbacks')

async function downloadImageToLocal(imageSrc: string): Promise<FileMetadata | null> {
  try {
    if (imageSrc.startsWith('data:')) {
      return await window.api.file.saveBase64ImageLocal(imageSrc)
    } else {
      return await window.api.file.downloadImage(imageSrc)
    }
  } catch (error) {
    logger.error('Failed to download image to local, will use remote fallback:', error as Error)
    return null
  }
}

interface ImageCallbacksDependencies {
  blockManager: BlockManager
  assistantMsgId: string
}

export const createImageCallbacks = (deps: ImageCallbacksDependencies) => {
  const { blockManager, assistantMsgId } = deps

  let imageBlockId: string | null = null

  return {
    onImageCreated: async () => {
      if (blockManager.hasInitialPlaceholder) {
        const initialChanges = {
          type: MessageBlockType.IMAGE,
          status: MessageBlockStatus.PENDING
        }
        imageBlockId = blockManager.initialPlaceholderBlockId!
        blockManager.smartBlockUpdate(imageBlockId, initialChanges, MessageBlockType.IMAGE)
      } else if (!imageBlockId) {
        const imageBlock = createImageBlock(assistantMsgId, {
          status: MessageBlockStatus.PENDING
        })
        imageBlockId = imageBlock.id
        await blockManager.handleBlockTransition(imageBlock, MessageBlockType.IMAGE)
      }
    },

    onImageDelta: (imageData: any) => {
      const imageUrl = imageData.images?.[0] || 'placeholder_image_url'
      if (imageBlockId) {
        const changes: Partial<ImageMessageBlock> = {
          url: imageUrl,
          metadata: { generateImageResponse: imageData },
          status: MessageBlockStatus.STREAMING
        }
        blockManager.smartBlockUpdate(imageBlockId, changes, MessageBlockType.IMAGE, true)
      }
    },

    onImageGenerated: (imageData: any) => {
      if (imageBlockId) {
        if (!imageData) {
          const changes: Partial<ImageMessageBlock> = {
            status: MessageBlockStatus.SUCCESS
          }
          blockManager.smartBlockUpdate(imageBlockId, changes, MessageBlockType.IMAGE)
        } else {
          const imageUrl = imageData.images?.[0] || 'placeholder_image_url'

          // Immediately mark as SUCCESS with remote URLs (fallback)
          const changes: Partial<ImageMessageBlock> = {
            url: imageUrl,
            metadata: { generateImageResponse: imageData },
            status: MessageBlockStatus.SUCCESS
          }
          blockManager.smartBlockUpdate(imageBlockId, changes, MessageBlockType.IMAGE, true)

          // Fire-and-forget: download images to local in background
          const blockId = imageBlockId
          const images: string[] = imageData.images || []
          Promise.all(images.map(downloadImageToLocal)).then((localFiles) => {
            const hasLocal = localFiles.some((f) => f !== null)
            if (hasLocal) {
              const updateChanges: Partial<ImageMessageBlock> = {
                metadata: { generateImageResponse: imageData, localFiles }
              }
              blockManager.smartBlockUpdate(blockId, updateChanges, MessageBlockType.IMAGE, true)
            }
          })
        }
        imageBlockId = null
      } else {
        logger.error('[onImageGenerated] Last block was not an Image block or ID is missing.')
      }
    }
  }
}
