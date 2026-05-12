import { PictureOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'

import CustomTag, { CustomTagProps } from '../CustomTag'

type Props = {
  size?: number
  showTooltip?: boolean
  showLabel?: boolean
} & Omit<CustomTagProps, 'size' | 'tooltip' | 'icon' | 'color' | 'children'>

export const ImageTag = ({ size, showTooltip, showLabel, ...restProps }: Props) => {
  const { t } = useTranslation()

  return (
    <CustomTag
      size={size}
      color="#722ed1"
      icon={<PictureOutlined style={{ fontSize: size }} />}
      tooltip={showTooltip ? t('models.type.image') : undefined}
      {...restProps}>
      {showLabel ? t('models.type.image') : ''}
    </CustomTag>
  )
}
