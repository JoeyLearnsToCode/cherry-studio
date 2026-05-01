import { loggerService } from '@logger'
import { updateOneBlock } from '@renderer/store/messageBlock'
import { WebSearchSource } from '@renderer/types'
import { CitationMessageBlock, MessageBlock, MessageBlockStatus, MessageBlockType } from '@renderer/types/newMessage'
import { createMainTextBlock } from '@renderer/utils/messageUtils/create'
import { hasLocalizableImages, localizeMarkdownImages } from '@renderer/utils/markdown'

import { BlockManager } from '../BlockManager'

const logger = loggerService.withContext('TextCallbacks')

interface TextCallbacksDependencies {
  blockManager: BlockManager
  dispatch: any
  getState: any
  assistantMsgId: string
  getCitationBlockId: () => string | null
}

export const createTextCallbacks = (deps: TextCallbacksDependencies) => {
  const { blockManager, dispatch, getState, assistantMsgId, getCitationBlockId } = deps

  // 内部维护的状态
  let mainTextBlockId: string | null = null

  return {
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

    onTextChunk: async (text: string) => {
      const citationBlockId = getCitationBlockId()
      const citationBlockSource = citationBlockId
        ? (getState().messageBlocks.entities[citationBlockId] as CitationMessageBlock).response?.source
        : WebSearchSource.WEBSEARCH
      if (text) {
        const blockChanges: Partial<MessageBlock> = {
          content: text,
          status: MessageBlockStatus.STREAMING,
          citationReferences: citationBlockId ? [{ citationBlockId, citationBlockSource }] : []
        }
        blockManager.smartBlockUpdate(mainTextBlockId!, blockChanges, MessageBlockType.MAIN_TEXT)
      }
    },

    onTextComplete: async (finalText: string) => {
      if (mainTextBlockId) {
        const blockId = mainTextBlockId
        const changes = {
          content: finalText,
          status: MessageBlockStatus.SUCCESS
        }
        blockManager.smartBlockUpdate(mainTextBlockId, changes, MessageBlockType.MAIN_TEXT, true)
        mainTextBlockId = null

        // Fire-and-forget: 流完成后本地化 markdown 中的图片
        if (hasLocalizableImages(finalText)) {
          localizeMarkdownImages(finalText).then(({ content: localizedContent }) => {
            if (localizedContent !== finalText) {
              dispatch(updateOneBlock({ id: blockId, changes: { content: localizedContent } as Partial<MessageBlock> }))
            }
          })
        }
      } else {
        logger.warn(
          `[onTextComplete] Received text.complete but last block was not MAIN_TEXT (was ${blockManager.lastBlockType}) or lastBlockId is null.`
        )
      }
    }
  }
}
