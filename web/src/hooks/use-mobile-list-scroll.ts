import { useLayoutEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

export function useMobileListScroll(selected: number | null) {
  const listPosition = useRef<number | null>(null)
  const navigate = useNavigate()

  useLayoutEffect(() => {
    if (selected) {
      window.scrollTo({ top: 0, behavior: 'instant' })
      return
    }
    if (listPosition.current !== null) {
      window.scrollTo({ top: listPosition.current, behavior: 'instant' })
      listPosition.current = null
    }
  }, [selected])

  return {
    rememberScroll: () => {
      listPosition.current = window.scrollY
    },
    returnToList: (showList: () => void) => {
      if (listPosition.current === null) showList()
      else void navigate(-1)
    },
  }
}
