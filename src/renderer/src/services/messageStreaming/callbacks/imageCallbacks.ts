import { loggerService } from '@logger'
import FileManager from '@renderer/services/FileManager'
import { type FileMetadata, type GenerateImageResponse } from '@renderer/types'
import type { ImageMessageBlock } from '@renderer/types/newMessage'
import { MessageBlockStatus, MessageBlockType } from '@renderer/types/newMessage'
import { createImageBlock } from '@renderer/utils/messageUtils/create'

import type { BlockManager } from '../BlockManager'

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

    onImageDelta: (imageData: GenerateImageResponse) => {
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

    onImageGenerated: async (imageData?: GenerateImageResponse) => {
      // For base64 images, persist to disk to avoid sending huge data URIs in future messages
      const buildImageBlockFields = async (imageData: GenerateImageResponse): Promise<Partial<ImageMessageBlock>> => {
        const imageUrl: string = imageData.images?.[0] || 'placeholder_image_url'
        if (imageData.type === 'base64' && imageUrl.startsWith('data:')) {
          const savedFile = await window.api.file.saveBase64Image(imageUrl)
          await FileManager.addFile(savedFile)
          return {
            file: savedFile,
            url: FileManager.getFileUrl(savedFile),
            metadata: { generateImageResponse: imageData },
            status: MessageBlockStatus.SUCCESS
          }
        }
        return {
          url: imageUrl,
          metadata: { generateImageResponse: imageData, _localizing: true },
          status: MessageBlockStatus.SUCCESS
        }
      }

      if (!imageBlockId && blockManager.hasInitialPlaceholder) {
        imageBlockId = blockManager.initialPlaceholderBlockId
      }

      if (imageBlockId) {
        const blockId = imageBlockId
        imageBlockId = null // 立即清空，防止异常导致泄漏

        if (!imageData) {
          const changes: Partial<ImageMessageBlock> = {
            status: MessageBlockStatus.SUCCESS
          }
          blockManager.smartBlockUpdate(blockId, changes, MessageBlockType.IMAGE, true)
        } else {
          const changes = {
            type: MessageBlockType.IMAGE,
            ...(await buildImageBlockFields(imageData))
          }
          blockManager.smartBlockUpdate(blockId, changes, MessageBlockType.IMAGE, true)

          // For non-base64 images, download to local asynchronously
          if (imageData.type !== 'base64' && imageData.images?.length) {
            try {
              const localFiles = await Promise.all(imageData.images.map(downloadImageToLocal))
              blockManager.smartBlockUpdate(
                blockId,
                {
                  metadata: { generateImageResponse: imageData, localFiles, _localizing: false }
                } as Partial<ImageMessageBlock>,
                MessageBlockType.IMAGE,
                true
              )
            } catch {
              // 下载失败，释放 _localizing 让兜底机制可重试
              blockManager.smartBlockUpdate(
                blockId,
                { metadata: { generateImageResponse: imageData, _localizing: false } } as Partial<ImageMessageBlock>,
                MessageBlockType.IMAGE,
                true
              )
            }
          }
        }
      } else {
        if (imageData) {
          const fields = await buildImageBlockFields(imageData)
          const imageBlock = createImageBlock(assistantMsgId, fields)
          await blockManager.handleBlockTransition(imageBlock, MessageBlockType.IMAGE)
        } else {
          logger.error('[onImageGenerated] Last block was not an Image block or ID is missing.')
        }
      }
    },

    onImageSearched: async (content: string, metadata: Record<string, any>) => {
      if (!imageBlockId) {
        const imageBlock = createImageBlock(assistantMsgId, {
          status: MessageBlockStatus.SUCCESS,
          metadata: {
            generateImageResponse: {
              type: 'base64',
              images: [`data:${metadata.mime};base64,${content}`]
            }
          }
        })
        await blockManager.handleBlockTransition(imageBlock, MessageBlockType.IMAGE)
      }
    }
  }
}
