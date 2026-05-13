import { TopView } from '@renderer/components/TopView'
import {
  FUNCTION_CALLING_REGEX,
  GENERATE_IMAGE_MODELS,
  isNotSupportedTextDelta,
  OPENAI_IMAGE_GENERATION_MODELS,
  REASONING_REGEX,
  VISION_REGEX
} from '@renderer/config/models'
import { useProvider } from '@renderer/hooks/useProvider'
import { Model, ModelType, Provider } from '@renderer/types'
import { getDefaultGroupName, getLowerBaseModelName } from '@renderer/utils'
import { Button, Flex, Form, FormProps, Input, Modal } from 'antd'
import { find } from 'lodash'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

interface ShowParams {
  title: string
  provider: Provider
}

interface Props extends ShowParams {
  resolve: (data: any) => void
}

type FieldType = {
  provider: string
  id: string
  name?: string
  group?: string
}

const PopupContainer: React.FC<Props> = ({ title, provider, resolve }) => {
  const [open, setOpen] = useState(true)
  const [form] = Form.useForm()
  const { addModel, models } = useProvider(provider.id)
  const { t } = useTranslation()

  const onOk = () => {
    setOpen(false)
  }

  const onCancel = () => {
    setOpen(false)
  }

  const onClose = () => {
    resolve({})
  }

  const onAddModel = (values: FieldType) => {
    const id = values.id.trim()

    if (find(models, { id })) {
      window.message.error(t('error.model.exists'))
      return
    }

    const model: Model = {
      id,
      provider: provider.id,
      name: values.name ? values.name : id.toUpperCase(),
      group: values.group ?? getDefaultGroupName(id)
    }

    // Auto-detect capabilities based on model name (direct regex, no provider lookup needed)
    const modelId = getLowerBaseModelName(id, '/')
    const modelIdLower = id.toLowerCase()
    const capabilities: { type: ModelType; isUserSelected?: boolean }[] = []
    if (VISION_REGEX.test(modelId)) capabilities.push({ type: 'vision', isUserSelected: true })
    if (REASONING_REGEX.test(modelId)) capabilities.push({ type: 'reasoning', isUserSelected: true })
    if (FUNCTION_CALLING_REGEX.test(modelId)) capabilities.push({ type: 'function_calling', isUserSelected: true })
    if (
      GENERATE_IMAGE_MODELS.some((m) => modelId.includes(m)) ||
      OPENAI_IMAGE_GENERATION_MODELS.some((m) => modelId.includes(m)) ||
      modelIdLower.includes('image')
    ) {
      capabilities.push({ type: 'image', isUserSelected: true })
      if (!capabilities.some((c) => c.type === 'vision')) {
        capabilities.push({ type: 'vision', isUserSelected: true })
      }
    }

    addModel({
      ...model,
      supported_text_delta: !isNotSupportedTextDelta(model),
      capabilities: capabilities.length > 0 ? capabilities : undefined
    })

    return true
  }

  const onFinish: FormProps<FieldType>['onFinish'] = (values) => {
    const id = values.id.trim().replaceAll('，', ',')

    if (id.includes(',')) {
      const ids = id.split(',')
      ids.forEach((id) => onAddModel({ id, name: id } as FieldType))
      resolve({})
      return
    }

    if (onAddModel(values)) {
      resolve({})
    }
  }

  return (
    <Modal
      title={title}
      open={open}
      onOk={onOk}
      onCancel={onCancel}
      maskClosable={false}
      afterClose={onClose}
      footer={null}
      transitionName="animation-move-down"
      centered>
      <Form
        form={form}
        labelCol={{ flex: '110px' }}
        labelAlign="left"
        colon={false}
        style={{ marginTop: 25 }}
        onFinish={onFinish}>
        <Form.Item
          name="id"
          label={t('settings.models.add.model_id.label')}
          tooltip={t('settings.models.add.model_id.tooltip')}
          rules={[{ required: true }]}>
          <Input
            placeholder={t('settings.models.add.model_id.placeholder')}
            spellCheck={false}
            maxLength={200}
            onChange={(e) => {
              form.setFieldValue('name', e.target.value)
              form.setFieldValue('group', getDefaultGroupName(e.target.value, provider.id))
            }}
          />
        </Form.Item>
        <Form.Item
          name="name"
          label={t('settings.models.add.model_name.label')}
          tooltip={t('settings.models.add.model_name.placeholder')}>
          <Input placeholder={t('settings.models.add.model_name.placeholder')} spellCheck={false} />
        </Form.Item>
        <Form.Item
          name="group"
          label={t('settings.models.add.group_name.label')}
          tooltip={t('settings.models.add.group_name.tooltip')}>
          <Input placeholder={t('settings.models.add.group_name.placeholder')} spellCheck={false} />
        </Form.Item>
        <Form.Item style={{ marginBottom: 8, textAlign: 'center' }}>
          <Flex justify="end" align="center" style={{ position: 'relative' }}>
            <Button type="primary" htmlType="submit" size="middle">
              {t('settings.models.add.add_model')}
            </Button>
          </Flex>
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default class AddModelPopup {
  static topviewId = 0
  static hide() {
    TopView.hide('AddModelPopup')
  }
  static show(props: ShowParams) {
    return new Promise<any>((resolve) => {
      TopView.show(
        <PopupContainer
          {...props}
          resolve={(v) => {
            resolve(v)
            this.hide()
          }}
        />,
        'AddModelPopup'
      )
    })
  }
}
