import { useSettings } from '@renderer/hooks/useSettings'
import { getModelUniqId } from '@renderer/services/ModelService'
import { useAppStore } from '@renderer/store'
import { updateOneBlock, selectFormattedCitationsByBlockId } from '@renderer/store/messageBlock'
import { type Model } from '@renderer/types'
import db from '@renderer/databases'
import type { MainTextMessageBlock, Message, MessageBlock } from '@renderer/types/newMessage'
import { MessageBlockStatus } from '@renderer/types/newMessage'
import { determineCitationSource, withCitationTags } from '@renderer/utils/citation'
import { hasLocalizableImages, localizeMarkdownImages } from '@renderer/utils/markdown'
import { Flex } from 'antd'
import React, { useCallback, useEffect, useRef } from 'react'
import { useSelector } from 'react-redux'
import styled from 'styled-components'

import Markdown from '../../Markdown/Markdown'

interface Props {
  block: MainTextMessageBlock
  citationBlockId?: string
  mentions?: Model[]
  role: Message['role']
}

const MainTextBlock: React.FC<Props> = ({ block, citationBlockId, role, mentions = [] }) => {
  const { renderInputMessageAsMarkdown } = useSettings()
  const store = useAppStore()
  const localizeAttempted = useRef(false)

  const rawCitations = useSelector((state: any) => selectFormattedCitationsByBlockId(state, citationBlockId))

  // 图片本地化兜底：打开会话时检查是否有未本地化的图片
  // 主要逻辑在 textCallbacks.onTextComplete 中执行，这里仅作兜底
  useEffect(() => {
    if (localizeAttempted.current) return
    if (block.status !== MessageBlockStatus.SUCCESS) return
    if (!hasLocalizableImages(block.content)) return

    localizeAttempted.current = true
    const originalContent = block.content
    localizeMarkdownImages(originalContent).then(({ content: localizedContent }) => {
      if (localizedContent !== originalContent) {
        store.dispatch(updateOneBlock({ id: block.id, changes: { content: localizedContent } as Partial<MessageBlock> }))
        db.message_blocks.update(block.id, { content: localizedContent } as any).catch(() => {})
      }
    })
  }, [block.id, block.content, block.status, store])

  // 创建引用处理函数，传递给 Markdown 组件在流式渲染中使用
  const processContent = useCallback(
    (rawText: string) => {
      if (!block.citationReferences?.length || !citationBlockId || rawCitations.length === 0) {
        return rawText
      }

      // 确定最适合的 source
      const sourceType = determineCitationSource(block.citationReferences)

      return withCitationTags(rawText, rawCitations, sourceType)
    },
    [block.citationReferences, citationBlockId, rawCitations]
  )

  return (
    <>
      {/* Render mentions associated with the message */}
      {mentions && mentions.length > 0 && (
        <Flex gap="8px" wrap style={{ marginBottom: 10 }}>
          {mentions.map((m) => (
            <MentionTag key={getModelUniqId(m)}>{'@' + m.name}</MentionTag>
          ))}
        </Flex>
      )}
      {role === 'user' && !renderInputMessageAsMarkdown ? (
        <p className="markdown" style={{ whiteSpace: 'pre-wrap' }}>
          {block.content}
        </p>
      ) : (
        <Markdown block={block} postProcess={processContent} />
      )}
    </>
  )
}

const MentionTag = styled.span`
  color: var(--color-link);
`

export default React.memo(MainTextBlock)
