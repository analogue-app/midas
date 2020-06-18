import React from "react"

import './KeyboardShortcut.scss'

const mac = window.navigator.platform.includes("Mac")

const keyMap = (key) => {
  switch(key) {
    case "CMD":
      return mac ? "⌘" : "⌃"
    case "ENTER":
      return mac ? "return" : "Enter"
    case "ESC":
      return mac ? "esc" : "Esc"
    default:
      return key
  }
}

interface Props {
  text: string
  keys: string[]
  className?: string
  vertical?: boolean
  onClick?: () => void
}

const KeyboardShortcut = ({text, keys, className, vertical, onClick}: Props) => {

  return (
    <label
      onClick={onClick}
      className={`keyboardShorcut ${onClick ? "clickable" : ""} ${className ? className : ""} ${vertical ? "column" : ""}`}>
      {keys.map(key =>
        <code
          key={key}
          className={key === "CMD" ? "cmd" : ""}
        >
          {keyMap(key)}
        </code>
      )}
      <span>{text}</span>
    </label>
  )
}

export default KeyboardShortcut
