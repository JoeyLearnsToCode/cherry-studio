import CodeEditor from '@renderer/components/CodeEditor'
import { TopView } from '@renderer/components/TopView'
import { useProvider } from '@renderer/hooks/useProvider'
import { Model } from '@renderer/types'
import { Modal, Space, Tabs } from 'antd'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SettingHelpText } from '../..'

interface ShowParams {
  model: Model
  providerId: string
}

interface Props extends ShowParams {
  resolve: (data: any) => void
}

const PopupContainer: React.FC<Props> = ({ model, providerId, resolve }) => {
  const [open, setOpen] = useState(true)
  const { t } = useTranslation()
  const { updateModel } = useProvider(providerId)

  const [headerText, setHeaderText] = useState<string>(JSON.stringify(model.extra_headers || {}, null, 2))
  const [bodyText, setBodyText] = useState<string>(JSON.stringify(model.extra_body || {}, null, 2))

  const onSave = useCallback(() => {
    try {
      const headers = headerText.trim() ? JSON.parse(headerText) : {}
      const body = bodyText.trim() ? JSON.parse(bodyText) : {}
      updateModel({ ...model, extra_headers: headers, extra_body: body })
      window.message.success({ content: t('message.save.success.title') })
    } catch (error) {
      window.message.error({ content: t('settings.provider.copilot.invalid_json') })
    }
  }, [headerText, bodyText, model, t, updateModel])

  const onOk = () => {
    onSave()
    setOpen(false)
  }

  const onCancel = () => {
    setOpen(false)
  }

  const onClose = () => {
    resolve({})
  }

  ModelCustomSettingsPopup.hide = onCancel

  const editorOptions = {
    lint: true,
    lineNumbers: true,
    foldGutter: true,
    highlightActiveLine: true,
    keymap: true
  }

  return (
    <Modal
      title={`${model.name} - ${t('settings.provider.copilot.model_custom_settings')}`}
      open={open}
      onOk={onOk}
      onCancel={onCancel}
      afterClose={onClose}
      maskClosable={false}
      transitionName="animation-move-down"
      centered>
      <Tabs
        defaultActiveKey="headers"
        items={[
          {
            key: 'headers',
            label: t('settings.provider.copilot.custom_headers'),
            children: (
              <Space.Compact direction="vertical" style={{ width: '100%' }}>
                <SettingHelpText>{t('settings.provider.copilot.headers_description')}</SettingHelpText>
                <CodeEditor
                  value={headerText}
                  language="json"
                  onChange={(value) => setHeaderText(value)}
                  placeholder={`{\n  "Header-Name": "Header-Value"\n}`}
                  height="55vh"
                  expanded={false}
                  wrapped
                  options={editorOptions}
                />
              </Space.Compact>
            )
          },
          {
            key: 'body',
            label: t('settings.provider.copilot.custom_body'),
            children: (
              <Space.Compact direction="vertical" style={{ width: '100%' }}>
                <SettingHelpText>{t('settings.provider.copilot.body_description')}</SettingHelpText>
                <CodeEditor
                  value={bodyText}
                  language="json"
                  onChange={(value) => setBodyText(value)}
                  placeholder={`{\n  "temperature": 0.7\n}`}
                  height="55vh"
                  expanded={false}
                  wrapped
                  options={editorOptions}
                />
              </Space.Compact>
            )
          }
        ]}
      />
    </Modal>
  )
}

const TopViewKey = 'ModelCustomSettingsPopup'

export default class ModelCustomSettingsPopup {
  static topviewId = 0
  static hide() {
    TopView.hide(TopViewKey)
  }
  static show(props: ShowParams) {
    return new Promise<any>((resolve) => {
      TopView.show(
        <PopupContainer
          {...props}
          resolve={(v) => {
            resolve(v)
            TopView.hide(TopViewKey)
          }}
        />,
        TopViewKey
      )
    })
  }
}
