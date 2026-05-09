import { useAppDispatch, useAppSelector } from '@renderer/store'
import type { NotesSettings } from '@renderer/store/note'
import { selectNotesPath, selectNotesSettings, setCustomNotesPath, updateNotesSettings } from '@renderer/store/note'

export const useNotesSettings = () => {
  const dispatch = useAppDispatch()
  const settings = useAppSelector(selectNotesSettings)
  const notesPath = useAppSelector(selectNotesPath)

  const updateSettings = (newSettings: Partial<NotesSettings>) => {
    dispatch(updateNotesSettings(newSettings))
  }

  // 用户手动选择笔记目录
  const updateNotesPath = (path: string) => {
    dispatch(setCustomNotesPath(path))
  }

  return {
    settings,
    updateSettings,
    notesPath,
    updateNotesPath
  }
}
