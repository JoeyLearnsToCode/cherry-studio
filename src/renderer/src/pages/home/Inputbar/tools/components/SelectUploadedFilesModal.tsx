import db from '@renderer/databases'
import FileManager from '@renderer/services/FileManager'
import { FileMetadata, FileTypes } from '@renderer/types'
import { formatFileSize } from '@renderer/utils'
import { Checkbox, Col, Empty, Image, Modal, Row, Spin } from 'antd'
import { useLiveQuery } from 'dexie-react-hooks'
import { FC, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

interface Props {
  open: boolean
  onClose: () => void
  onConfirm: (files: FileMetadata[]) => void
  extensions: string[]
  couldAddImageFile: boolean
}

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp']

const isImageExt = (ext: string) => IMAGE_EXTS.includes(ext.toLowerCase())

const SelectUploadedFilesModal: FC<Props> = ({ open, onClose, onConfirm, extensions, couldAddImageFile }) => {
  const { t } = useTranslation()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [previewingId, setPreviewingId] = useState<string | null>(null)

  const allFiles = useLiveQuery<FileMetadata[]>(() => db.files.orderBy('created_at').reverse().toArray(), [])

  const filteredFiles = useMemo(() => {
    if (!allFiles) return []
    const extSet = new Set(extensions.map((e) => e.toLowerCase().replace('.', '')))
    const useAll = extSet.size > 20 || extSet.has('*')
    return allFiles.filter((file) => {
      if (!couldAddImageFile && file.type === FileTypes.IMAGE) return false
      if (useAll) return true
      return extSet.has(file.ext.toLowerCase().replace('.', ''))
    })
  }, [allFiles, extensions, couldAddImageFile])

  const imageFiles = useMemo(() => filteredFiles.filter((f) => isImageExt(f.ext)), [filteredFiles])
  const otherFiles = useMemo(() => filteredFiles.filter((f) => !isImageExt(f.ext)), [filteredFiles])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleConfirm = useCallback(() => {
    const selected = filteredFiles.filter((f) => selectedIds.has(f.id))
    onConfirm(selected)
    setSelectedIds(new Set())
  }, [filteredFiles, selectedIds, onConfirm])

  const handleCancel = useCallback(() => {
    setSelectedIds(new Set())
    onClose()
  }, [onClose])

  const selectedCount = selectedIds.size

  return (
    <Modal
      title={t('chat.input.upload.select_uploaded_files')}
      open={open}
      onCancel={handleCancel}
      width={680}
      footer={
        <FooterContainer>
          <SelectedInfo>
            {selectedCount > 0 && t('chat.input.upload.selected_count', { count: selectedCount })}
          </SelectedInfo>
          <FooterButtons>
            <CancelButton onClick={handleCancel}>{t('common.cancel')}</CancelButton>
            <ConfirmButton onClick={handleConfirm} disabled={selectedCount === 0}>
              {t('common.confirm')}
            </ConfirmButton>
          </FooterButtons>
        </FooterContainer>
      }
      destroyOnClose>
      <ScrollContainer>
        {filteredFiles.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <>
            {imageFiles.length > 0 && (
              <Section>
                <Row gutter={[12, 12]}>
                  {imageFiles.map((file) => (
                    <Col key={file.id} xs={8} sm={6} md={4}>
                      <ImageCard
                        $selected={selectedIds.has(file.id)}
                        onClick={(e) => {
                          if (e.ctrlKey || e.metaKey) {
                            toggleSelect(file.id)
                          } else {
                            setPreviewingId(file.id)
                          }
                        }}>
                        <ImageWrapper>
                          <Spin size="small" />
                          <StyledImage
                            src={FileManager.getFileUrl(file)}
                            style={{ height: '100%', objectFit: 'cover', cursor: 'pointer' }}
                            preview={{
                              visible: previewingId === file.id,
                              mask: false,
                              onVisibleChange: (visible: boolean) => {
                                if (!visible) setPreviewingId(null)
                              }
                            }}
                            onLoad={(e) => {
                              const img = e.target as HTMLImageElement
                              img.parentElement?.classList.add('loaded')
                            }}
                          />
                        </ImageWrapper>
                        <ImageLabel>{FileManager.formatFileName(file)}</ImageLabel>
                        <CheckboxOverlay
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleSelect(file.id)
                          }}>
                          <Checkbox checked={selectedIds.has(file.id)} />
                        </CheckboxOverlay>
                      </ImageCard>
                    </Col>
                  ))}
                </Row>
              </Section>
            )}
            {otherFiles.length > 0 && (
              <Section>
                {otherFiles.map((file) => (
                  <FileRow key={file.id} $selected={selectedIds.has(file.id)} onClick={() => toggleSelect(file.id)}>
                    <FileRowLeft>
                      <Checkbox checked={selectedIds.has(file.id)} />
                      <FileName>{FileManager.formatFileName(file)}</FileName>
                    </FileRowLeft>
                    <FileMeta>
                      {formatFileSize(file.size)} · {file.ext}
                    </FileMeta>
                  </FileRow>
                ))}
              </Section>
            )}
          </>
        )}
      </ScrollContainer>
    </Modal>
  )
}

