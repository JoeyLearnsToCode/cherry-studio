import {
  ColumnHeightOutlined,
  ColumnWidthOutlined,
  DeleteOutlined,
  FolderOutlined,
  NumberOutlined
} from '@ant-design/icons'
import { HStack } from '@renderer/components/Layout'
import { useMessageOperations } from '@renderer/hooks/useMessageOperations'
import SelectModelPopup from '@renderer/components/Popups/SelectModelPopup'
import { isEmbeddingModel, isRerankModel, isVisionModel } from '@renderer/config/models'
import { MultiModelMessageStyle } from '@renderer/store/settings'
import store from '@renderer/store'
import { messageBlocksSelectors } from '@renderer/store/messageBlock'
import { selectMessagesForTopic } from '@renderer/store/newMessage'
import type { Topic, Assistant, Model } from '@renderer/types'
import { type Message, MessageBlockType } from '@renderer/types/newMessage'
import { Button, Tooltip } from 'antd'
import { AtSign, MessageSquarePlus } from 'lucide-react'
import { FC, memo, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

import MessageGroupModelList from './MessageGroupModelList'
import MessageGroupSettings from './MessageGroupSettings'

interface Props {
  multiModelMessageStyle: MultiModelMessageStyle
  setMultiModelMessageStyle: (style: MultiModelMessageStyle) => void
  messages: Message[]
  selectMessageId: string
  setSelectedMessage: (message: Message) => void
  topic: Topic
  assistant: Assistant
}

const MessageGroupMenuBar: FC<Props> = ({
  multiModelMessageStyle,
  setMultiModelMessageStyle,
  messages,
  selectMessageId,
  setSelectedMessage,
  topic,
  assistant
}) => {
  const { t } = useTranslation()
  const { deleteGroupMessages, appendAssistantResponse } = useMessageOperations(topic)

  const mentionModelFilter = useMemo(() => {
    const defaultFilter = (model: Model) => !isEmbeddingModel(model) && !isRerankModel(model)
    const firstMessage = messages[0]
    if (!firstMessage) return defaultFilter
    const state = store.getState()
    const topicMessages: Message[] = selectMessagesForTopic(state, topic.id)
    const relatedUserMessage = topicMessages.find((msg) => msg.role === 'user' && firstMessage.askId === msg.id)
    if (!relatedUserMessage) return defaultFilter
    const relatedUserMessageBlocks = relatedUserMessage.blocks.map((msgBlockId) =>
      messageBlocksSelectors.selectById(store.getState(), msgBlockId)
    )
    if (!relatedUserMessageBlocks) return defaultFilter
    if (relatedUserMessageBlocks.some((block) => block && block.type === MessageBlockType.IMAGE)) {
      return (m: Model) => isVisionModel(m) && defaultFilter(m)
    }
    return defaultFilter
  }, [messages, topic.id])

  const onSwitchModel = useCallback(async () => {
    const lastMessage = messages[messages.length - 1]
    if (!lastMessage) return
    const selectedModel = await SelectModelPopup.show({ model: lastMessage.model, filter: mentionModelFilter })
    if (!selectedModel) return
    appendAssistantResponse(lastMessage, selectedModel, { ...assistant, model: selectedModel })
  }, [messages, mentionModelFilter, appendAssistantResponse, assistant])

  const onRegenerateWithSameModel = useCallback(async () => {
    const selectedMessage = messages[messages.length - 1]
    if (!selectedMessage || !selectedMessage.model) return
    appendAssistantResponse(selectedMessage, selectedMessage.model, { ...assistant, model: selectedMessage.model })
  }, [messages, selectMessageId, appendAssistantResponse, assistant])

  const handleDeleteGroup = async () => {
    const askId = messages[0]?.askId
    if (!askId) return

    window.modal.confirm({
      title: t('message.group.delete.title'),
      content: t('message.group.delete.content'),
      centered: true,
      okButtonProps: {
        danger: true
      },
      okText: t('common.delete'),
      onOk: () => deleteGroupMessages(askId)
    })
  }

  const multiModelMessageStyleTextByLayout = {
    fold: t('message.message.multi_model_style.fold.label'),
    vertical: t('message.message.multi_model_style.vertical'),
    horizontal: t('message.message.multi_model_style.horizontal'),
    grid: t('message.message.multi_model_style.grid')
  } as const

  return (
    <GroupMenuBar $layout={multiModelMessageStyle} className="group-menu-bar">
      <HStack style={{ alignItems: 'center', flex: 1, overflow: 'hidden' }}>
        <LayoutContainer>
          {(['fold', 'vertical', 'horizontal', 'grid'] as const).map((layout) => (
            <Tooltip
              mouseEnterDelay={0.5}
              key={layout}
              title={t('message.message.multi_model_style.label') + ': ' + multiModelMessageStyleTextByLayout[layout]}>
              <LayoutOption
                $active={multiModelMessageStyle === layout}
                onClick={() => setMultiModelMessageStyle(layout)}>
                {layout === 'fold' ? (
                  <FolderOutlined />
                ) : layout === 'horizontal' ? (
                  <ColumnWidthOutlined />
                ) : layout === 'vertical' ? (
                  <ColumnHeightOutlined />
                ) : (
                  <NumberOutlined />
                )}
              </LayoutOption>
            </Tooltip>
          ))}
        </LayoutContainer>
        {multiModelMessageStyle === 'fold' && (
          <MessageGroupModelList
            messages={messages}
            selectMessageId={selectMessageId}
            setSelectedMessage={setSelectedMessage}
          />
        )}
        {multiModelMessageStyle === 'grid' && <MessageGroupSettings />}
      </HStack>
      <Tooltip title={t('message.mention.title')} mouseEnterDelay={0.5}>
        <Button type="text" size="small" icon={<AtSign size={15} />} onClick={onSwitchModel} />
      </Tooltip>
      <Tooltip title={t('message.regenerate.same_model')} mouseEnterDelay={0.5}>
        <Button
          type="text"
          size="small"
          icon={<MessageSquarePlus size={15} />}
          onClick={onRegenerateWithSameModel}
        />
      </Tooltip>
      <Button
        type="text"
        size="small"
        icon={<DeleteOutlined style={{ color: 'var(--color-error)' }} />}
        onClick={handleDeleteGroup}
      />
    </GroupMenuBar>
  )
}

const GroupMenuBar = styled.div<{ $layout: MultiModelMessageStyle }>`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 10px;
  margin: 8px 10px 16px;
  justify-content: space-between;
  overflow: hidden;
  border: 0.5px solid var(--color-border);
  height: 40px;
  position: sticky;
  bottom: 0;
  z-index: 10;
  background-color: var(--color-background);
`

const LayoutContainer = styled.div`
  display: flex;
  gap: 4px;
  flex-direction: row;
`

const LayoutOption = styled.div<{ $active: boolean }>`
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  background-color: ${({ $active }) => ($active ? 'var(--color-background-soft)' : 'transparent')};

  &:hover {
    background-color: ${({ $active }) => ($active ? 'var(--color-background-soft)' : 'var(--color-hover)')};
  }
`

export default memo(MessageGroupMenuBar)
