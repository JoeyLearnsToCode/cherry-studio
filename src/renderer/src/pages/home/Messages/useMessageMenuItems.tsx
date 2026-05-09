import { InfoCircleOutlined } from '@ant-design/icons'
import { CopyIcon, EditIcon, RefreshIcon } from '@renderer/components/Icons'
import ObsidianExportPopup from '@renderer/components/Popups/ObsidianExportPopup'
import SaveToKnowledgePopup from '@renderer/components/Popups/SaveToKnowledgePopup'
import { SelectModelPopup } from '@renderer/components/Popups/SelectModelPopup'
import { isEmbeddingModel, isRerankModel, isVisionModel } from '@renderer/config/models'
import { useMessageEditing } from '@renderer/context/MessageEditingContext'
import { useChatContext } from '@renderer/hooks/useChatContext'
import { useMessageOperations, useTopicLoading } from '@renderer/hooks/useMessageOperations'
import { useNotesSettings } from '@renderer/hooks/useNotesSettings'
import { useAllProviders } from '@renderer/hooks/useProvider'
import { useEnableDeveloperMode } from '@renderer/hooks/useSettings'
import { useTemporaryValue } from '@renderer/hooks/useTemporaryValue'
import useTranslate from '@renderer/hooks/useTranslate'
import { EVENT_NAMES, EventEmitter } from '@renderer/services/EventService'
import { getMessageTitle } from '@renderer/services/MessagesService'
import { translateText } from '@renderer/services/TranslateService'
import store, { RootState, useAppDispatch } from '@renderer/store'
import { messageBlocksSelectors, removeOneBlock } from '@renderer/store/messageBlock'
import { selectMessagesForTopic } from '@renderer/store/newMessage'
import { TraceIcon } from '@renderer/trace/pages/Component'
import type { Assistant, Model, Topic, TranslateLanguage } from '@renderer/types'
import { type Message, MessageBlockType } from '@renderer/types/newMessage'
import { captureScrollableAsBlob, captureScrollableAsDataURL, modalConfirm } from '@renderer/utils'
import { copyMessageAsPlainText } from '@renderer/utils/copy'
import {
  exportMarkdownToJoplin,
  exportMarkdownToSiyuan,
  exportMarkdownToYuque,
  exportMessageAsMarkdown,
  exportMessageToNotes,
  exportMessageToNotion,
  messageToMarkdown
} from '@renderer/utils/export'
import { removeTrailingDoubleSpaces } from '@renderer/utils/markdown'
import {
  findMainTextBlocks,
  findTranslationBlocks,
  findTranslationBlocksById,
  getMainTextContent
} from '@renderer/utils/messageUtils/find'
import { MenuProps } from 'antd'
import dayjs from 'dayjs'
import {
  AtSign,
  Check,
  FilePenLine,
  Languages,
  ListChecks,
  MessageSquarePlus,
  Save,
  Split,
  ThumbsUp,
  Trash2,
  Upload
} from 'lucide-react'
import React, { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSelector } from 'react-redux'

interface UseMessageMenuItemsProps {
  message: Message
  assistant: Assistant
  topic: Topic
  model?: Model
  index?: number
  isGrouped?: boolean
  isLastMessage: boolean
  isAssistantMessage: boolean
  messageContainerRef: React.RefObject<HTMLDivElement>
  onUpdateUseful?: (msgId: string) => void
  deleteConfirmOpen?: boolean
  onToggleDeleteConfirm?: () => void
  deleteClickRef?: React.MutableRefObject<boolean>
}

