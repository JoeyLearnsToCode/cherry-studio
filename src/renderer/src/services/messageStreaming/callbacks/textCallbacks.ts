import { loggerService } from '@logger'
import { selectMessagesForTopic } from '@renderer/store/newMessage'
import { WebSearchSource } from '@renderer/types'
import { CitationMessageBlock, MessageBlock, MessageBlockStatus, MessageBlockType } from '@renderer/types/newMessage'
import { createMainTextBlock } from '@renderer/utils/messageUtils/create'
import { getMainTextContent } from '@renderer/utils/messageUtils/find'
import { hasLocalizableImages, localizeMarkdownImages } from '@renderer/utils/markdown'

import { BlockManager } from '../BlockManager'

const logger = loggerService.withContext('TextCallbacks')

interface TextCallbacksDependencies {
  blockManager: BlockManager
  getState: any
  assistantMsgId: string
  topicId: string
  getCitationBlockId: () => string | null
}

export const createTextCallbacks = (deps: TextCallbacksDependencies) => {
  const { blockManager, getState, assistantMsgId, topicId, getCitationBlockId } = deps

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
        mainTextBlockId = null // 立即清空，防止异常导致泄漏

        // 先设 SUCCESS，保证会话不会卡在"进行中"状态
        blockManager.smartBlockUpdate(
          blockId,
          { content: finalText, status: MessageBlockStatus.SUCCESS },
          MessageBlockType.MAIN_TEXT,
          true
        )

        // 再 await 本地化图片，完成后更新 content
        // 组件 useEffect 通过 seenStreaming 跳过流式期间，不会重复下载
        if (hasLocalizableImages(finalText)) {
          // 从对话历史提取 prompt 上下文用于 PNG iTXt 元数据（排除当前助手回复）
          let mdPrompt: string | undefined
          try {
            const state = getState()
            const messages = selectMessagesForTopic(state, topicId)
            const history = messages.filter((m: any) => m.id !== assistantMsgId).slice(-6)
            mdPrompt = history
              .map((m: any) => {
                const role = m.role === 'user' ? 'user' : 'ai'
                return `[${role}]:${getMainTextContent(m) || ''}`
              })
              .join('--==--')
          } catch { /* prompt for iTXt is best-effort */ }
          try {
            const { content: localizedContent } = await localizeMarkdownImages(finalText, mdPrompt)
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
