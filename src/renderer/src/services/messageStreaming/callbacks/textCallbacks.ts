import { loggerService } from '@logger'
import { WEB_SEARCH_SOURCE } from '@renderer/types'
import type { ProviderMetadata } from '@renderer/types/chunk'
import type { CitationMessageBlock, MessageBlock } from '@renderer/types/newMessage'
import { MessageBlockStatus, MessageBlockType } from '@renderer/types/newMessage'
import { hasLocalizableImages, localizeMarkdownImages } from '@renderer/utils/markdown'
import { createMainTextBlock } from '@renderer/utils/messageUtils/create'

import type { BlockManager } from '../BlockManager'

const logger = loggerService.withContext('TextCallbacks')

interface TextCallbacksDependencies {
  blockManager: BlockManager
  getState: any
  assistantMsgId: string
  getCitationBlockId: () => string | null
  getCitationBlockIdFromTool: () => string | null
  handleCompactTextComplete?: (text: string, mainTextBlockId: string | null) => Promise<boolean>
}

export const createTextCallbacks = (deps: TextCallbacksDependencies) => {
  const {
    blockManager,
    getState,
    assistantMsgId,
    getCitationBlockId,
    getCitationBlockIdFromTool,
    handleCompactTextComplete
  } = deps

  // 内部维护的状态
  let mainTextBlockId: string | null = null
  // Track thoughtSignature for Gemini thought signature persistence
  let currentThoughtSignature: string | undefined

  return {
    getCurrentMainTextBlockId: () => mainTextBlockId,
    onTextStart: async () => {
      if (blockManager.hasInitialPlaceholder) {
        const changes = {
          type: MessageBlockType.MAIN_TEXT,
          content: '',
          status: MessageBlockStatus.STREAMING
        }
        mainTextBlockId = blockManager.initialPlaceholderBlockId!
        blockManager.smartBlockUpdate(mainTextBlockId, changes, MessageBlockType.MAIN_TEXT, true)
      } else if (!mainTextBlockId) {
        const newBlock = createMainTextBlock(assistantMsgId, '', {
          status: MessageBlockStatus.STREAMING
        })
        mainTextBlockId = newBlock.id
        await blockManager.handleBlockTransition(newBlock, MessageBlockType.MAIN_TEXT)
      }
    },

    onTextChunk: async (text: string, providerMetadata?: ProviderMetadata) => {
      const citationBlockId = getCitationBlockId() || getCitationBlockIdFromTool()
      const citationBlockSource = citationBlockId
        ? (getState().messageBlocks.entities[citationBlockId] as CitationMessageBlock).response?.source
        : WEB_SEARCH_SOURCE.WEBSEARCH
      if (text) {
        const blockChanges: Partial<MessageBlock> = {
          content: text,
          status: MessageBlockStatus.STREAMING,
          citationReferences: citationBlockId ? [{ citationBlockId, citationBlockSource }] : []
        }
        blockManager.smartBlockUpdate(mainTextBlockId!, blockChanges, MessageBlockType.MAIN_TEXT)
      }
      // Collect thoughtSignature from providerMetadata for Gemini
      if (providerMetadata?.google?.thoughtSignature) {
        currentThoughtSignature = providerMetadata.google.thoughtSignature
      }
    },

    onTextComplete: async (finalText: string, providerMetadata?: ProviderMetadata) => {
      if (mainTextBlockId) {
        const blockId = mainTextBlockId
        mainTextBlockId = null // 立即清空，防止异常导致泄漏

        // Use thoughtSignature from providerMetadata if available, otherwise use collected one
        const thoughtSignature = providerMetadata?.google?.thoughtSignature || currentThoughtSignature
        // 先设 SUCCESS，保证会话不会卡在"进行中"状态
        const changes: Partial<MessageBlock> = {
          content: finalText,
          status: MessageBlockStatus.SUCCESS,
          // Store thoughtSignature in metadata for persistence
          metadata: thoughtSignature ? { thoughtSignature } : undefined
        }
        blockManager.smartBlockUpdate(blockId, changes, MessageBlockType.MAIN_TEXT, true)

        if (handleCompactTextComplete) {
          await handleCompactTextComplete(finalText, blockId)
        }
        // Clear thoughtSignature after block is complete
        currentThoughtSignature = undefined

        // 再 await 本地化图片，完成后更新 content
        if (hasLocalizableImages(finalText)) {
          try {
            const { content: localizedContent } = await localizeMarkdownImages(finalText)
            if (localizedContent !== finalText) {
              blockManager.smartBlockUpdate(
                blockId,
                { content: localizedContent } as Partial<MessageBlock>,
                MessageBlockType.MAIN_TEXT,
                true
              )
            }
          } catch {
            // 本地化失败，保留远程 URL，下次打开会话时组件兜底处理
          }
        }
      } else {
        logger.warn(
          `[onTextComplete] Received text.complete but last block was not MAIN_TEXT (was ${blockManager.lastBlockType}) or lastBlockId is null.`
        )
      }
    }
  }
}
