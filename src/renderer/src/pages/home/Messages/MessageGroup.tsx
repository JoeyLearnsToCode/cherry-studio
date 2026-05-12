import { loggerService } from '@logger'
import Scrollbar from '@renderer/components/Scrollbar'
import { MessageEditingProvider } from '@renderer/context/MessageEditingContext'
import { useChatContext } from '@renderer/hooks/useChatContext'
import { useMessageOperations } from '@renderer/hooks/useMessageOperations'
import { useSettings } from '@renderer/hooks/useSettings'
import { useTimer } from '@renderer/hooks/useTimer'
import { EVENT_NAMES, EventEmitter } from '@renderer/services/EventService'
import { MultiModelMessageStyle } from '@renderer/store/settings'
import type { Topic } from '@renderer/types'
import type { Message } from '@renderer/types/newMessage'
import { classNames } from '@renderer/utils'
import { Popover } from 'antd'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import styled from 'styled-components'

import { useChatMaxWidth } from '../Chat'
import MessageItem from './Message'
import MessageGroupMenuBar from './MessageGroupMenuBar'

const logger = loggerService.withContext('MessageGroup')

const LONG_PRESS_DURATION = 500 // ms

interface Props {
  messages: (Message & { index: number })[]
  topic: Topic
  assistant: import('@renderer/types').Assistant
  registerMessageElement?: (id: string, element: HTMLElement | null) => void
}