const ScrollContainer = styled.div`
  max-height: 60vh;
  overflow-y: auto;
  padding: 8px 0;
`

const Section = styled.div`
  margin-bottom: 16px;

  &:last-child {
    margin-bottom: 0;
  }
`

const ImageCard = styled.div<{ $selected: boolean }>`
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  border: 2px solid ${(props) => (props.$selected ? 'var(--color-primary)' : 'var(--color-border)')};
  cursor: pointer;
  transition: border-color 0.2s ease;
`

const ImageWrapper = styled.div`
  aspect-ratio: 1;
  position: relative;
  background-color: var(--color-background-soft);
  display: flex;
  align-items: center;
  justify-content: center;

  .ant-spin {
    position: absolute;
  }

  .ant-image {
    height: 100%;
    width: 100%;
    opacity: 0;
    transition: opacity 0.3s ease;

    &.loaded {
      opacity: 1;
    }
  }
`

const StyledImage = styled(Image)`
  &.ant-image {
    height: 100%;
    width: 100%;
  }
`

const ImageLabel = styled.div`
  padding: 4px 6px;
  font-size: 11px;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: var(--color-background);
`

const CheckboxOverlay = styled.div`
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 1;
`

const FileRow = styled.div<{ $selected: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  background: ${(props) => (props.$selected ? 'var(--color-background-soft)' : 'transparent')};
  border: 1px solid ${(props) => (props.$selected ? 'var(--color-primary)' : 'transparent')};
  transition: background 0.15s ease, border-color 0.15s ease;

  &:hover {
    background: var(--color-background-soft);
  }
`

const FileRowLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
`

const FileName = styled.span`
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const FileMeta = styled.span`
  font-size: 12px;
  color: var(--color-text-3);
  flex-shrink: 0;
  margin-left: 12px;
`

const FooterContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const SelectedInfo = styled.span`
  font-size: 13px;
  color: var(--color-text-secondary);
`

const FooterButtons = styled.div`
  display: flex;
  gap: 8px;
`

const CancelButton = styled.button`
  padding: 4px 16px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  font-size: 14px;

  &:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }
`

const ConfirmButton = styled.button<{ disabled?: boolean }>`
  padding: 4px 16px;
  border-radius: 6px;
  border: none;
  background: ${(props) => (props.disabled ? 'var(--color-background-soft)' : 'var(--color-primary)')};
  color: ${(props) => (props.disabled ? 'var(--color-text-3)' : '#fff')};
  cursor: ${(props) => (props.disabled ? 'not-allowed' : 'pointer')};
  font-size: 14px;

  &:hover:not(:disabled) {
    opacity: 0.85;
  }
`

export default SelectUploadedFilesModal
