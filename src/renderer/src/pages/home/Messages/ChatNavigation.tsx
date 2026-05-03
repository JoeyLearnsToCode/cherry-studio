import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  HistoryOutlined,
  VerticalAlignBottomOutlined,
  VerticalAlignTopOutlined
} from '@ant-design/icons'
import { RootState } from '@renderer/store'
import { Button, Drawer, Tooltip } from 'antd'
import { FC, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSelector } from 'react-redux'
import styled from 'styled-components'

import ChatFlowHistory from './ChatFlowHistory'

const POSITION_GAP = 16

interface ChatNavigationProps {
  containerId: string
  position?: 'left' | 'right'
}

const ChatNavigation: FC<ChatNavigationProps> = ({ containerId, position = 'right' }) => {
  const { t } = useTranslation()
  const [showChatHistory, setShowChatHistory] = useState(false)
  const currentTopicId = useSelector((state: RootState) => state.messages.currentTopicId)

  const handleChatHistoryClick = () => {
    setShowChatHistory(true)
  }

  const handleDrawerClose = () => {
    setShowChatHistory(false)
  }

  // Find all message group elements
  const findMessageGroups = () => {
    const container = document.getElementById(containerId)
    if (!container) return []

    return Array.from(container.querySelectorAll('.message-group')) as HTMLElement[]
  }

  const scrollToMessage = (element: HTMLElement) => {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const scrollToTop = () => {
    const container = document.getElementById(containerId)
    container && container.scrollTo({ top: -container.scrollHeight, behavior: 'smooth' })
  }

  const scrollToBottom = () => {
    const container = document.getElementById(containerId)
    container && container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
  }

  // Get the index of the currently visible message group based on scroll direction
  const getCurrentVisibleGroupIndex = (direction: 'up' | 'down') => {
    const groups = findMessageGroups()
    const container = document.getElementById(containerId)

    if (!container || groups.length === 0) return -1

    const containerRect = container.getBoundingClientRect()
    const visibleThreshold = containerRect.height * 0.1

    const visibleIndices: number[] = []

    for (let i = 0; i < groups.length; i++) {
      const groupRect = groups[i].getBoundingClientRect()
      const visibleHeight =
        Math.min(groupRect.bottom, containerRect.bottom) - Math.max(groupRect.top, containerRect.top)
      if (visibleHeight > 0 && visibleHeight >= Math.min(groupRect.height, visibleThreshold)) {
        visibleIndices.push(i)
      }
    }

    if (visibleIndices.length > 0) {
      return direction === 'up' ? Math.max(...visibleIndices) : Math.min(...visibleIndices)
    }

    return -1
  }

  const handleScrollToTop = () => {
    scrollToTop()
  }

  const handleScrollToBottom = () => {
    scrollToBottom()
  }

  const handleNextMessage = () => {
    const groups = findMessageGroups()

    if (groups.length === 0) {
      return scrollToBottom()
    }

    const visibleIndex = getCurrentVisibleGroupIndex('down')

    if (visibleIndex === -1) {
      return scrollToBottom()
    }

    const targetIndex = visibleIndex - 1

    if (targetIndex < 0) {
      return scrollToBottom()
    }

    scrollToMessage(groups[targetIndex])
  }

  const handlePrevMessage = () => {
    const groups = findMessageGroups()

    if (groups.length === 0) {
      return scrollToTop()
    }

    const visibleIndex = getCurrentVisibleGroupIndex('up')

    if (visibleIndex === -1) {
      return scrollToTop()
    }

    const targetIndex = visibleIndex + 1

    if (targetIndex >= groups.length) {
      return scrollToTop()
    }

    scrollToMessage(groups[targetIndex])
  }

  return (
    <>
      <NavigationContainer $position={position}>
        <ButtonGroup>
          <Tooltip title={t('chat.navigation.top')} placement={position === 'left' ? 'right' : 'left'} mouseEnterDelay={0.5}>
            <NavigationButton
              type="text"
              icon={<VerticalAlignTopOutlined />}
              onClick={handleScrollToTop}
              aria-label={t('chat.navigation.top')}
            />
          </Tooltip>
          <Divider />
          <Tooltip title={t('chat.navigation.prev')} placement={position === 'left' ? 'right' : 'left'} mouseEnterDelay={0.5}>
            <NavigationButton
              type="text"
              icon={<ArrowUpOutlined />}
              onClick={handlePrevMessage}
              aria-label={t('chat.navigation.prev')}
            />
          </Tooltip>
          <Divider />
          <Tooltip title={t('chat.navigation.next')} placement={position === 'left' ? 'right' : 'left'} mouseEnterDelay={0.5}>
            <NavigationButton
              type="text"
              icon={<ArrowDownOutlined />}
              onClick={handleNextMessage}
              aria-label={t('chat.navigation.next')}
            />
          </Tooltip>
          <Divider />
          <Tooltip title={t('chat.navigation.bottom')} placement={position === 'left' ? 'right' : 'left'} mouseEnterDelay={0.5}>
            <NavigationButton
              type="text"
              icon={<VerticalAlignBottomOutlined />}
              onClick={handleScrollToBottom}
              aria-label={t('chat.navigation.bottom')}
            />
          </Tooltip>
          <Divider />
          <Tooltip title={t('chat.navigation.history')} placement={position === 'left' ? 'right' : 'left'} mouseEnterDelay={0.5}>
            <NavigationButton
              type="text"
              icon={<HistoryOutlined />}
              onClick={handleChatHistoryClick}
              aria-label={t('chat.navigation.history')}
            />
          </Tooltip>
        </ButtonGroup>
      </NavigationContainer>

      <Drawer
        title={t('chat.history.title')}
        placement="right"
        onClose={handleDrawerClose}
        open={showChatHistory}
        width={680}
        destroyOnHidden
        styles={{
          header: { border: 'none' },
          body: {
            padding: 0,
            height: 'calc(100% - 55px)'
          }
        }}>
        <ChatFlowHistory conversationId={currentTopicId || undefined} />
      </Drawer>
    </>
  )
}

interface NavigationContainerProps {
  $position: 'left' | 'right'
}

const NavigationContainer = styled.div<NavigationContainerProps>`
  position: fixed;
  ${(props) => (props.$position === 'left' ? `left: ${POSITION_GAP}px;` : `right: ${POSITION_GAP}px;`)}
  top: 50%;
  transform: translateY(-50%);
  z-index: 999;
`

const ButtonGroup = styled.div`
  display: flex;
  flex-direction: column;
  background: var(--bg-color);
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  backdrop-filter: blur(8px);
  border: 1px solid var(--color-border);
`

const NavigationButton = styled(Button)`
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0;
  border: none;
  color: var(--color-text);
  transition: all 0.2s ease-in-out;

  &:hover {
    background-color: var(--color-hover);
    color: var(--color-primary);
  }

  .anticon {
    font-size: 14px;
  }
`

const Divider = styled.div`
  height: 1px;
  background: var(--color-border);
  margin: 0;
`

export default ChatNavigation
