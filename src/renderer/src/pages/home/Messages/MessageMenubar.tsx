import { InfoCircleOutlined } from '@ant-design/icons'
import { CopyIcon, DeleteIcon, EditIcon, RefreshIcon } from '@renderer/components/Icons'
import { useMessageStyle } from '@renderer/hooks/useSettings'
import { TraceIcon } from '@renderer/trace/pages/Component'
import type { Assistant, Model, Topic } from '@renderer/types'
import { type Message } from '@renderer/types/newMessage'
import { classNames } from '@renderer/utils'
import { Dropdown, Popconfirm, Tooltip } from 'antd'
import { AtSign, Check, Languages, Menu, ThumbsUp } from 'lucide-react'
import { FC, memo } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

import MessageTokens from './MessageTokens'
import { useMessageMenuItems } from './useMessageMenuItems'

interface Props {
  message: Message
  assistant: Assistant
  topic: Topic
  model?: Model
  index?: number
  isGrouped?: boolean
  isLastMessage: boolean
  isAssistantMessage: boolean
  messageContainerRef: React.RefObject<HTMLDivElement>
  setModel: (model: Model) => void
  onUpdateUseful?: (msgId: string) => void
}

const MessageMenubar: FC<Props> = (props) => {
  const {
    message,
    isLastMessage,
    isAssistantMessage
  } = props
  const { t } = useTranslation()
  const { isBubbleStyle } = useMessageStyle()

  const {
    onCopy,
    onEdit,
    onDelete,
    onRegenerate,
    onMentionModel,
    onRespondToUserMessage,
    onUseful,
    handleResendUserMessage,
    handleTraceUserMessage,
    moreMenuItems,
    translateMenu,
    copied
  } = useMessageMenuItems(props)

  const isUserMessage = message.role === 'user'
  const softHoverBg = isBubbleStyle && !isLastMessage
  const showMessageTokens = !isBubbleStyle
  const isUserBubbleStyleMessage = isBubbleStyle && isUserMessage

  return (
    <>
      {showMessageTokens && <MessageTokens message={message} />}
      <MenusBar
        className={classNames({ menubar: true, show: isLastMessage, 'user-bubble-style': isUserBubbleStyleMessage })}>
        {message.role === 'user' && (
          <Popconfirm
            title={t('message.regenerate.confirm')}
            okButtonProps={{ danger: true }}
            icon={<InfoCircleOutlined style={{ color: 'red' }} />}
            onConfirm={() => handleResendUserMessage()}>
            <Tooltip title={t('common.regenerate')} mouseEnterDelay={0.8}>
              <ActionButton className="message-action-button" $softHoverBg={isBubbleStyle}>
                <RefreshIcon size={15} />
              </ActionButton>
            </Tooltip>
          </Popconfirm>
        )}
        {message.role === 'user' && (
          <Tooltip title={t('common.edit')} mouseEnterDelay={0.8}>
            <ActionButton className="message-action-button" onClick={onEdit} $softHoverBg={softHoverBg}>
              <EditIcon size={15} />
            </ActionButton>
          </Tooltip>
        )}
        {message.role === 'user' && (
          <Tooltip title={t('message.mention.respondTitle')} mouseEnterDelay={0.8}>
            <ActionButton className="message-action-button" onClick={onRespondToUserMessage} $softHoverBg={softHoverBg}>
              <AtSign size={15} />
            </ActionButton>
          </Tooltip>
        )}
        <Tooltip title={t('common.copy')} mouseEnterDelay={0.8}>
          <ActionButton className="message-action-button" onClick={onCopy} $softHoverBg={softHoverBg}>
            {!copied && <CopyIcon size={15} />}
            {copied && <Check size={15} color="var(--color-primary)" />}
          </ActionButton>
        </Tooltip>
        {isAssistantMessage && (
          <Tooltip title={t('common.regenerate')} mouseEnterDelay={0.8}>
            <ActionButton className="message-action-button" onClick={onRegenerate} $softHoverBg={softHoverBg}>
              <RefreshIcon size={15} />
            </ActionButton>
          </Tooltip>
        )}
        {isAssistantMessage && (
          <Tooltip title={t('message.mention.title')} mouseEnterDelay={0.8}>
            <ActionButton className="message-action-button" onClick={onMentionModel} $softHoverBg={softHoverBg}>
              <AtSign size={15} />
            </ActionButton>
          </Tooltip>
        )}
        {!isUserMessage && (
          <Dropdown
            menu={{
              style: {
                maxHeight: 250,
                overflowY: 'auto',
                backgroundClip: 'border-box'
              },
              items: translateMenu.children,
              onClick: (e) => e.domEvent.stopPropagation()
            }}
            trigger={['click']}
            placement="top"
            arrow>
            <Tooltip title={t('chat.translate')} mouseEnterDelay={1.2}>
              <ActionButton
                className="message-action-button"
                onClick={(e) => e.stopPropagation()}
                $softHoverBg={softHoverBg}>
                <Languages size={15} />
              </ActionButton>
            </Tooltip>
          </Dropdown>
        )}
        {isAssistantMessage && props.isGrouped && (
          <Tooltip title={t('chat.message.useful.label')} mouseEnterDelay={0.8}>
            <ActionButton className="message-action-button" onClick={onUseful} $softHoverBg={softHoverBg}>
              {message.useful ? (
                <ThumbsUp size={17.5} fill="var(--color-primary)" strokeWidth={0} />
              ) : (
                <ThumbsUp size={15} />
              )}
            </ActionButton>
          </Tooltip>
        )}
        <Popconfirm
          title={t('message.message.delete.content')}
          okButtonProps={{ danger: true }}
          icon={<InfoCircleOutlined style={{ color: 'red' }} />}
          onConfirm={onDelete}>
          <ActionButton
            className="message-action-button"
            onClick={(e) => e.stopPropagation()}
            $softHoverBg={softHoverBg}>
            <Tooltip title={t('common.delete')} mouseEnterDelay={1}>
              <DeleteIcon size={15} />
            </Tooltip>
          </ActionButton>
        </Popconfirm>
        {message.traceId && (
          <Tooltip title={t('trace.label')} mouseEnterDelay={0.8}>
            <ActionButton className="message-action-button" onClick={() => handleTraceUserMessage()}>
              <TraceIcon size={16} className={'lucide lucide-trash'} />
            </ActionButton>
          </Tooltip>
        )}
        {!isUserMessage && (
          <Dropdown
            menu={{ items: moreMenuItems, onClick: (e) => e.domEvent.stopPropagation() }}
            trigger={['click']}
            placement="topRight">
            <ActionButton
              className="message-action-button"
              onClick={(e) => e.stopPropagation()}
              $softHoverBg={softHoverBg}>
              <Menu size={19} />
            </ActionButton>
          </Dropdown>
        )}
      </MenusBar>
    </>
  )
}

const MenusBar = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;

  &.user-bubble-style {
    margin-top: 5px;
  }
`

const ActionButton = styled.div<{ $softHoverBg?: boolean }>`
  cursor: pointer;
  border-radius: 8px;
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  width: 26px;
  height: 26px;
  transition: all 0.2s ease;
  &:hover {
    background-color: ${(props) =>
      props.$softHoverBg ? 'var(--color-background-soft)' : 'var(--color-background-mute)'};
    color: var(--color-text-1);
    .anticon,
    .lucide {
      color: var(--color-text-1);
    }
  }
  .anticon,
  .iconfont {
    cursor: pointer;
    font-size: 14px;
    color: var(--color-icon);
  }
  .icon-at {
    font-size: 16px;
  }
`

export default memo(MessageMenubar)
