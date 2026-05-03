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

    onImageGenerated: async (imageData: any) => {
      if (imageBlockId) {
        const blockId = imageBlockId
        imageBlockId = null // 立即清空，防止异常导致泄漏

        if (!imageData) {
          const changes: Partial<ImageMessageBlock> = {
            status: MessageBlockStatus.SUCCESS
          }
          blockManager.smartBlockUpdate(blockId, changes, MessageBlockType.IMAGE)
        } else {
          const imageUrl = imageData.images?.[0] || 'placeholder_image_url'

          // 先设 SUCCESS，保证会话不会卡在"进行中"状态
          blockManager.smartBlockUpdate(
            blockId,
            {
              url: imageUrl,
              metadata: { generateImageResponse: imageData },
              status: MessageBlockStatus.SUCCESS
            } as Partial<ImageMessageBlock>,
            MessageBlockType.IMAGE,
            true
          )

          // 再 await 下载到本地，完成后更新 metadata
          // 组件 useEffect 通过 seenStreaming 跳过流式期间，不会重复下载
          const images: string[] = imageData.images || []
          try {
            const localFiles = await Promise.all(images.map(downloadImageToLocal))
            const hasLocal = localFiles.some((f) => f !== null)
            if (hasLocal) {
              blockManager.smartBlockUpdate(
                blockId,
                { metadata: { generateImageResponse: imageData, localFiles } } as Partial<ImageMessageBlock>,
                MessageBlockType.IMAGE,
                true
              )
            }
          } catch {
            // 下载失败，保留远程 URL，下次打开会话时组件兜底处理
          }
        }
      } else {
        logger.error('[onImageGenerated] Last block was not an Image block or ID is missing.')
      }
    }
  }
}