export function useMessageMenuItems(props: UseMessageMenuItemsProps) {
  const allProviders = useAllProviders()
  const {
    message,
    index,
    isGrouped,
    isAssistantMessage,
    assistant,
    topic,
    model,
    messageContainerRef,
    onUpdateUseful,
    deleteConfirmOpen = false,
    onToggleDeleteConfirm,
    deleteClickRef
  } = props

  const { t } = useTranslation()
  const { notesPath } = useNotesSettings()
  const { toggleMultiSelectMode } = useChatContext(props.topic)
  const [copied, setCopied] = useTemporaryValue(false, 2000)
  const [isTranslating, setIsTranslating] = useState(false)
  const { translateLanguages } = useTranslate()

  const {
    deleteMessage,
    resendMessage,
    regenerateAssistantMessage,
    getTranslationUpdater,
    appendAssistantResponse,
    respondToUserMessage,
    removeMessageBlock
  } = useMessageOperations(topic)

  const { enableDeveloperMode } = useEnableDeveloperMode()
  const loading = useTopicLoading(topic)
  const exportMenuOptions = useSelector((state: RootState) => state.settings.exportMenuOptions)
  const dispatch = useAppDispatch()
  const blockEntities = useSelector(messageBlocksSelectors.selectEntities)

  const mainTextContent = useMemo(() => {
    return getMainTextContent(message)
  }, [message])

  const onCopy = useCallback(
    (e?: any) => {
      e?.stopPropagation?.()
      e?.domEvent?.stopPropagation?.()
      const currentMessageId = message.id
      const latestMessageEntity = store.getState().messages.entities[currentMessageId]
      let contentToCopy = ''
      if (latestMessageEntity) {
        contentToCopy = getMainTextContent(latestMessageEntity as Message)
      } else {
        contentToCopy = getMainTextContent(message)
      }
      navigator.clipboard.writeText(removeTrailingDoubleSpaces(contentToCopy.trimStart()))
      window.toast.success({ title: t('message.copied'), key: 'copy-message' })
      setCopied(true)
    },
    [message, setCopied, t]
  )

  const onNewBranch = useCallback(async () => {
    if (loading) return
    EventEmitter.emit(EVENT_NAMES.NEW_BRANCH, index)
    window.toast.success({ title: t('chat.message.new.branch.created'), key: 'new-branch' })
  }, [index, t, loading])

  const handleResendUserMessage = useCallback(
    async (messageUpdate?: Message) => {
      await resendMessage(messageUpdate ?? message, assistant)
    },
    [assistant, message, resendMessage]
  )

  const { startEditing } = useMessageEditing()

  const onEdit = useCallback(async () => {
    startEditing(message.id)
  }, [message.id, startEditing])

  const handleTranslate = useCallback(
    async (language: TranslateLanguage) => {
      if (isTranslating) return
      setIsTranslating(true)
      const translationUpdater = await getTranslationUpdater(message.id, language.langCode)
      if (!translationUpdater) return
      try {
        await translateText(mainTextContent, language, translationUpdater)
      } catch (error) {
        window.toast.error({ title: t('translate.error.failed'), key: 'translate-message' })
        const translationBlocks = findTranslationBlocksById(message.id)
        if (translationBlocks.length > 0) {
          const block = translationBlocks[0]
          if (!block.content) {
            dispatch(removeOneBlock(block.id))
          }
        }
      } finally {
        setIsTranslating(false)
      }
    },
    [isTranslating, message.id, getTranslationUpdater, mainTextContent, t, dispatch]
  )

  const handleTraceUserMessage = useCallback(async () => {
    if (message.traceId) {
      window.api.trace.openWindow(
        message.topicId,
        message.traceId,
        true,
        message.role === 'user' ? undefined : message.model?.name
      )
    }
  }, [message])

  const isEditable = useMemo(() => {
    if (isAssistantMessage) return true
    return findMainTextBlocks(message).length > 0
  }, [message, isAssistantMessage])

  const onRegenerate = useCallback(async () => {
    if (message.status === 'processing' || message.status === 'pending' || message.status === 'searching') return
    regenerateAssistantMessage(message, assistant)
  }, [message, assistant, regenerateAssistantMessage])

  const onRegenerateWithConfirm = useCallback(async () => {
    const confirmed = await modalConfirm({
      title: t('message.regenerate.confirm'),
      icon: <InfoCircleOutlined style={{ color: 'red' }} />,
      okButtonProps: { danger: true }
    })
    if (confirmed) {
      onRegenerate()
    }
  }, [onRegenerate, t])

  const onDelete = useCallback(async () => {
    deleteMessage(message.id, message.traceId, message.model?.name)
  }, [deleteMessage, message.id, message.traceId, message.model?.name])

  const onDeleteWithConfirm = useCallback(async () => {
    const confirmed = await modalConfirm({
      title: t('message.message.delete.content'),
      icon: <InfoCircleOutlined style={{ color: 'red' }} />,
      okButtonProps: { danger: true }
    })
    if (confirmed) {
      onDelete()
    }
  }, [onDelete, t])

  const mentionModelFilter = useMemo(() => {
    const defaultFilter = (model: Model) => !isEmbeddingModel(model) && !isRerankModel(model)
    if (!isAssistantMessage) return defaultFilter
    const state = store.getState()
    const topicMessages: Message[] = selectMessagesForTopic(state, topic.id)
    const relatedUserMessage = topicMessages.find((msg) => msg.role === 'user' && message.askId === msg.id)
    if (!relatedUserMessage) return defaultFilter
    const relatedUserMessageBlocks = relatedUserMessage.blocks.map((msgBlockId) =>
      messageBlocksSelectors.selectById(store.getState(), msgBlockId)
    )
    if (!relatedUserMessageBlocks) return defaultFilter
    if (relatedUserMessageBlocks.some((block) => block && block.type === MessageBlockType.IMAGE)) {
      return (m: Model) => isVisionModel(m) && defaultFilter(m)
    }
    return defaultFilter
  }, [isAssistantMessage, message.askId, topic.id])

  const userMessageModelFilter = useMemo(() => {
    const defaultFilter = (model: Model) => !isEmbeddingModel(model) && !isRerankModel(model)
    if (message.role !== 'user') return defaultFilter
    const userMessageBlocks = message.blocks.map((blockId) =>
      messageBlocksSelectors.selectById(store.getState(), blockId)
    )
    if (userMessageBlocks.some((block) => block && block.type === MessageBlockType.IMAGE)) {
      return (m: Model) => isVisionModel(m) && defaultFilter(m)
    }
    return defaultFilter
  }, [message.role, message.blocks])

  const onMentionModel = useCallback(async () => {
    const selectedModel = await SelectModelPopup.show({ model, providers: allProviders })
    if (!selectedModel) return
    appendAssistantResponse(message, selectedModel, { ...assistant, model: selectedModel })
  }, [appendAssistantResponse, assistant, mentionModelFilter, message, model])

  const onRegenerateWithSameModel = useCallback(async () => {
    if (!model) return
    appendAssistantResponse(message, model, { ...assistant, model })
  }, [appendAssistantResponse, assistant, message, model])

  const onRespondToUserMessage = useCallback(async () => {
    const selectedModel = await SelectModelPopup.show({ model, providers: allProviders })
    if (!selectedModel) return
    respondToUserMessage(message, selectedModel, { ...assistant, model: selectedModel })
  }, [respondToUserMessage, assistant, userMessageModelFilter, message, model])

  const onUseful = useCallback(() => {
    onUpdateUseful?.(message.id)
  }, [message.id, onUpdateUseful])

  const hasTranslationBlocks = useMemo(() => {
    return findTranslationBlocks(message).length > 0
  }, [message])

  const moreMenuItems = useMemo(
    () => [
      ...(isEditable
        ? [
            {
              label: t('common.edit'),
              key: 'edit',
              icon: <FilePenLine size={15} />,
              onClick: onEdit
            }
          ]
        : []),
      {
        label: t('chat.message.new.branch.label'),
        key: 'new-branch',
        icon: <Split size={15} />,
        onClick: onNewBranch
      },
      {
        label: t('chat.multiple.select.label'),
        key: 'multi-select',
        icon: <ListChecks size={15} />,
        onClick: () => toggleMultiSelectMode(true)
      },
      {
        label: t('chat.save.label'),
        key: 'save',
        icon: <Save size={15} />,
        children: [
          {
            label: t('chat.save.file.title'),
            key: 'file',
            onClick: () => {
              const fileName = dayjs(message.createdAt).format('YYYYMMDDHHmm') + '.md'
              window.api.file.save(fileName, mainTextContent)
            }
          },
          {
            label: t('chat.save.knowledge.title'),
            key: 'knowledge',
            onClick: () => SaveToKnowledgePopup.showForMessage(message)
          },
          {
            label: t('notes.save'),
            key: 'clipboard',
            onClick: async () => {
              const title = await getMessageTitle(message)
              const markdown = messageToMarkdown(message)
              exportMessageToNotes(title, markdown, notesPath)
            }
          }
        ]
      },
      {
        label: t('chat.topics.export.title'),
        key: 'export',
        icon: <Upload size={15} />,
        children: [
          exportMenuOptions.plain_text && {
            label: t('chat.topics.copy.plain_text'),
            key: 'copy_message_plain_text',
            onClick: () => copyMessageAsPlainText(message)
          },
          exportMenuOptions.image && {
            label: t('chat.topics.copy.image'),
            key: 'img',
            onClick: async () => {
              await captureScrollableAsBlob(messageContainerRef, async (blob) => {
                if (blob) {
                  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
                }
              })
            }
          },
          exportMenuOptions.image && {
            label: t('chat.topics.export.image'),
            key: 'image',
            onClick: async () => {
              const imageData = await captureScrollableAsDataURL(messageContainerRef)
              const title = await getMessageTitle(message)
              if (title && imageData) {
                window.api.file.saveImage(title, imageData)
              }
            }
          },
          exportMenuOptions.markdown && {
            label: t('chat.topics.export.md.label'),
            key: 'markdown',
            onClick: () => exportMessageAsMarkdown(message)
          },
          exportMenuOptions.markdown_reason && {
            label: t('chat.topics.export.md.reason'),
            key: 'markdown_reason',
            onClick: () => exportMessageAsMarkdown(message, true)
          },
          exportMenuOptions.docx && {
            label: t('chat.topics.export.word'),
            key: 'word',
            onClick: async () => {
              const markdown = messageToMarkdown(message)
              const title = await getMessageTitle(message)
              window.api.export.toWord(markdown, title)
            }
          },
          exportMenuOptions.notion && {
            label: t('chat.topics.export.notion'),
            key: 'notion',
            onClick: async () => {
              const title = await getMessageTitle(message)
              const markdown = messageToMarkdown(message)
              exportMessageToNotion(title, markdown, message)
            }
          },
          exportMenuOptions.yuque && {
            label: t('chat.topics.export.yuque'),
            key: 'yuque',
            onClick: async () => {
              const title = await getMessageTitle(message)
              const markdown = messageToMarkdown(message)
              exportMarkdownToYuque(title, markdown)
            }
          },
          exportMenuOptions.obsidian && {
            label: t('chat.topics.export.obsidian'),
            key: 'obsidian',
            onClick: async () => {
              const title = topic.name?.replace(/\//g, '_') || 'Untitled'
              await ObsidianExportPopup.show({ title, message, processingMethod: '1' })
            }
          },
          exportMenuOptions.joplin && {
            label: t('chat.topics.export.joplin'),
            key: 'joplin',
            onClick: async () => {
              const title = await getMessageTitle(message)
              exportMarkdownToJoplin(title, message)
            }
          },
          exportMenuOptions.siyuan && {
            label: t('chat.topics.export.siyuan'),
            key: 'siyuan',
            onClick: async () => {
              const title = await getMessageTitle(message)
              const markdown = messageToMarkdown(message)
              exportMarkdownToSiyuan(title, markdown)
            }
          }
        ].filter(Boolean) as MenuProps['items']
      }
    ],
    [
      isEditable,
      t,
      onEdit,
      onNewBranch,
      exportMenuOptions,
      toggleMultiSelectMode,
      message,
      mainTextContent,
      notesPath,
      messageContainerRef,
      topic.name
    ]
  )

  const translateMenu = useMemo(
    () => ({
      label: t('chat.translate'),
      key: 'translate',
      icon: <Languages size={15} />,
      children: [
        ...translateLanguages.map((item) => ({
          label: item.emoji + ' ' + item.label(),
          key: item.langCode,
          onClick: () => handleTranslate(item)
        })),
        ...(hasTranslationBlocks
          ? [
              { type: 'divider' as const },
              {
                label: '📋 ' + t('common.copy'),
                key: 'translate-copy',
                onClick: () => {
                  const translationBlocks = message.blocks
                    .map((blockId) => blockEntities[blockId])
                    .filter((block) => block?.type === 'translation')
                  if (translationBlocks.length > 0) {
                    const translationContent = translationBlocks
                      .map((block) => block?.content || '')
                      .join('\n\n')
                      .trim()
                    if (translationContent) {
                      navigator.clipboard.writeText(translationContent)
                      window.toast.success({ title: t('translate.copied'), key: 'translate-copy' })
                    } else {
                      window.toast.warning({ title: t('translate.empty'), key: 'translate-copy' })
                    }
                  }
                }
              },
              {
                label: '✖ ' + t('translate.close'),
                key: 'translate-close',
                onClick: () => {
                  const translationBlocks = message.blocks
                    .map((blockId) => blockEntities[blockId])
                    .filter((block) => block?.type === 'translation')
                    .map((block) => block?.id)
                  if (translationBlocks.length > 0) {
                    translationBlocks.forEach((blockId) => {
                      if (blockId) removeMessageBlock(message.id, blockId)
                    })
                    window.toast.success({ title: t('translate.closed'), key: 'translate-close' })
                  }
                }
              }
            ]
          : [])
      ]
    }),
    [
      t,
      translateLanguages,
      handleTranslate,
      hasTranslationBlocks,
      message.blocks,
      blockEntities,
      message.id,
      removeMessageBlock
    ]
  )

  const contextMenuItems = useMemo(
    () => [
      ...(message.role === 'user'
        ? [
            {
              label: t('common.regenerate'),
              key: 'regenerate-user',
              icon: <RefreshIcon size={15} />,
              onClick: () => handleResendUserMessage()
            },
            {
              label: t('common.edit'),
              key: 'edit-user',
              icon: <EditIcon size={15} />,
              onClick: onEdit
            },
            {
              label: t('message.mention.respondTitle'),
              key: 'respond-user',
              icon: <AtSign size={15} />,
              onClick: onRespondToUserMessage
            }
          ]
        : []),
      {
        label: t('common.copy'),
        key: 'copy',
        icon: copied ? <Check size={15} color="var(--color-primary)" /> : <CopyIcon size={15} />,
        onClick: onCopy
      },
      ...(isAssistantMessage
        ? [
            {
              label: t('common.regenerate'),
              key: 'regenerate-assistant',
              icon: <RefreshIcon size={15} />,
              onClick: onRegenerate
            },
            {
              label: t('message.regenerate.same_model'),
              key: 'regenerate-same-model',
              icon: <MessageSquarePlus size={15} />,
              onClick: onRegenerateWithSameModel
            },
            {
              label: t('message.mention.title'),
              key: 'mention-assistant',
              icon: <AtSign size={15} />,
              onClick: onMentionModel
            }
          ]
        : []),
      translateMenu,
      ...(isAssistantMessage && isGrouped
        ? [
            {
              label: t('chat.message.useful.label'),
              key: 'useful',
              icon: message.useful ? (
                <ThumbsUp size={17.5} fill="var(--color-primary)" strokeWidth={0} />
              ) : (
                <ThumbsUp size={15} />
              ),
              onClick: onUseful
            }
          ]
        : []),
      deleteConfirmOpen
        ? {
            label: t('common.delete'),
            key: 'delete',
            icon: <Trash2 size={15} style={{ color: 'white' }} />,
            style: { background: 'var(--color-error)', color: 'white', borderRadius: 4 },
            onClick: () => {
              if (deleteClickRef) deleteClickRef.current = false
              onDelete()
              onToggleDeleteConfirm?.()
            }
          }
        : {
            label: t('common.delete'),
            key: 'delete',
            icon: <Trash2 size={15} />,
            onClick: () => {
              if (deleteClickRef) deleteClickRef.current = true
              onToggleDeleteConfirm?.()
            }
          },
      { type: 'divider' as const },
      ...moreMenuItems,
      ...(enableDeveloperMode && message.traceId
        ? [
            {
              label: t('trace.label'),
              key: 'trace',
              icon: <TraceIcon size={16} />,
              onClick: handleTraceUserMessage
            }
          ]
        : [])
    ],
    [
      message.role,
      message.useful,
      message.traceId,
      t,
      handleResendUserMessage,
      onEdit,
      onRespondToUserMessage,
      copied,
      onCopy,
      isAssistantMessage,
      onRegenerateWithConfirm,
      onMentionModel,
      translateMenu,
      isGrouped,
      onUseful,
      onDelete,
      onToggleDeleteConfirm,
      deleteConfirmOpen,
      moreMenuItems,
      enableDeveloperMode,
      handleTraceUserMessage
    ]
  )

  const hasSelection = useCallback(() => {
    return !!window.getSelection()?.toString()
  }, [])

  return {
    onCopy,
    onEdit,
    onDelete,
    onDeleteWithConfirm,
    onRegenerate,
    onRegenerateWithConfirm,
    onRegenerateWithSameModel,
    onNewBranch,
    onMentionModel,
    onRespondToUserMessage,
    onUseful,
    handleResendUserMessage,
    handleTranslate,
    handleTraceUserMessage,
    moreMenuItems,
    contextMenuItems,
    translateMenu,
    copied,
    isTranslating,
    hasSelection
  }
}
