"use client"

import { useEffect, useState } from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const desktopQuery = window.matchMedia(
      `(min-width: ${MOBILE_BREAKPOINT}px)`
    )
    const updateIsMobile = () => {
      setIsMobile(!desktopQuery.matches)
    }

    desktopQuery.addEventListener("change", updateIsMobile)
    updateIsMobile()

    return () => {
      desktopQuery.removeEventListener("change", updateIsMobile)
    }
  }, [])

  return isMobile
}