const MessageGroup = ({ messages, topic, assistant, registerMessageElement }: Props) => {
  const messageLength = messages.length

  // Hooks
  const { editMessage } = useMessageOperations(topic)
  const { multiModelMessageStyle: multiModelMessageStyleSetting, gridColumns, gridPopoverTrigger } = useSettings()
  const { isMultiSelectMode } = useChatContext(topic)
  const maxWidth = useChatMaxWidth()
  const { setTimeoutTimer } = useTimer()

  const isGrouped = isMultiSelectMode ? false : messageLength > 1 && messages.every((m) => m.role === 'assistant')

  // States
  const [_multiModelMessageStyle, setMultiModelMessageStyle] = useState<MultiModelMessageStyle>(
    messages[0].multiModelMessageStyle || multiModelMessageStyleSetting
  )
  const [selectedIndex, setSelectedIndex] = useState(messageLength - 1)

  // Refs
  const prevMessageLengthRef = useRef(messageLength)

  // 对于单模型消息，采用简单的样式，避免 overflow 影响内部的 sticky 效果
  const multiModelMessageStyle = useMemo(
    () => (messageLength < 2 ? 'fold' : _multiModelMessageStyle),
    [_multiModelMessageStyle, messageLength]
  )

  const isGrid = multiModelMessageStyle === 'grid'

  const selectedMessageId = useMemo(() => {
    if (messages.length === 1) return messages[0]?.id
    const selectedMessage = messages.find((message) => message.foldSelected)
    if (selectedMessage) {
      return selectedMessage.id
    }
    return messages[0]?.id
  }, [messages])

  const setSelectedMessage = useCallback(
    (message: Message) => {
      // 前一个
      editMessage(selectedMessageId, { foldSelected: false })
      // 当前选中的消息
      editMessage(message.id, { foldSelected: true })

      setTimeoutTimer(
        'setSelectedMessage',
        () => {
          const messageElement = document.getElementById(`message-${message.id}`)
          if (messageElement) {
            messageElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        },
        200
      )
    },
    [editMessage, selectedMessageId, setTimeoutTimer]
  )

  useEffect(() => {
    if (messageLength > prevMessageLengthRef.current) {
      setSelectedIndex(messageLength - 1)
      // Do NOT call setSelectedMessage here — new message detection in the
      // messages useEffect below handles scrolling to genuinely new messages.
      // Calling setSelectedMessage with messages[messageLength-1] can scroll
      // to the wrong message when insertMessageAtIndex places the new message
      // somewhere other than the array tail.
    } else {
      const newIndex = messages.findIndex((msg) => msg.id === selectedMessageId)
      if (newIndex !== -1) {
        setSelectedIndex(newIndex)
      }
    }
    prevMessageLengthRef.current = messageLength
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageLength])

  // 添加对流程图节点点击事件的监听
  useEffect(() => {
    // 只在组件挂载和消息数组变化时添加监听器
    if (!isGrouped || messageLength <= 1) return

    const handleFlowNavigate = (event: CustomEvent) => {
      const { messageId } = event.detail

      // 查找对应的消息在当前消息组中的索引
      const targetIndex = messages.findIndex((msg) => msg.id === messageId)

      // 如果找到消息且不是当前选中的索引，则切换标签
      if (targetIndex !== -1 && targetIndex !== selectedIndex) {
        setSelectedIndex(targetIndex)

        // 使用setSelectedMessage函数来切换标签，这是处理foldSelected的关键
        const targetMessage = messages[targetIndex]
        if (targetMessage) {
          setSelectedMessage(targetMessage)
        }
      }
    }

    // 添加事件监听器
    document.addEventListener('flow-navigate-to-message', handleFlowNavigate as EventListener)

    // 清理函数
    return () => {
      document.removeEventListener('flow-navigate-to-message', handleFlowNavigate as EventListener)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, selectedIndex, isGrouped, messageLength])

  // 添加对LOCATE_MESSAGE事件的监听
  // 跟踪上一次的消息列表，用于检测新消息
  const prevMessagesRef = useRef<Message[]>([])

  useEffect(() => {
    // 为每个消息注册一个定位事件监听器
    const eventHandlers: { [key: string]: () => void } = {}

    messages.forEach((message) => {
      const eventName = EVENT_NAMES.LOCATE_MESSAGE + ':' + message.id
      const handler = () => {
        logger.debug(`[LOCATE_MESSAGE] Received event for message ${message.id}`)
        // 使用 requestAnimationFrame 等待 DOM 渲染完成后再滚动
        const tryScroll = () => {
          const element = document.getElementById(`message-${message.id}`)
          if (element) {
            const display = window.getComputedStyle(element).display
            logger.debug(`[LOCATE_MESSAGE] Found element for message ${message.id}, display: ${display}`)

            if (display === 'none') {
              // 如果消息隐藏，先切换标签
              logger.debug(`[LOCATE_MESSAGE] Message hidden, switching to message ${message.id}`)
              setSelectedMessage(message)
            } else {
              // 直接滚动
              logger.debug(`[LOCATE_MESSAGE] Scrolling to message ${message.id}`)
              element.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
          } else {
            // 元素尚未渲染，延迟后重试
            logger.debug(`[LOCATE_MESSAGE] Element not found for message ${message.id}, retrying...`)
            requestAnimationFrame(tryScroll)
          }
        }
        requestAnimationFrame(tryScroll)
      }

      eventHandlers[eventName] = handler
      EventEmitter.on(eventName, handler)
    })

    // 检测新消息并自动滚动（已禁用：移除发送消息后的自动滚动）
    const prevMessageIds = new Set(prevMessagesRef.current.map((m) => m.id))
    const newMessages = messages.filter((m) => !prevMessageIds.has(m.id))

    if (newMessages.length > 0) {
      const lastNewMessage = newMessages[newMessages.length - 1]
      // 不再执行任何滚动操作
      logger.debug(`[MessageGroup] Detected new message ${lastNewMessage.id}, but auto-scroll disabled.`)
    }

    // 更新 prevMessagesRef
    prevMessagesRef.current = messages

    // 清理函数
    return () => {
      // 移除所有事件监听器
      Object.entries(eventHandlers).forEach(([eventName, handler]) => {
        EventEmitter.off(eventName, handler)
      })
    }
  }, [messages, setSelectedMessage])

  useEffect(() => {
    messages.forEach((message) => {
      const element = document.getElementById(`message-${message.id}`)
      element && registerMessageElement?.(message.id, element)
    })
    return () => messages.forEach((message) => registerMessageElement?.(message.id, null))
  }, [messages, registerMessageElement])

  const onUpdateUseful = useCallback(
    (msgId: string) => {
      const message = messages.find((msg) => msg.id === msgId)
      if (!message) {
        logger.error("the message to update doesn't exist in this group")
        return
      }
      if (message.useful) {
        editMessage(msgId, { useful: undefined })
        return
      } else {
        const toResetUsefulMsgs = messages.filter((msg) => msg.id !== msgId && msg.useful)
        toResetUsefulMsgs.forEach(async (msg) => {
          editMessage(msg.id, {
            useful: undefined
          })
        })
        editMessage(msgId, { useful: true })
      }
    },
    [editMessage, messages]
  )

  const groupContextMessageId = useMemo(() => {
    // NOTE: 旧数据可能存在一组消息有多个useful的情况，只取第一个，不再另作迁移
    // find first useful
    const usefulMsg = messages.find((msg) => msg.useful)
    if (usefulMsg) {
      return usefulMsg.id
    } else if (messages.length > 0) {
      return messages[0].id
    } else {
      logger.warn('Empty message group')
      return ''
    }
  }, [messages])

  const renderMessage = useCallback(
    (message: Message & { index: number }) => {
      const isGridGroupMessage = isGrid && message.role === 'assistant' && isGrouped
      const messageProps = {
        isGrouped,
        message,
        topic,
        index: message.index
      }

      const messageContent = (
        <MessageWrapper
          id={`message-${message.id}`}
          key={message.id}
          className={classNames([
            {
              [multiModelMessageStyle]: message.role === 'assistant' && messages.length > 1,
              selected: message.id === selectedMessageId
            }
          ])}
          onClick={(e) => {
            if (isGridGroupMessage) {
              e.stopPropagation()
            }
          }}>
          <MessageItem
            onUpdateUseful={onUpdateUseful}
            isGroupContextMessage={isGrouped && message.id === groupContextMessageId}
            {...messageProps}
          />
        </MessageWrapper>
      )

      if (isGridGroupMessage) {
        return (
          <GridPopoverCard
            key={message.id}
            message={message}
            messageProps={messageProps}
            multiModelMessageStyle={multiModelMessageStyle}
            messagesLength={messages.length}
            selectedMessageId={selectedMessageId}
            onUpdateUseful={onUpdateUseful}
            groupContextMessageId={groupContextMessageId}
            isGrouped={isGrouped}
            gridPopoverTrigger={gridPopoverTrigger}>
            {messageContent}
          </GridPopoverCard>
        )
      }

      return messageContent
    },
    [
      isGrid,
      isGrouped,
      topic,
      multiModelMessageStyle,
      messages.length,
      selectedMessageId,
      onUpdateUseful,
      groupContextMessageId,
      gridPopoverTrigger
    ]
  )

  return (
    <MessageEditingProvider>
      <GroupContainer
        id={messages[0].askId ? `message-group-${messages[0].askId}` : undefined}
        className={classNames(['message-group', multiModelMessageStyle, { 'multi-select-mode': isMultiSelectMode }])}
        style={{ maxWidth }}>
        <GridContainer
          $count={messageLength}
          $gridColumns={gridColumns}
          className={classNames([multiModelMessageStyle, { 'multi-select-mode': isMultiSelectMode }])}>
          {messages.map(renderMessage)}
        </GridContainer>
        {isGrouped && (
          <MessageGroupMenuBar
            multiModelMessageStyle={multiModelMessageStyle}
            setMultiModelMessageStyle={(style) => {
              setMultiModelMessageStyle(style)
              messages.forEach((message) => {
                editMessage(message.id, { multiModelMessageStyle: style })
              })
            }}
            messages={messages}
            selectMessageId={selectedMessageId}
            setSelectedMessage={setSelectedMessage}
            topic={topic}
            assistant={assistant}
          />
        )}
      </GroupContainer>
    </MessageEditingProvider>
  )
}

const GroupContainer = styled.div`
  [navbar-position='left'] & {
    max-width: calc(100vw - var(--sidebar-width) - var(--assistants-width) - 20px);
  }
  &.horizontal,
  &.grid {
    padding: 4px 10px;
    .group-menu-bar {
      margin-left: 0;
      margin-right: 0;
    }
    .long-press-ready .grid {
      cursor: default;
    }
  }
  &.multi-select-mode {
    padding: 5px 10px;
  }
`

const GridContainer = styled(Scrollbar)<{ $count: number; $gridColumns: number }>`
  width: 100%;
  display: grid;
  overflow-y: visible;
  gap: 16px;
  &.horizontal {
    padding-bottom: 4px;
    grid-template-columns: repeat(${({ $count }) => $count}, minmax(420px, 1fr));
    overflow-x: auto;
    &::-webkit-scrollbar {
      display: block;
      height: 8px;
    }
    &::-webkit-scrollbar-thumb {
      background-color: var(--color-border);
      border-radius: 4px;
    }
    &::-webkit-scrollbar-track {
      background-color: transparent;
    }
  }
  &.fold,
  &.vertical {
    grid-template-columns: repeat(1, minmax(0, 1fr));
    gap: 8px;
  }
  &.grid {
    grid-template-columns: repeat(
      ${({ $count, $gridColumns }) => ($count > 1 ? $gridColumns || 2 : 1)},
      minmax(0, 1fr)
    );
    grid-template-rows: auto;
  }

  &.multi-select-mode {
    grid-template-columns: repeat(1, minmax(0, 1fr));
    gap: 10px;
    .grid {
      height: auto;
    }
    .message {
      border: 0.5px solid var(--color-border);
      border-radius: 10px;
      padding: 10px;
      .message-content-container {
        max-height: 200px;
        overflow-y: hidden !important;
      }
      .MessageFooter {
        display: none;
      }
    }
  }
`

interface MessageWrapperProps {
  $isInPopover?: boolean
}

const MessageWrapper = styled.div<MessageWrapperProps>`
  &.horizontal {
    max-height: 120vh;
    overflow: hidden;
    padding: 1px;
    .message {
      height: 100%;
      border: 0.5px solid var(--color-border);
      border-radius: 10px;
    }
    .message-content-container {
      flex: 1;
      min-height: 0;
      padding-left: 0;
      overflow-y: auto !important;
      margin-right: -10px;
    }
    .MessageFooter {
      margin-left: 0;
      margin-top: 2px;
      margin-bottom: 2px;
    }
    /* 图片以自然比例渲染，宽度撑满卡片 */
    .ant-image {
      display: block !important;
      width: 100% !important;
    }
    .ant-image img {
      width: 100% !important;
      height: auto !important;
      max-width: 100% !important;
      max-height: none !important;
      object-fit: contain !important;
    }
  }
  &.grid {
    max-height: var(--grid-card-max-height, none);
    overflow-y: auto;
    overflow-x: hidden;
    border: 0.5px solid var(--color-border);
    border-radius: 10px;
    cursor: pointer;
    .message-content-container {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      padding-left: 0;
    }
    .MessageFooter {
      margin-left: 0;
      margin-top: 2px;
      margin-bottom: 2px;
      .menubar {
        flex-shrink: 0;
      }
      .message-tokens {
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
    }
    /* 图片以自然比例渲染，宽度撑满卡片 */
    .ant-image {
      display: block !important;
      width: 100% !important;
    }
    .ant-image img {
      width: 100% !important;
      height: auto !important;
      max-width: 100% !important;
      max-height: none !important;
      object-fit: contain !important;
    }
  }
  &.in-popover {
    height: auto;
    border: none;
    max-height: 80vh;
    overflow-y: auto;
    cursor: default;
    .message-content-container {
      padding-left: 0;
      pointer-events: auto;
    }
    .MessageFooter {
      margin-left: 0;
    }
  }
  &.fold {
    display: none;
    &.selected {
      display: inline-block;
    }
  }
`

/** Module-level coordinator: only one grid popover can be open at a time */
let closeActiveGridPopover: (() => void) | null = null

/** Grid card with popover, supporting hover/click/longPress triggers */
const GridPopoverCard = memo(function GridPopoverCard({
  message,
  messageProps,
  multiModelMessageStyle,
  messagesLength,
  selectedMessageId,
  onUpdateUseful,
  gridPopoverTrigger,
  children
}: {
  message: Message & { index: number }
  messageProps: { isGrouped: boolean; message: Message & { index: number }; topic: Topic; index: number }
  multiModelMessageStyle: MultiModelMessageStyle
  messagesLength: number
  selectedMessageId: string | undefined
  onUpdateUseful: (msgId: string) => void
  groupContextMessageId: string
  isGrouped: boolean
  gridPopoverTrigger: 'hover' | 'click' | 'longPress'
  children: React.ReactNode
}) {
  const isLongPress = gridPopoverTrigger === 'longPress'

  // State for longPress mode
  const [popoverOpen, setPopoverOpen] = useState(false)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressSatisfiedRef = useRef(false) // true after holding >= LONG_PRESS_DURATION

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  const openPopover = useCallback(() => {
    // Close any previously open grid popover first
    closeActiveGridPopover?.()
    setPopoverOpen(true)
    // Register this popover as the active one
    closeActiveGridPopover = () => setPopoverOpen(false)
  }, [])

  const cardRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Dynamically set max-height on grid cards based on card width * aspect ratio
  useEffect(() => {
    const el = cardRef.current || wrapperRef.current
    if (!el) return

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width) {
        el.style.setProperty('--grid-card-max-height', `${width * 1.5}px`)
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!isLongPress) return
      if (e.button !== 0) return // Only left button
      clearLongPressTimer()
      longPressSatisfiedRef.current = false
      longPressTimerRef.current = setTimeout(() => {
        // Mark that the long-press duration has been satisfied
        // Don't open yet — wait for mouseup
        longPressSatisfiedRef.current = true
        // One-time visual feedback: cursor changes from pointer to default
        cardRef.current?.classList.add('long-press-ready')
      }, LONG_PRESS_DURATION)
    },
    [isLongPress, clearLongPressTimer]
  )

  const handleMouseUp = useCallback(() => {
    if (!isLongPress) return
    clearLongPressTimer()
    if (longPressSatisfiedRef.current) {
      longPressSatisfiedRef.current = false
      openPopover()
    }
  }, [isLongPress, clearLongPressTimer, openPopover])

  const handleMouseLeave = useCallback(() => {
    if (!isLongPress) return
    clearLongPressTimer()
    longPressSatisfiedRef.current = false
  }, [isLongPress, clearLongPressTimer])

  const popoverContent = (
    <MessageWrapper
      className={classNames([
        'in-popover',
        {
          [multiModelMessageStyle]: message.role === 'assistant' && messagesLength > 1,
          selected: message.id === selectedMessageId
        }
      ])}>
      <MessageItem onUpdateUseful={onUpdateUseful} {...messageProps} />
    </MessageWrapper>
  )

  // For longPress mode, fully controlled Popover
  // Use trigger="click" so Ant Design properly tracks outside clicks and calls
  // onOpenChange(false) when clicking outside or on the card itself.
  // We block onOpenChange(true) to ensure only our long-press logic can open.
  if (isLongPress) {
    return (
      <Popover
        destroyOnHidden
        content={popoverContent}
        trigger="click"
        open={popoverOpen}
        onOpenChange={(open) => {
          if (open) return // Block: only long-press can open
          setPopoverOpen(false)
          if (closeActiveGridPopover === openPopover) closeActiveGridPopover = null
        }}
        styles={{
          root: { maxWidth: '40vw', overflowY: 'auto', zIndex: 1000 },
          body: { padding: 2 }
        }}>
        <div
          ref={cardRef}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}>
          {children}
        </div>
      </Popover>
    )
  }

  // For hover/click modes, use the original behavior
  return (
    <Popover
      destroyOnHidden
      content={popoverContent}
      trigger={gridPopoverTrigger}
      styles={{
        root: { maxWidth: '40vw', overflowY: 'auto', zIndex: 1000 },
        body: { padding: 2 }
      }}>
      <div ref={wrapperRef}>
        {children}
      </div>
    </Popover>
  )
})

export default memo(MessageGroup)
