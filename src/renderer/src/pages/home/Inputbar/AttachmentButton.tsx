import { FileType } from '@renderer/types'
import { filterSupportedFiles } from '@renderer/utils/file'
import { Dropdown, Tooltip } from 'antd'
import { FileUp, Paperclip, Upload } from 'lucide-react'
import { FC, useCallback, useImperativeHandle, useState } from 'react'
import { useTranslation } from 'react-i18next'

import SelectUploadedFilesModal from './SelectUploadedFilesModal'

export interface AttachmentButtonRef {
  openQuickPanel: () => void
}

interface Props {
  ref?: React.RefObject<AttachmentButtonRef | null>
  couldAddImageFile: boolean
  extensions: string[]
  files: FileType[]
  setFiles: (files: FileType[]) => void
  ToolbarButton: any
  disabled?: boolean
}

const AttachmentButton: FC<Props> = ({
  ref,
  couldAddImageFile,
  extensions,
  files,
  setFiles,
  ToolbarButton,
  disabled
}) => {
  const { t } = useTranslation()
  const [selecting, setSelecting] = useState<boolean>(false)
  const [showUploadedFilesModal, setShowUploadedFilesModal] = useState(false)

  const onSelectFile = useCallback(async () => {
    if (selecting) {
      return
    }
    // when the number of extensions is greater than 20, use *.* to avoid selecting window lag
    const useAllFiles = extensions.length > 20

    setSelecting(true)
    const _files = await window.api.file.select({
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Files',
          extensions: useAllFiles ? ['*'] : extensions.map((i) => i.replace('.', ''))
        }
      ]
    })
    setSelecting(false)

    if (_files) {
      if (!useAllFiles) {
        setFiles([...files, ..._files])
        return
      }
      const supportedFiles = await filterSupportedFiles(_files, extensions)
      if (supportedFiles.length > 0) {
        setFiles([...files, ...supportedFiles])
      }

      if (supportedFiles.length !== _files.length) {
        window.message.info({
          key: 'file_not_supported',
          content: t('chat.input.file_not_supported_count', {
            count: _files.length - supportedFiles.length
          })
        })
      }
    }
  }, [extensions, files, selecting, setFiles, t])

  const openQuickPanel = useCallback(() => {
    onSelectFile()
  }, [onSelectFile])

  const handleSelectUploadedFiles = useCallback(
    (updatedFiles: FileType[]) => {
      setFiles(updatedFiles)
      setShowUploadedFilesModal(false)
    },
    [setFiles]
  )

  useImperativeHandle(ref, () => ({
    openQuickPanel
  }))

  const menuItems = [
    {
      key: 'upload_local',
      label: t('chat.input.upload.upload_from_local'),
      icon: <Upload size={14} />
    },
    {
      key: 'select_uploaded',
      label: t('chat.input.upload.select_uploaded'),
      icon: <FileUp size={14} />
    }
  ]

  const handleMenuClick = useCallback(
    (info: { key: string }) => {
      if (info.key === 'upload_local') {
        onSelectFile()
      } else if (info.key === 'select_uploaded') {
        setShowUploadedFilesModal(true)
      }
    },
    [onSelectFile]
  )

  return (
    <>
      <Dropdown
        menu={{ items: menuItems, onClick: handleMenuClick }}
        trigger={['click']}
        placement="topLeft">
        <Tooltip
          placement="top"
          title={couldAddImageFile ? t('chat.input.upload.label') : t('chat.input.upload.document')}
          mouseLeaveDelay={0}
          arrow>
          <ToolbarButton type="text" disabled={disabled}>
            <Paperclip size={18} style={{ color: files.length ? 'var(--color-primary)' : 'var(--color-icon)' }} />
          </ToolbarButton>
        </Tooltip>
      </Dropdown>
      <SelectUploadedFilesModal
        open={showUploadedFilesModal}
        onClose={() => setShowUploadedFilesModal(false)}
        onConfirm={handleSelectUploadedFiles}
        extensions={extensions}
        couldAddImageFile={couldAddImageFile}
        currentFiles={files}
      />
    </>
  )
}

export default AttachmentButton
