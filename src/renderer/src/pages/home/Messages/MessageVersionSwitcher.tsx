import { Button, Space } from 'antd'
import { FC } from 'react'
import { useTranslation } from 'react-i18next'

import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import store from '@renderer/store'
import { updateMessageAndBlocksThunk } from '@renderer/store/thunk/messageThunk'
import { MainTextMessageBlock, Message } from '@renderer/types/newMessage'
import { MessageBlockType } from '@renderer/types/newMessage'
import { getActiveVersionIndex, getSortedVersions, getVersionCount } from '@renderer/utils/messageUtils/find'

interface Props {
  message: Message
  onVersionChange?: () => void
}

const MessageVersionSwitcher: FC<Props> = ({ message, onVersionChange }) => {
  const { t } = useTranslation()

  // 仅用户消息显示版本切换
  if (message.role !== 'user') {
    return null
  }

  const versionCount = getVersionCount(message)
  if (versionCount <= 1) {
    return null
  }

  const currentIndex = getActiveVersionIndex(message)
  const sortedVersions = getSortedVersions(message)

  const switchToVersion = (targetVersionId: string, targetContent: string) => {
    const state = store.getState()

    // 找到主文本块
    const mainTextBlockId = message.blocks.find((blockId) => {
      const block = state.messageBlocks.entities[blockId]
      return block?.type === MessageBlockType.MAIN_TEXT
    })

    let updatedBlock: MainTextMessageBlock | undefined
    if (mainTextBlockId) {
      const block = state.messageBlocks.entities[mainTextBlockId]
      if (block && block.type === MessageBlockType.MAIN_TEXT) {
        updatedBlock = {
          ...block,
          content: targetContent,
          updatedAt: new Date().toISOString()
        } as MainTextMessageBlock
      }
    }

    // 统一使用 thunk 更新 Redux + DB（包括 message 和 block）
    store.dispatch(
      updateMessageAndBlocksThunk(
        message.topicId,
        {
          id: message.id,
          activeVersionId: targetVersionId,
          updatedAt: new Date().toISOString()
        },
        updatedBlock ? [updatedBlock] : []
      )
    )

    onVersionChange?.()
  }

  const handlePrev = () => {
    if (currentIndex <= 0) return
    const prevVersion = sortedVersions[currentIndex - 1]
    if (!prevVersion) return
    switchToVersion(prevVersion.id, prevVersion.content)
  }

  const handleNext = () => {
    if (currentIndex >= versionCount - 1) return
    const nextVersion = sortedVersions[currentIndex + 1]
    if (!nextVersion) return
    switchToVersion(nextVersion.id, nextVersion.content)
  }

  return (
    <Space size={4}>
      <Button
        type="text"
        size="small"
        icon={<LeftOutlined />}
        onClick={handlePrev}
        disabled={currentIndex <= 0}
        title={t('chat.message.version.previous')}
      />
      <span className="version-indicator">
        {currentIndex + 1}/{versionCount}
      </span>
      <Button
        type="text"
        size="small"
        icon={<RightOutlined />}
        onClick={handleNext}
        disabled={currentIndex >= versionCount - 1}
        title={t('chat.message.version.next')}
      />
    </Space>
  )
}

export default MessageVersionSwitcher
